// ============================================================
//  MKEpulse — server/index.js
//  Express + Socket.io server
//  Handles: REST API, WebSocket real-time, geo proximity engine
// ============================================================
'use strict';

require('dotenv').config();

const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const cors       = require('cors');

const { requireAuth, supabaseAdmin } = require('./middleware/auth');
const { buildFeed, haversine }       = require('./lib/feed-pipeline');

// ── Route imports ─────────────────────────────────────────────
const stripeWebhookRouter  = require('./routes/stripe-webhook');
const stripeCheckoutRouter = require('./routes/stripe-checkout');
const preferencesRouter    = require('./routes/preferences');
const feedRouter           = require('./routes/feed');

const app    = express();
const server = http.createServer(app);

// ── Socket.io ─────────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin:      process.env.FRONTEND_URL ?? '*',
    methods:     ['GET', 'POST'],
    credentials: true,
  },
});

// Export io for use in other modules (parking worker, agent)
module.exports.io = io;

// ── CORS ──────────────────────────────────────────────────────
app.use(cors({
  origin:      process.env.FRONTEND_URL ?? '*',
  credentials: true,
}));

// ── Stripe webhook: raw body BEFORE express.json() ───────────
app.use(
  '/api/stripe/webhook',
  express.raw({ type: 'application/json' }),
  stripeWebhookRouter
);

// ── JSON body parser ──────────────────────────────────────────
app.use(express.json());

// ── Health check ──────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status:    'ok',
    service:   'mkepulse-server',
    timestamp: new Date().toISOString(),
    sockets:   io.engine.clientsCount,
  });
});

// ── REST routes ───────────────────────────────────────────────
app.use('/api/stripe',      stripeCheckoutRouter);
app.use('/api/preferences', preferencesRouter);
app.use('/api/feed',        feedRouter);

// ── POST /api/geo/update ─────────────────────────────────────
// Called by frontend watchPosition. Updates profile location
// and runs proximity check — emits geo:proximity_alert if needed.
app.post('/api/geo/update', requireAuth, async (req, res) => {
  const { lat, lng } = req.body;
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return res.status(400).json({ error: 'lat and lng required' });
  }

  // Pro-only geo alerts
  if (!req.isPro) {
    return res.json({ checked: false, reason: 'pro_required' });
  }

  // Update stored location
  await supabaseAdmin
    .from('profiles')
    .update({ last_lat: lat, last_lng: lng, last_location_at: new Date().toISOString() })
    .eq('id', req.profile.id);

  // Run proximity check
  await checkProximity({ userId: req.profile.id, lat, lng, io });

  res.json({ checked: true });
});

// ── POST /api/agent/trigger ───────────────────────────────────
// Admin: force a crawl cycle immediately
app.post('/api/agent/trigger', requireAuth, async (req, res) => {
  if (!req.isAdmin) return res.status(403).json({ error: 'Admin only' });
  try {
    // Dynamically require agent to avoid circular deps
    const { triggerCrawl } = require('../agent');
    triggerCrawl(io);
    res.json({ triggered: true });
  } catch (err) {
    res.status(500).json({ error: 'Agent trigger failed' });
  }
});

// ── Socket.io connection handling ────────────────────────────
io.on('connection', (socket) => {
  console.log(`[socket] client connected: ${socket.id}`);

  // Client sends auth token on connect to join personal room
  socket.on('authenticate', async ({ token }) => {
    try {
      const { data: { user } } = await supabaseAdmin.auth.getUser(token);
      if (user) {
        socket.join(`user:${user.id}`);
        socket.userId = user.id;
        console.log(`[socket] user ${user.id} joined personal room`);
      }
    } catch {}
  });

  socket.on('disconnect', () => {
    console.log(`[socket] client disconnected: ${socket.id}`);
  });
});

// ── Geo proximity engine ─────────────────────────────────────
// Runs on every geo:update. Checks all active events against
// user's position and emits proximity alerts.

async function checkProximity({ userId, lat, lng, io }) {
  try {
    // Fetch user preferences for radius
    const { data: prefs } = await supabaseAdmin
      .from('user_preferences')
      .select('geo_radius_miles, categories, parking_alerts')
      .eq('user_id', userId)
      .single();

    const radiusMi = prefs?.geo_radius_miles ?? 3.0;

    // Build a lightweight feed to get nearby events + parking
    const { sections } = await buildFeed({ userId, userLat: lat, userLng: lng, isPro: true, limit: 20 });
    const nearbyEvents = sections.nearby ?? [];

    for (const event of nearbyEvents) {
      const distMi = haversine(lat, lng, event.lat, event.lng);
      if (distMi > radiusMi) continue;

      // Category filter — only alert for preferred categories
      if (prefs?.categories?.length > 0 && !prefs.categories.includes(event.category)) continue;

      // Emit to user's personal socket room
      io.to(`user:${userId}`).emit('geo:proximity_alert', {
        event,
        distance_mi:     Math.round(distMi * 10) / 10,
        nearest_parking: event.nearest_parking,
        user_id:         userId,
      });

      // Create a DB alert for the alerts screen
      await supabaseAdmin.from('alerts').insert({
        severity:    'info',
        title:       `You're near ${event.venue_name}`,
        description: `${event.title} — ${Math.round(distMi * 10) / 10} mi away. ${
          event.nearest_parking
            ? `Parking: ${event.nearest_parking.name} (${event.nearest_parking.available_spaces} open)`
            : ''
        }`,
        event_id: event.id,
        push_sent: true,
      });
    }
  } catch (err) {
    console.error('[geo-proximity] error:', err);
  }
}

// ── Expose checkProximity and io for other modules ───────────
module.exports.checkProximity = checkProximity;

// ── Start server ──────────────────────────────────────────────
const PORT = process.env.SOCKET_PORT ?? 3001;
server.listen(PORT, () => {
  console.log(`[mkepulse-server] running on port ${PORT}`);

  // Start parking worker
  require('./parking-worker');
  console.log('[mkepulse-server] parking worker started');
});
