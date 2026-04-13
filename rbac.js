// ============================================================
//  MKEpulse — server/security/rbac.js
//
//  PRIORITY 2: Role-Based Access Control
//  - Defines all roles and their allowed permissions
//  - Enforces least privilege on every route
//  - Separates user auth (anon key) from service auth (service role)
//  - Service tokens use short-lived JWTs, never shared with clients
// ============================================================
'use strict';

// ── Role hierarchy ─────────────────────────────────────────────
// Roles are additive: each role inherits everything below it.
const ROLE_HIERARCHY = {
  user:        0,
  admin:       1,
  superadmin:  2,
  service:     99,  // internal service-to-service only, never user-facing
};

// ── Permission definitions ────────────────────────────────────
// Each permission maps to a specific resource + action.
// Routes declare required permissions; RBAC middleware enforces them.
const PERMISSIONS = {
  // Feed
  'feed:read':              ['user', 'admin', 'superadmin'],
  'feed:read:unlimited':    ['admin', 'superadmin'],        // no 8-event cap

  // Events
  'events:read':            ['user', 'admin', 'superadmin'],
  'events:write':           ['admin', 'superadmin', 'service'],
  'events:approve':         ['admin', 'superadmin'],
  'events:delete':          ['superadmin'],

  // Parking
  'parking:read':           ['user', 'admin', 'superadmin'],
  'parking:write':          ['service', 'superadmin'],      // only worker + superadmin

  // Alerts
  'alerts:read:own':        ['user'],                       // proximity alerts for self
  'alerts:read:all':        ['admin', 'superadmin'],
  'alerts:write':           ['service', 'admin', 'superadmin'],
  'alerts:resolve':         ['admin', 'superadmin'],

  // Users
  'users:read:own':         ['user', 'admin', 'superadmin'],
  'users:read:all':         ['admin', 'superadmin'],
  'users:write:own':        ['user'],                       // own profile only
  'users:write:all':        ['superadmin'],
  'users:delete':           ['superadmin'],

  // Preferences
  'preferences:read:own':   ['user', 'admin', 'superadmin'],
  'preferences:write:own':  ['user'],
  'preferences:read:all':   ['admin', 'superadmin'],

  // Subscriptions
  'subscriptions:read:own': ['user'],
  'subscriptions:read:all': ['admin', 'superadmin'],
  'subscriptions:write':    ['service'],                    // Stripe webhook only

  // Admin dashboard
  'admin:dashboard':        ['admin', 'superadmin'],
  'admin:analytics':        ['admin', 'superadmin'],
  'admin:revenue':          ['admin', 'superadmin'],
  'admin:settings':         ['superadmin'],
  'admin:agent:trigger':    ['admin', 'superadmin'],
  'admin:agent:pause':      ['superadmin'],

  // Geo (Pro feature)
  'geo:alerts':             ['pro', 'admin', 'superadmin'], // checked via tier, not role
  'geo:write:location':     ['user', 'admin', 'superadmin'],

  // Service-to-service
  'service:crawl':          ['service'],
  'service:parking:write':  ['service'],
};

// ── Auth client separation ────────────────────────────────────
// THREE distinct Supabase clients — never mix them up.
//
//  1. anonClient    → frontend / unauthenticated requests
//     Key: SUPABASE_ANON_KEY (safe to expose to client)
//     Respects RLS policies
//     Used for: public event reads, auth sign-in/sign-up
//
//  2. userClient    → authenticated user requests (server-side proxy)
//     Key: user's own JWT (passed in Authorization header)
//     Respects RLS policies scoped to that user
//     Used for: user profile reads, preference writes
//
//  3. serviceClient → server-side privileged operations only
//     Key: SUPABASE_SERVICE_ROLE_KEY (NEVER sent to client)
//     Bypasses RLS (use with extreme care)
//     Used for: Stripe webhook writes, crawl agent inserts,
//               parking worker updates, admin queries
//
const { createClient } = require('@supabase/supabase-js');

// Public anon client — safe to use in frontend (respects RLS)
const anonClient = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession:    false,
      autoRefreshToken:  false,
      detectSessionInUrl: false,
    },
  }
);

// Service role client — server-side ONLY, bypasses RLS
// Never expose SUPABASE_SERVICE_ROLE_KEY to client code
const serviceClient = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession:    false,
      autoRefreshToken:  false,
    },
  }
);

// Build a user-scoped client from their JWT (respects RLS)
function buildUserClient(userJwt) {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    {
      global: {
        headers: { Authorization: `Bearer ${userJwt}` },
      },
      auth: {
        persistSession:   false,
        autoRefreshToken: false,
      },
    }
  );
}

// ── RBAC middleware factory ───────────────────────────────────
// Usage: router.get('/path', requireAuth, can('events:read'), handler)

function can(permission) {
  return function rbacMiddleware(req, res, next) {
    const role = req.profile?.role ?? 'user';
    const tier = req.profile?.tier ?? 'free';

    // Special handling for Pro-gated geo permissions
    if (permission === 'geo:alerts') {
      if (tier !== 'pro' && !['admin', 'superadmin'].includes(role)) {
        return res.status(403).json({
          error:   'Pro subscription required for geo alerts',
          upgrade: true,
          price:   '$4.14/mo',
        });
      }
      return next();
    }

    const allowedRoles = PERMISSIONS[permission];
    if (!allowedRoles) {
      console.error(`[rbac] unknown permission: ${permission}`);
      return res.status(500).json({ error: 'Unknown permission' });
    }

    if (!allowedRoles.includes(role)) {
      return res.status(403).json({
        error:      'Insufficient permissions',
        required:   permission,
        your_role:  role,
      });
    }

    next();
  };
}

// ── Role elevation check ──────────────────────────────────────
// Prevents horizontal privilege escalation.
// A user cannot set their own role to admin.
function canElevateRole(currentRole, targetRole) {
  const currentLevel = ROLE_HIERARCHY[currentRole] ?? 0;
  const targetLevel  = ROLE_HIERARCHY[targetRole]  ?? 0;
  // Can only assign roles strictly below your own level
  return currentLevel > targetLevel;
}

// ── Service token validation ──────────────────────────────────
// Used for internal service-to-service calls (crawl agent → server).
// Service tokens are separate from user JWTs — never shared with clients.
const crypto = require('crypto');

function generateServiceToken() {
  const payload = {
    role:  'service',
    iss:   'mkepulse-server',
    iat:   Math.floor(Date.now() / 1000),
    exp:   Math.floor(Date.now() / 1000) + 3600, // 1hr TTL
    jti:   crypto.randomUUID(),
  };
  // Sign with service secret (separate from Supabase JWT secret)
  const jwt = require('jsonwebtoken');
  return jwt.sign(payload, process.env.SERVICE_TOKEN_SECRET, { algorithm: 'HS256' });
}

function requireServiceAuth(req, res, next) {
  const header = req.headers['x-service-token'] || req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : header;

  if (!token) {
    return res.status(401).json({ error: 'Service token required' });
  }

  try {
    const jwt     = require('jsonwebtoken');
    const payload = jwt.verify(token, process.env.SERVICE_TOKEN_SECRET, {
      algorithms: ['HS256'],
      issuer:     'mkepulse-server',
    });

    if (payload.role !== 'service') {
      return res.status(403).json({ error: 'Invalid service role' });
    }

    req.serviceToken = payload;
    req.profile      = { role: 'service', tier: 'service' };
    req.isAdmin      = false;
    req.isPro        = false;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired service token' });
  }
}

// ── Scope enforcement helpers ─────────────────────────────────
// These prevent IDOR by enforcing ownership scoping on queries.

function scopeToUser(query, req) {
  // Forces query to only return records owned by the requesting user
  return query.eq('user_id', req.profile.id);
}

function scopeOrAdmin(query, req, column = 'user_id') {
  // Returns own records, unless admin (who sees all)
  if (req.isAdmin) return query;
  return query.eq(column, req.profile.id);
}

module.exports = {
  PERMISSIONS,
  ROLE_HIERARCHY,
  anonClient,
  serviceClient,
  buildUserClient,
  can,
  canElevateRole,
  generateServiceToken,
  requireServiceAuth,
  scopeToUser,
  scopeOrAdmin,
};
