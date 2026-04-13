// ============================================================
//  MKEpulse — server/parking-worker.js
//  Polls City of Milwaukee Open Data parking API every 2 min.
//  Updates parking_garages table and broadcasts via Socket.io.
//
//  Milwaukee Open Data portal: https://data.milwaukee.gov
//  Parking dataset: requires free app token registration
// ============================================================
'use strict';

const cron = require('node-cron');
const { supabaseAdmin } = require('./middleware/auth');

// io is set by index.js after Socket.io server is created
let _io = null;
function setIO(io) { _io = io; }

// ── Milwaukee Open Data API ───────────────────────────────────
const MKE_API_BASE   = 'https://data.milwaukee.gov/resource';
const MKE_APP_TOKEN  = process.env.MKE_OPEN_DATA_APP_TOKEN;

// Known dataset IDs for Milwaukee parking
// (verify current IDs at data.milwaukee.gov before deploying)
const PARKING_DATASET_ID = 'rfs9-vgvz'; // Municipal parking structures

async function fetchMkeParking() {
  const url = `${MKE_API_BASE}/${PARKING_DATASET_ID}.json?$limit=50`;
  const headers = { 'Accept': 'application/json' };
  if (MKE_APP_TOKEN) headers['X-App-Token'] = MKE_APP_TOKEN;

  const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`MKE API error: ${res.status} ${res.statusText}`);
  return res.json();
}

// ── Normalize MKE API response to our schema ─────────────────
function normalizeGarage(raw) {
  const total     = parseInt(raw.capacity ?? raw.total_spaces ?? 0);
  const available = parseInt(raw.available_spaces ?? raw.available ?? 0);
  const pct       = total > 0 ? (total - available) / total : 0;

  let status = 'unknown';
  if (total > 0) {
    if (available === 0) status = 'full';
    else if (pct > 0.85)  status = 'limited';
    else                   status = 'available';
  }

  return {
    mke_open_data_id: raw.garage_id ?? raw.objectid ?? raw.id,
    available_spaces: available,
    total_spaces:     total,
    status,
    last_api_sync:    new Date().toISOString(),
  };
}

// ── Simulated data fallback ───────────────────────────────────
// Used when MKE Open Data API is unavailable (dev / rate limit).
// Simulates realistic real-time fluctuations.
function simulateParkingUpdate(garages) {
  return garages.map(g => {
    const delta = Math.floor(Math.random() * 10) - 4; // -4 to +5
    const available = Math.max(0, Math.min(g.total_spaces, g.available_spaces + delta));
    const pct = g.total_spaces > 0 ? (g.total_spaces - available) / g.total_spaces : 0;
    return {
      ...g,
      available_spaces: available,
      status: available === 0 ? 'full' : pct > 0.85 ? 'limited' : 'available',
      last_api_sync: new Date().toISOString(),
    };
  });
}

// ── Main poll function ────────────────────────────────────────
async function pollParking() {
  console.log('[parking-worker] polling...');

  try {
    // 1. Fetch from MKE Open Data
    let apiData = null;
    try {
      apiData = await fetchMkeParking();
    } catch (apiErr) {
      console.warn('[parking-worker] MKE API unavailable, using simulation:', apiErr.message);
    }

    // 2. Fetch our stored garages
    const { data: storedGarages, error: fetchErr } = await supabaseAdmin
      .from('parking_garages')
      .select('*')
      .eq('is_active', true);

    if (fetchErr || !storedGarages?.length) {
      console.error('[parking-worker] failed to fetch stored garages:', fetchErr);
      return;
    }

    let updates;

    if (apiData?.length > 0) {
      // 3a. Match API data to stored garages by mke_open_data_id
      updates = storedGarages.map(stored => {
        const match = apiData.find(a => a.garage_id === stored.mke_open_data_id
                                    || a.objectid  === stored.mke_open_data_id);
        if (match) {
          return { id: stored.id, ...normalizeGarage(match) };
        }
        return null;
      }).filter(Boolean);
    } else {
      // 3b. Simulate realistic fluctuations
      updates = simulateParkingUpdate(storedGarages).map(g => ({
        id:               g.id,
        available_spaces: g.available_spaces,
        status:           g.status,
        last_api_sync:    g.last_api_sync,
      }));
    }

    // 4. Batch upsert to Supabase
    if (updates.length > 0) {
      const { error: upsertErr } = await supabaseAdmin
        .from('parking_garages')
        .upsert(updates, { onConflict: 'id' });

      if (upsertErr) {
        console.error('[parking-worker] upsert error:', upsertErr);
        return;
      }
    }

    // 5. Snapshot log (time-series)
    const snapshots = (updates.length > 0 ? updates : storedGarages).map(g => ({
      garage_id:        g.id,
      available_spaces: g.available_spaces,
      total_spaces:     g.total_spaces ?? storedGarages.find(s => s.id === g.id)?.total_spaces ?? 0,
      status:           g.status,
      recorded_at:      new Date().toISOString(),
    }));

    await supabaseAdmin.from('parking_snapshots').insert(snapshots);

    // 6. Broadcast via Socket.io
    if (_io) {
      _io.emit('parking:update', {
        garages:    updates.map(u => ({
          id:               u.id,
          available_spaces: u.available_spaces,
          status:           u.status,
        })),
        updated_at: new Date().toISOString(),
      });
    }

    // 7. Check if any garages just hit capacity — create alert
    const fullGarages = updates.filter(u => u.status === 'full');
    for (const g of fullGarages) {
      const garage = storedGarages.find(s => s.id === g.id);
      if (garage) {
        const prev = garage.status;
        if (prev !== 'full') { // only alert on transition to full
          await supabaseAdmin.from('alerts').insert({
            severity:    'warning',
            title:       `Parking full: ${garage.name}`,
            description: `${garage.name} has reached capacity (${garage.total_spaces} spaces). Users are being redirected to nearby alternatives.`,
            garage_id:   garage.id,
          });

          if (_io) {
            _io.emit('alert:new', {
              alert: {
                severity: 'warning',
                title: `Parking full: ${garage.name}`,
                garage_id: garage.id,
              }
            });
          }
        }
      }
    }

    console.log(`[parking-worker] updated ${updates.length} garages`);

  } catch (err) {
    console.error('[parking-worker] unhandled error:', err);
  }
}

// ── Schedule: every 2 minutes ─────────────────────────────────
cron.schedule('*/2 * * * *', pollParking);

// Run once immediately on startup
pollParking();

module.exports = { setIO, pollParking };
