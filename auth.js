// ============================================================
//  MKEpulse — server/middleware/auth.js
//  JWT verification + tier/role gates for Express routes
// ============================================================
'use strict';

const { createClient } = require('@supabase/supabase-js');

// Service-role client for server-side reads
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

// ── Decode + verify Supabase JWT from Authorization header ───
async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token  = header.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token) {
      return res.status(401).json({ error: 'Missing auth token' });
    }

    // Verify token against Supabase
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Fetch profile (tier + role)
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from('profiles')
      .select('id, email, display_name, tier, role, last_lat, last_lng')
      .eq('id', user.id)
      .single();

    if (profileErr || !profile) {
      return res.status(401).json({ error: 'Profile not found' });
    }

    // Update last_seen_at (fire and forget)
    supabaseAdmin
      .from('profiles')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', user.id)
      .then(() => {});

    req.user    = user;
    req.profile = profile;
    req.isPro   = profile.tier === 'pro';
    req.isAdmin = ['admin', 'superadmin'].includes(profile.role);

    next();
  } catch (err) {
    console.error('[auth] middleware error:', err);
    res.status(500).json({ error: 'Auth error' });
  }
}

// ── Require Pro tier ──────────────────────────────────────────
function requirePro(req, res, next) {
  if (!req.isPro) {
    return res.status(403).json({
      error:   'Pro subscription required',
      upgrade: true,
      price:   '$4.14/mo',
    });
  }
  next();
}

// ── Require admin role ────────────────────────────────────────
function requireAdmin(req, res, next) {
  if (!req.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// ── Optional auth (attach user if token present, else continue)
async function optionalAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token  = header.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token) {
      req.user    = null;
      req.profile = null;
      req.isPro   = false;
      req.isAdmin = false;
      return next();
    }

    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) {
      req.user = null; req.profile = null;
      req.isPro = false; req.isAdmin = false;
      return next();
    }

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('id, email, display_name, tier, role, last_lat, last_lng')
      .eq('id', user.id)
      .single();

    req.user    = user;
    req.profile = profile || null;
    req.isPro   = profile?.tier === 'pro' ?? false;
    req.isAdmin = ['admin', 'superadmin'].includes(profile?.role) ?? false;
    next();
  } catch {
    req.user = null; req.profile = null;
    req.isPro = false; req.isAdmin = false;
    next();
  }
}

module.exports = { requireAuth, requirePro, requireAdmin, optionalAuth, supabaseAdmin };
