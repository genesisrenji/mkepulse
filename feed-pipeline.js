// ============================================================
//  MKEpulse — server/lib/feed-pipeline.js
//  Preference-to-feed-filter pipeline
//
//  Flow:
//  1. Fetch raw events from Supabase (active, verified, 24hr window)
//  2. Apply hard filters (budget, age, neighborhoods) from user prefs
//  3. Score each event (category match, distance, flash bonus)
//  4. Attach nearest parking garage to each event
//  5. Sort: flash deals → nearby → ai_found → all (by score desc)
//  6. Enforce free-tier cap (8 events max)
//  7. Return structured { sections, events, meta }
// ============================================================
'use strict';

const { supabaseAdmin } = require('../middleware/auth');

// ── Constants ─────────────────────────────────────────────────
const FREE_TIER_LIMIT    = 8;
const EARTH_RADIUS_MILES = 3958.8;
const NEARBY_RADIUS_MI   = 3.0;    // default nearby section threshold
const PARKING_RADIUS_MI  = 0.5;    // max distance to attach a garage to an event

// ── Entry point ───────────────────────────────────────────────
async function buildFeed({ userId, userLat, userLng, isPro, limit = 50, offset = 0 }) {
  // 1. Fetch user preferences (or defaults for anonymous/no-quiz users)
  const prefs = await fetchPrefs(userId);

  // 2. Fetch active events from Supabase
  const rawEvents = await fetchActiveEvents();

  // 3. Fetch parking garages (for attaching to events)
  const garages = await fetchParkingGarages();

  // 4. Apply hard filters
  const filtered = applyHardFilters(rawEvents, prefs, isPro);

  // 5. Score + annotate each event
  const scored = filtered.map(event => ({
    ...event,
    relevance_score: scoreEvent(event, prefs, userLat, userLng),
    distance_mi:     userLat != null ? haversine(userLat, userLng, event.lat, event.lng) : null,
    section:         classifySection(event, userLat, userLng, prefs.geo_radius_miles),
    nearest_parking: findNearestParking(event, garages),
  }));

  // 6. Sort
  const sorted = sortFeed(scored);

  // 7. Enforce free cap
  const capped     = isPro ? sorted : sorted.slice(0, FREE_TIER_LIMIT);
  const paginated  = capped.slice(offset, offset + limit);

  // 8. Group into sections
  const sections = groupSections(paginated);

  return {
    events:   paginated,
    sections,
    meta: {
      total:      sorted.length,
      returned:   paginated.length,
      is_pro:     isPro,
      free_limit: isPro ? null : FREE_TIER_LIMIT,
      user_lat:   userLat ?? null,
      user_lng:   userLng ?? null,
      prefs_applied: !!prefs.user_id,
    },
  };
}

// ── Fetch helpers ─────────────────────────────────────────────

async function fetchPrefs(userId) {
  if (!userId) return defaultPrefs();

  const { data, error } = await supabaseAdmin
    .from('user_preferences')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error || !data) return defaultPrefs();
  return data;
}

async function fetchActiveEvents() {
  const { data, error } = await supabaseAdmin
    .from('events')
    .select('*')
    .eq('is_active', true)
    .eq('ai_verified', true)
    .eq('ai_pending_review', false)
    .gt('starts_at', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()) // started < 2hr ago
    .lt('starts_at', new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()) // starts < 24hr from now
    .order('starts_at', { ascending: true });

  if (error) {
    console.error('[feed-pipeline] fetchActiveEvents error:', error);
    return [];
  }
  return data ?? [];
}

async function fetchParkingGarages() {
  const { data, error } = await supabaseAdmin
    .from('parking_garages')
    .select('id, name, lat, lng, available_spaces, total_spaces, status, hourly_rate_cents')
    .eq('is_active', true);

  if (error) {
    console.error('[feed-pipeline] fetchParkingGarages error:', error);
    return [];
  }
  return data ?? [];
}

// ── Hard filter ───────────────────────────────────────────────
// Removes events that definitively don't match user prefs.
// Soft mismatches (partial neighborhood match etc.) are handled
// by scoring — they still appear but ranked lower.

function applyHardFilters(events, prefs, isPro) {
  return events.filter(event => {
    // Budget hard filter (Pro only)
    if (isPro && prefs.budget_max != null) {
      const eventPrice = event.price_min ?? 0;
      const isFreeEvent = eventPrice === 0;
      if (!isFreeEvent && eventPrice > prefs.budget_max) {
        return false; // over budget, exclude entirely
      }
    }

    // Flash-deals-only filter (Pro only)
    if (isPro && prefs.flash_deals_only && !event.is_flash_deal) {
      return false;
    }

    // Age filter (Pro only)
    if (isPro && prefs.age_filter === '21plus' && event.age_restriction === 'all_ages') {
      // Don't hard-exclude — just score lower (some all-ages events are still relevant)
    }

    return true;
  });
}

// ── Scoring ───────────────────────────────────────────────────
// Returns 0.0–1.0. Weights must sum to 1.0.

function scoreEvent(event, prefs, userLat, userLng) {
  let score = 0.0;

  // Category match (0.35)
  if (prefs.categories.length === 0 || prefs.categories.includes(event.category)) {
    score += 0.35;
  }

  // Budget fit (0.20)
  score += scoreBudget(event, prefs);

  // Neighborhood match (0.15)
  if (
    prefs.neighborhoods.length === 0 ||
    prefs.neighborhoods.includes('anywhere') ||
    prefs.neighborhoods.includes(event.neighborhood)
  ) {
    score += 0.15;
  } else {
    score += 0.0; // no match
  }

  // Geo distance (0.15)
  if (userLat != null && event.lat != null) {
    score += scoreDistance(userLat, userLng, event.lat, event.lng, prefs.geo_radius_miles);
  } else {
    score += 0.075; // no location — give half credit
  }

  // Flash deal bonus (0.10)
  if (event.is_flash_deal) score += 0.10;

  // Live event bonus (0.05)
  if (event.is_live) score += 0.05;

  return Math.max(0, Math.min(1, score));
}

function scoreBudget(event, prefs) {
  const W = 0.20;
  if (prefs.budget_max == null) return W; // no limit
  const price = event.price_min ?? 0;
  if (price === 0) return W; // free = always full score
  if (price <= prefs.budget_max) {
    // Proportionally more score the cheaper it is relative to budget
    return W * (1.0 - (price / prefs.budget_max) * 0.5);
  }
  return -0.15; // over budget penalty
}

function scoreDistance(lat1, lng1, lat2, lng2, radiusMi) {
  const W = 0.15;
  if (lat2 == null || lng2 == null) return W * 0.5;
  const dist = haversine(lat1, lng1, lat2, lng2);
  if (dist <= 1.0)            return W;           // under 1 mile = full score
  if (dist <= radiusMi)       return W * (1.0 - dist / radiusMi);
  return 0.0;                                     // outside radius
}

// ── Section classification ────────────────────────────────────

function classifySection(event, userLat, userLng, radiusMi) {
  const AI_SOURCES = ['instagram', 'onmilwaukee', 'milwaukee_com'];

  if (AI_SOURCES.includes(event.source) && (event.ai_confidence ?? 0) >= 0.7) {
    return 'ai_found';
  }

  if (userLat != null && event.lat != null) {
    const dist = haversine(userLat, userLng, event.lat, event.lng);
    if (dist <= (radiusMi || NEARBY_RADIUS_MI)) return 'nearby';
  }

  return 'all';
}

// ── Nearest parking attachment ────────────────────────────────

function findNearestParking(event, garages) {
  if (event.lat == null || garages.length === 0) return null;

  let nearest     = null;
  let nearestDist = Infinity;

  for (const g of garages) {
    if (!g.lat || g.available_spaces === 0) continue;
    const dist = haversine(event.lat, event.lng, g.lat, g.lng);
    if (dist < nearestDist && dist <= PARKING_RADIUS_MI) {
      nearestDist = dist;
      nearest     = g;
    }
  }

  if (!nearest) return null;

  return {
    garage_id:         nearest.id,
    name:              nearest.name,
    available_spaces:  nearest.available_spaces,
    status:            nearest.status,
    distance_mi:       Math.round(nearestDist * 10) / 10,
    walk_minutes:      Math.round(nearestDist * 20), // ~20 min/mile walking
    hourly_rate_cents: nearest.hourly_rate_cents,
  };
}

// ── Sorting ───────────────────────────────────────────────────

function sortFeed(events) {
  const sectionOrder = { nearby: 0, ai_found: 1, all: 2 };
  return [...events].sort((a, b) => {
    // Flash deals always first
    if (a.is_flash_deal !== b.is_flash_deal) return a.is_flash_deal ? -1 : 1;
    // Then by section
    const sA = sectionOrder[a.section] ?? 3;
    const sB = sectionOrder[b.section] ?? 3;
    if (sA !== sB) return sA - sB;
    // Then by relevance score
    if (b.relevance_score !== a.relevance_score) return b.relevance_score - a.relevance_score;
    // Then by start time
    return new Date(a.starts_at) - new Date(b.starts_at);
  });
}

// ── Section grouping ──────────────────────────────────────────

function groupSections(events) {
  return {
    nearby:   events.filter(e => e.section === 'nearby'),
    ai_found: events.filter(e => e.section === 'ai_found'),
    all:      events.filter(e => e.section === 'all'),
  };
}

// ── Haversine distance (miles) ────────────────────────────────

function haversine(lat1, lng1, lat2, lng2) {
  if (lat2 == null || lng2 == null) return Infinity;
  const toRad = d => (d * Math.PI) / 180;
  const dLat  = toRad(lat2 - lat1);
  const dLng  = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
          + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_MILES * 2 * Math.asin(Math.sqrt(Math.min(1, a)));
}

// ── Default preferences (new / anonymous users) ───────────────

function defaultPrefs() {
  return {
    user_id:          null,
    categories:       [], // empty = all categories
    budget_max:       null,
    include_free:     true,
    flash_deals_only: false,
    neighborhoods:    [],
    geo_radius_miles: 3.0,
    group_type:       null,
    age_filter:       'all',
    notif_frequency:  'smart',
    push_enabled:     true,
    parking_alerts:   true,
    max_parking_walk: 10,
  };
}

module.exports = { buildFeed, haversine, scoreEvent, findNearestParking };
