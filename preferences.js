// ============================================================
//  MKEpulse — server/routes/preferences.js
//  Onboarding quiz answers → user_preferences upsert
//  Also handles profile updates (name, avatar, location)
// ============================================================
'use strict';

const express = require('express');
const { requireAuth, supabaseAdmin } = require('../middleware/auth');

const router = express.Router();

// Allowed neighborhood values
const VALID_NEIGHBORHOODS = [
  'downtown', 'third_ward', 'bay_view', 'east_side',
  'riverwest', 'walkers_point', 'brady_street',
  'suburbs', 'anywhere', 'lakefront',
];

const VALID_CATEGORIES   = ['concerts', 'food', 'sports', 'arts', 'family', 'community'];
const VALID_GROUP_TYPES  = ['solo', 'partner', 'friends', 'family'];
const VALID_AGE_FILTERS  = ['all', '18plus', '21plus'];
const VALID_FREQUENCIES  = ['realtime', 'smart', 'daily', 'weekly'];

// ── GET /api/preferences ──────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('user_preferences')
    .select('*')
    .eq('user_id', req.profile.id)
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116 = not found
    return res.status(500).json({ error: 'Failed to fetch preferences' });
  }

  res.json({ preferences: data ?? null, has_completed_quiz: !!data });
});

// ── POST /api/preferences ─────────────────────────────────────
// Called after completing onboarding quiz (full upsert)
router.post('/', requireAuth, async (req, res) => {
  const {
    categories, budget_max, include_free, flash_deals_only,
    neighborhoods, geo_radius_miles, group_type, age_filter,
    notif_frequency, push_enabled, parking_alerts, max_parking_walk,
  } = req.body;

  // ── Validate ──────────────────────────────────────────────
  const errors = [];

  if (!Array.isArray(categories) || categories.length === 0) {
    errors.push('categories: must be a non-empty array');
  } else if (!categories.every(c => VALID_CATEGORIES.includes(c))) {
    errors.push(`categories: invalid values. Allowed: ${VALID_CATEGORIES.join(', ')}`);
  }

  if (budget_max !== null && budget_max !== undefined) {
    if (typeof budget_max !== 'number' || budget_max < 0) {
      errors.push('budget_max: must be null or a non-negative number');
    }
  }

  if (Array.isArray(neighborhoods)) {
    const invalid = neighborhoods.filter(n => !VALID_NEIGHBORHOODS.includes(n));
    if (invalid.length > 0) {
      errors.push(`neighborhoods: invalid values: ${invalid.join(', ')}`);
    }
  }

  if (geo_radius_miles !== undefined) {
    const r = parseFloat(geo_radius_miles);
    if (isNaN(r) || r < 0.5 || r > 50) {
      errors.push('geo_radius_miles: must be between 0.5 and 50');
    }
  }

  if (group_type && !VALID_GROUP_TYPES.includes(group_type)) {
    errors.push(`group_type: must be one of ${VALID_GROUP_TYPES.join(', ')}`);
  }

  if (age_filter && !VALID_AGE_FILTERS.includes(age_filter)) {
    errors.push(`age_filter: must be one of ${VALID_AGE_FILTERS.join(', ')}`);
  }

  if (notif_frequency && !VALID_FREQUENCIES.includes(notif_frequency)) {
    errors.push(`notif_frequency: must be one of ${VALID_FREQUENCIES.join(', ')}`);
  }

  if (errors.length > 0) {
    return res.status(422).json({ error: 'Validation failed', details: errors });
  }

  // ── Upsert ────────────────────────────────────────────────
  const payload = {
    user_id:          req.profile.id,
    categories:       categories ?? [],
    budget_max:       budget_max ?? null,
    include_free:     include_free ?? true,
    flash_deals_only: flash_deals_only ?? false,
    neighborhoods:    neighborhoods ?? [],
    geo_radius_miles: parseFloat(geo_radius_miles ?? 3.0),
    group_type:       group_type ?? null,
    age_filter:       age_filter ?? 'all',
    notif_frequency:  notif_frequency ?? 'smart',
    push_enabled:     push_enabled ?? true,
    parking_alerts:   parking_alerts ?? true,
    max_parking_walk: max_parking_walk ?? 10,
    updated_at:       new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin
    .from('user_preferences')
    .upsert(payload, { onConflict: 'user_id' })
    .select()
    .single();

  if (error) {
    console.error('[preferences] upsert error:', error);
    return res.status(500).json({ error: 'Failed to save preferences' });
  }

  res.json({ preferences: data, saved: true });
});

// ── PATCH /api/preferences ────────────────────────────────────
// Partial update — e.g. from settings screen
router.patch('/', requireAuth, async (req, res) => {
  const allowed = [
    'categories', 'budget_max', 'include_free', 'flash_deals_only',
    'neighborhoods', 'geo_radius_miles', 'group_type', 'age_filter',
    'notif_frequency', 'push_enabled', 'parking_alerts', 'max_parking_walk',
  ];

  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from('user_preferences')
    .update(updates)
    .eq('user_id', req.profile.id)
    .select()
    .single();

  if (error) {
    console.error('[preferences] patch error:', error);
    return res.status(500).json({ error: 'Failed to update preferences' });
  }

  res.json({ preferences: data, updated: true });
});

// ── PATCH /api/preferences/location ──────────────────────────
// Called by frontend geo watchPosition — updates last known position
router.patch('/location', requireAuth, async (req, res) => {
  const { lat, lng } = req.body;

  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return res.status(400).json({ error: 'lat and lng must be numbers' });
  }

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return res.status(400).json({ error: 'Invalid coordinates' });
  }

  const { error } = await supabaseAdmin
    .from('profiles')
    .update({
      last_lat:         lat,
      last_lng:         lng,
      last_location_at: new Date().toISOString(),
    })
    .eq('id', req.profile.id);

  if (error) {
    return res.status(500).json({ error: 'Failed to update location' });
  }

  // Trigger geo proximity check (emits socket event if needed)
  // This is handled by the geo engine in geo.js
  res.json({ updated: true, lat, lng });
});

module.exports = router;
