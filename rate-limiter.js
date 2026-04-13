// ============================================================
//  MKEpulse — server/security/rate-limiter.js
//
//  PRIORITY 3: API Rate Limiting
//
//  Strategy: layered rate limits
//  1. Global IP limit     — first line of defence, blocks floods
//  2. Route-specific      — tighter limits on sensitive endpoints
//  3. User-level          — per-authenticated-user limits (pro vs free)
//  4. Sliding window      — fairer than fixed window for bursts
//
//  Storage: in-memory (ioredis in production for multi-instance)
// ============================================================
'use strict';

const rateLimit = require('express-rate-limit');
const slowDown  = require('express-slow-down');

// ── Sliding window store (in-memory, swap for Redis in prod) ──
// In production: npm install rate-limit-redis + ioredis
// const RedisStore = require('rate-limit-redis');
// const redis = new Redis(process.env.REDIS_URL);

// ── Standard response for rate-limited requests ───────────────
function rateLimitHandler(req, res) {
  const resetTime = req.rateLimit?.resetTime
    ? Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000)
    : 60;

  res.status(429).json({
    error:       'Too many requests',
    message:     'Rate limit exceeded. Please slow down.',
    retry_after: resetTime,
    limit:       req.rateLimit?.limit,
    remaining:   0,
  });
}

// ── Key generators ────────────────────────────────────────────
// Use authenticated user ID when available, fall back to IP.
// This prevents a shared IP (NAT, office) from penalising everyone.

function keyByUserOrIP(req) {
  return req.profile?.id ?? req.ip ?? 'unknown';
}

function keyByIP(req) {
  // Trust X-Forwarded-For from Railway/Vercel proxy
  const forwarded = req.headers['x-forwarded-for'];
  return (forwarded ? forwarded.split(',')[0].trim() : req.ip) ?? 'unknown';
}

// ── 1. GLOBAL rate limit — all routes ─────────────────────────
// 300 requests per 15 minutes per IP
// Blocks volumetric attacks before they hit any business logic
const globalLimiter = rateLimit({
  windowMs:         15 * 60 * 1000,  // 15 minutes
  max:              300,
  keyGenerator:     keyByIP,
  handler:          rateLimitHandler,
  standardHeaders:  'draft-7',       // X-RateLimit-* headers
  legacyHeaders:    false,
  skip: (req) => {
    // Skip health check endpoint
    return req.path === '/health';
  },
});

// ── 2. AUTH endpoints — tightest limits ───────────────────────
// Prevents brute-force on login/signup
// 10 attempts per 15 minutes per IP
const authLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,
  max:             10,
  keyGenerator:    keyByIP,
  handler:         rateLimitHandler,
  standardHeaders: 'draft-7',
  legacyHeaders:   false,
  message:         'Too many auth attempts. Try again in 15 minutes.',
  skipSuccessfulRequests: true,   // don't count successful logins against limit
});

// Progressive slow-down before hard block (500ms delay after 5 attempts)
const authSlowDown = slowDown({
  windowMs:        15 * 60 * 1000,
  delayAfter:      5,
  delayMs:         (hits) => hits * 500,  // 500ms, 1000ms, 1500ms...
  maxDelayMs:      10000,                 // max 10s delay
  keyGenerator:    keyByIP,
});

// ── 3. STRIPE endpoints — protect payment flows ───────────────
// 20 checkout sessions per hour per user
const stripeLimiter = rateLimit({
  windowMs:        60 * 60 * 1000,  // 1 hour
  max:             20,
  keyGenerator:    keyByUserOrIP,
  handler:         rateLimitHandler,
  standardHeaders: 'draft-7',
  legacyHeaders:   false,
});

// Webhook: unlimited (Stripe IPs, verified by signature, not rate-limited)
// The stripe-webhook route bypasses rate limiting via skip() below

// ── 4. FEED endpoint — tier-aware limits ──────────────────────
// Free users: 60 requests per hour (enough for normal browsing)
// Pro users:  600 requests per hour (10x headroom)
// Admin:      unlimited
function feedLimiter(req, res, next) {
  const isPro   = req.isPro;
  const isAdmin = req.isAdmin;

  if (isAdmin) return next();  // admins are not rate-limited

  const limiter = rateLimit({
    windowMs:        60 * 60 * 1000,
    max:             isPro ? 600 : 60,
    keyGenerator:    keyByUserOrIP,
    handler:         rateLimitHandler,
    standardHeaders: 'draft-7',
    legacyHeaders:   false,
  });

  return limiter(req, res, next);
}

// ── 5. GEO update endpoint ────────────────────────────────────
// Location updates: max 1 per 10 seconds per user
// Prevents GPS polling abuse
const geoLimiter = rateLimit({
  windowMs:        10 * 1000,    // 10 seconds
  max:             1,
  keyGenerator:    keyByUserOrIP,
  handler:         rateLimitHandler,
  standardHeaders: 'draft-7',
  legacyHeaders:   false,
});

// ── 6. PREFERENCES endpoint ───────────────────────────────────
// 30 updates per hour (quiz is submitted once; settings edits are occasional)
const preferencesLimiter = rateLimit({
  windowMs:        60 * 60 * 1000,
  max:             30,
  keyGenerator:    keyByUserOrIP,
  handler:         rateLimitHandler,
  standardHeaders: 'draft-7',
  legacyHeaders:   false,
});

// ── 7. ADMIN endpoints ────────────────────────────────────────
// Admin queries can be expensive; cap at 200/hr to protect DB
const adminLimiter = rateLimit({
  windowMs:        60 * 60 * 1000,
  max:             200,
  keyGenerator:    keyByUserOrIP,
  handler:         rateLimitHandler,
  standardHeaders: 'draft-7',
  legacyHeaders:   false,
  skip: (req) => {
    // Superadmin bypasses admin rate limit
    return req.profile?.role === 'superadmin';
  },
});

// ── 8. AGENT trigger (force crawl) ───────────────────────────
// Max 5 manual triggers per hour per admin
const agentTriggerLimiter = rateLimit({
  windowMs:        60 * 60 * 1000,
  max:             5,
  keyGenerator:    keyByUserOrIP,
  handler:         rateLimitHandler,
  standardHeaders: 'draft-7',
  legacyHeaders:   false,
});

// ── Middleware to skip rate limiting for Stripe webhook ───────
function skipForStripeWebhook(req) {
  return req.path === '/api/stripe/webhook';
}

// ── Apply headers for visibility ──────────────────────────────
function rateLimitInfo(req, res, next) {
  // Surface current limit tier in response headers
  if (req.profile) {
    res.setHeader('X-User-Tier',  req.profile.tier ?? 'free');
    res.setHeader('X-User-Role',  req.profile.role ?? 'user');
  }
  next();
}

module.exports = {
  globalLimiter,
  authLimiter,
  authSlowDown,
  stripeLimiter,
  feedLimiter,
  geoLimiter,
  preferencesLimiter,
  adminLimiter,
  agentTriggerLimiter,
  rateLimitInfo,
  skipForStripeWebhook,
};
