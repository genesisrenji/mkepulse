// ============================================================
//  MKEpulse — server/routes/feed.js
//  GET /api/feed — personalized, scored, filtered event feed
// ============================================================
'use strict';

const express       = require('express');
const { optionalAuth, supabaseAdmin } = require('../middleware/auth');
const { buildFeed } = require('../lib/feed-pipeline');

const router = express.Router();

// ── GET /api/feed ─────────────────────────────────────────────
// Query params:
//   lat     float   User latitude (optional — overrides stored)
//   lng     float   User longitude
//   limit   int     Max events to return (default 50, cap 100)
//   offset  int     Pagination offset (default 0)
router.get('/', optionalAuth, async (req, res) => {
  try {
    const userId = req.profile?.id ?? null;
    const isPro  = req.isPro ?? false;

    // Prefer live lat/lng from request, fall back to stored profile location
    let userLat = req.query.lat  != null ? parseFloat(req.query.lat)  : null;
    let userLng = req.query.lng  != null ? parseFloat(req.query.lng)  : null;

    if ((userLat == null || userLng == null) && req.profile?.last_lat) {
      userLat = req.profile.last_lat;
      userLng = req.profile.last_lng;
    }

    const limit  = Math.min(parseInt(req.query.limit  ?? 50), 100);
    const offset = Math.max(parseInt(req.query.offset ?? 0),  0);

    const result = await buildFeed({ userId, userLat, userLng, isPro, limit, offset });

    // Cache header: public short-lived for CDN, private for personalized
    const cacheHeader = userId
      ? 'private, max-age=30'
      : 'public,  max-age=60';

    res.set('Cache-Control', cacheHeader);
    res.json(result);
  } catch (err) {
    console.error('[feed] error:', err);
    res.status(500).json({ error: 'Failed to build feed' });
  }
});

// ── POST /api/feed/interaction ────────────────────────────────
// Records user interactions (view, save, checkin, dismiss)
// Used by recommendation engine to improve future scoring
router.post('/interaction', optionalAuth, async (req, res) => {
  if (!req.profile) return res.status(401).json({ error: 'Auth required' });

  const { event_id, action } = req.body;
  const VALID_ACTIONS = ['view', 'save', 'checkin', 'dismiss'];

  if (!event_id || !action) {
    return res.status(400).json({ error: 'event_id and action required' });
  }
  if (!VALID_ACTIONS.includes(action)) {
    return res.status(400).json({ error: `action must be one of: ${VALID_ACTIONS.join(', ')}` });
  }

  const { error } = await supabaseAdmin
    .from('user_event_interactions')
    .upsert(
      { user_id: req.profile.id, event_id, action },
      { onConflict: 'user_id,event_id,action', ignoreDuplicates: true }
    );

  if (error) return res.status(500).json({ error: 'Failed to record interaction' });
  res.json({ recorded: true });
});

module.exports = router;
