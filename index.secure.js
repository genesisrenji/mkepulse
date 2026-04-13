// ============================================================
//  MKEpulse — server/index.secure.js
//  Full server entry point with all 3 security tiers wired in.
//  Replace server/index.js with this file.
//
//  Security layers applied in order:
//  1. Helmet (HTTP security headers)
//  2. Global rate limiter
//  3. CORS with strict origin whitelist
//  4. Content-type enforcement
//  5. Body size limit
//  6. SQL injection guard
//  7. Route-specific rate limiters
//  8. Auth middleware (requireAuth / optionalAuth)
//  9. RBAC can() permission checks
// 10. Input validation schemas
// 11. Business logic handlers
// ============================================================
'use strict';

require('dotenv').config();

const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const helmet     = require('helmet');

// ── Security imports ──────────────────────────────────────────
const {
  globalLimiter, authLimiter, authSlowDown, stripeLimiter,
  feedLimiter, geoLimiter, preferencesLimiter, adminLimiter,
  agentTriggerLimiter, rateLimitInfo,
} = require('./security/rate-limiter');

const { sqlGuard, requireJSON, maxBodySize, validate } = require('./security/validator');
const { can, requireServiceAuth, serviceClient }        = require('./security/rbac');
const { requireAuth, optionalAuth }                     = require('./middleware/auth');
const { buildFeed, haversine }                          = require('./lib/feed-pipeline');

// ── Route imports ─────────────────────────────────────────────
const stripeWebhookRouter  = require('./routes/stripe-webhook');
const stripeCheckoutRouter = require('./routes/stripe-checkout');
const preferencesRouter    = require('./routes/preferences');
const feedRouter           = require('./routes/feed');

const app    = express();
const server = http.createServer(app);

// ══════════════════════════════════════════════════════════════
//  LAYER 1: HTTP security headers (Helmet)
// ══════════════════════════════════════════════════════════════
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:     ["'self'"],
      scriptSrc:      ["'self'", 'https://js.stripe.com'],
      frameSrc:       ['https://js.stripe.com'],
      connectSrc:     ["'self'", 'https://*.supabase.co', 'https://api.stripe.com'],
      imgSrc:         ["'self'", 'data:', 'https:'],
      styleSrc:       ["'self'", "'unsafe-inline'"],
      fontSrc:        ["'self'", 'https:'],
      objectSrc:      ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: false,  // needed for Stripe iframes
  hsts: {
    maxAge:            31536000,
    includeSubDomains: true,
    preload:           true,
  },
  referrerPolicy:           { policy: 'strict-origin-when-cross-origin' },
  xContentTypeOptions:      true,
  xFrameOptions:            { action: 'deny' },
  xXssProtection:           false,   // disabled — modern browsers use CSP
  permittedCrossDomainPolicies: { permittedPolicies: 'none' },
}));

// ══════════════════════════════════════════════════════════════
//  LAYER 2: Global rate limiter — all routes
// ══════════════════════════════════════════════════════════════
app.use(globalLimiter);
app.use(rateLimitInfo);

// ══════════════════════════════════════════════════════════════
//  LAYER 3: CORS — strict origin whitelist
// ══════════════════════════════════════════════════════════════
const ALLOWED_ORIGINS = [
  process.env.FRONTEND_URL,
  'https://mkepulse.vercel.app',
  'https://mkepulse.com',
  'https://www.mkepulse.com',
  // Dev only (removed in production via NODE_ENV check):
  ...(process.env.NODE_ENV !== 'production' ? ['http://localhost:5173', 'http://localhost:3000'] : []),
].filter(Boolean);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Service-Token');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ══════════════════════════════════════════════════════════════
//  STRIPE WEBHOOK — raw body, before JSON parser
//  No rate limit on webhook (Stripe IPs, signature-verified)
// ══════════════════════════════════════════════════════════════
app.use(
  '/api/stripe/webhook',
  express.raw({ type: 'application/json' }),
  stripeWebhookRouter
);

// ══════════════════════════════════════════════════════════════
//  LAYERS 4–6: Body parsing + content guards
// ══════════════════════════════════════════════════════════════
app.use(express.json({ limit: '50kb' }));   // hard body size limit
app.use(requireJSON);                        // reject non-JSON POST/PATCH
app.use(maxBodySize(51200));                 // belt+suspenders: 50KB
app.use(sqlGuard);                           // SQL injection pattern guard

// ══════════════════════════════════════════════════════════════
//  HEALTH — unauthenticated, not rate-limited
// ══════════════════════════════════════════════════════════════
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'mkepulse-server', ts: new Date().toISOString() });
});

// ══════════════════════════════════════════════════════════════
//  AUTH ROUTES — tightest rate limits + slow-down
// ══════════════════════════════════════════════════════════════
// Supabase Auth handles login/signup on their side.
// These are our supplementary auth endpoints.
app.use('/api/auth', authSlowDown, authLimiter);

// ══════════════════════════════════════════════════════════════
//  FEED ROUTES
//  - optionalAuth: works for anon + authenticated users
//  - feedLimiter: tier-aware (60/hr free, 600/hr pro)
//  - validate: query param validation
// ══════════════════════════════════════════════════════════════
app.use('/api/feed',
  optionalAuth,
  feedLimiter,
  feedRouter
);

// ══════════════════════════════════════════════════════════════
//  PREFERENCES ROUTES
//  - requireAuth: must be logged in
//  - can('preferences:write:own'): own data only
//  - preferencesLimiter: 30/hr
//  - validate: schema enforcement
// ══════════════════════════════════════════════════════════════
app.use('/api/preferences',
  requireAuth,
  preferencesLimiter,
  can('preferences:write:own'),
  preferencesRouter
);

// ══════════════════════════════════════════════════════════════
//  STRIPE CHECKOUT ROUTES
//  - requireAuth: must be logged in to subscribe
//  - stripeLimiter: 20 sessions/hr
// ══════════════════════════════════════════════════════════════
app.use('/api/stripe',
  requireAuth,
  stripeLimiter,
  stripeCheckoutRouter
);

// ══════════════════════════════════════════════════════════════
//  GEO UPDATE
//  - requireAuth + can('geo:alerts') — Pro only
//  - geoLimiter: 1 update per 10 seconds
//  - validate: lat/lng schema
// ══════════════════════════════════════════════════════════════
app.post('/api/geo/update',
  requireAuth,
  geoLimiter,
  can('geo:alerts'),
  validate('geoUpdate'),
  async (req, res) => {
    const { lat, lng } = req.body;
    await serviceClient.from('profiles').update({
      last_lat: lat, last_lng: lng, last_location_at: new Date().toISOString()
    }).eq('id', req.profile.id);

    // io from module scope
    await checkProximity({ userId: req.profile.id, lat, lng, io });
    res.json({ checked: true });
  }
);

// ══════════════════════════════════════════════════════════════
//  ADMIN ROUTES — strict gating
//  Every admin route requires:
//  1. requireAuth
//  2. can('admin:*') — role check
//  3. adminLimiter — 200/hr
// ══════════════════════════════════════════════════════════════

// Agent: trigger manual crawl
app.post('/api/admin/agent/trigger',
  requireAuth,
  can('admin:agent:trigger'),
  agentTriggerLimiter,
  async (req, res) => {
    try {
      const { triggerCrawl } = require('../agent');
      triggerCrawl(io);
      await serviceClient.from('audit_log').insert({
        actor_id:    req.profile.id,
        actor_role:  req.profile.role,
        action:      'agent.trigger_manual',
        resource:    'crawl_agent',
        resource_id: null,
      });
      res.json({ triggered: true, ts: new Date().toISOString() });
    } catch (err) {
      res.status(500).json({ error: 'Agent trigger failed' });
    }
  }
);

// Alert: resolve
app.patch('/api/admin/alerts/:alertId/resolve',
  requireAuth,
  can('alerts:resolve'),
  adminLimiter,
  validate('adminAlertResolve'),
  async (req, res) => {
    const { alertId } = req.params;
    const { error } = await serviceClient
      .from('alerts')
      .update({
        is_resolved:  true,
        resolved_at:  new Date().toISOString(),
        resolved_by:  req.profile.id,
      })
      .eq('id', alertId);

    if (error) return res.status(500).json({ error: 'Failed to resolve alert' });
    res.json({ resolved: true, alertId });
  }
);

// Event: approve AI-discovered event
app.patch('/api/admin/events/:eventId/review',
  requireAuth,
  can('events:approve'),
  adminLimiter,
  validate('adminEventAction'),
  async (req, res) => {
    const { eventId }          = req.params;
    const { action, reason }   = req.body;
    const approved             = action === 'approve';

    const { error } = await serviceClient
      .from('events')
      .update({
        ai_pending_review: false,
        ai_verified:       approved,
        is_active:         approved,
      })
      .eq('id', eventId);

    if (error) return res.status(500).json({ error: 'Failed to update event' });

    await serviceClient.from('audit_log').insert({
      actor_id:    req.profile.id,
      actor_role:  req.profile.role,
      action:      `event.${action}`,
      resource:    'events',
      resource_id: eventId,
      new_data:    { action, reason },
    });

    res.json({ [action + 'd']: true, eventId });
  }
);

// Admin: dashboard metrics
app.get('/api/admin/metrics',
  requireAuth,
  can('admin:dashboard'),
  adminLimiter,
  async (req, res) => {
    const { data, error } = await serviceClient
      .from('v_subscription_metrics')
      .select('*')
      .single();
    if (error) return res.status(500).json({ error: 'Failed to fetch metrics' });
    res.json(data);
  }
);

// ══════════════════════════════════════════════════════════════
//  SERVICE-TO-SERVICE ROUTES (crawl agent → server)
//  Uses X-Service-Token header, NOT user JWT
// ══════════════════════════════════════════════════════════════
app.post('/internal/agent/events',
  requireServiceAuth,
  can('service:crawl'),
  async (req, res) => {
    // Crawl agent POSTs new events via this endpoint
    const { events } = req.body;
    if (!Array.isArray(events) || events.length === 0) {
      return res.status(400).json({ error: 'events array required' });
    }
    const { data, error } = await serviceClient
      .from('events')
      .upsert(events, { onConflict: 'source,external_id' })
      .select('id, title, is_active');

    if (error) return res.status(500).json({ error: 'Failed to upsert events' });

    // Broadcast new events via Socket.io
    data?.filter(e => e.is_active).forEach(e => io.emit('event:new', { event: e }));
    res.json({ upserted: data?.length ?? 0 });
  }
);

// ══════════════════════════════════════════════════════════════
//  SOCKET.IO
// ══════════════════════════════════════════════════════════════
const io = new Server(server, {
  cors: {
    origin:      ALLOWED_ORIGINS,
    methods:     ['GET', 'POST'],
    credentials: true,
  },
  // Limit socket message size
  maxHttpBufferSize: 1e5,  // 100KB
});

io.on('connection', (socket) => {
  // Verify JWT on connect — unauthenticated sockets only get public events
  socket.on('authenticate', async ({ token }) => {
    try {
      const { data: { user } } = await serviceClient.auth.getUser(token);
      if (user) {
        socket.join(`user:${user.id}`);
        socket.userId = user.id;
      }
    } catch {}
  });

  // Rate limit socket messages (prevent abuse)
  let msgCount = 0;
  const msgReset = setInterval(() => { msgCount = 0; }, 60000);

  socket.use((packet, next) => {
    msgCount++;
    if (msgCount > 60) {  // max 60 messages/min per socket
      return next(new Error('socket rate limit exceeded'));
    }
    next();
  });

  socket.on('disconnect', () => clearInterval(msgReset));
});

module.exports.io = io;

// ── Geo proximity (reused from original index.js) ─────────────
async function checkProximity({ userId, lat, lng, io }) {
  try {
    const { sections } = await buildFeed({ userId, userLat: lat, userLng: lng, isPro: true, limit: 10 });
    for (const event of (sections.nearby ?? [])) {
      const dist = haversine(lat, lng, event.lat, event.lng);
      io.to(`user:${userId}`).emit('geo:proximity_alert', {
        event, distance_mi: Math.round(dist * 10) / 10, nearest_parking: event.nearest_parking, user_id: userId,
      });
    }
  } catch (err) {
    console.error('[geo-proximity] error:', err);
  }
}
module.exports.checkProximity = checkProximity;

// ══════════════════════════════════════════════════════════════
//  404 + global error handler
// ══════════════════════════════════════════════════════════════
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Never expose stack traces in production
app.use((err, req, res, next) => {
  console.error('[server] unhandled error:', err);
  res.status(500).json({
    error:   'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// ══════════════════════════════════════════════════════════════
//  START
// ══════════════════════════════════════════════════════════════
const PORT = process.env.SOCKET_PORT ?? 3001;
server.listen(PORT, () => {
  console.log(`[mkepulse-server] running on port ${PORT} [${process.env.NODE_ENV}]`);
  require('./parking-worker');
});
