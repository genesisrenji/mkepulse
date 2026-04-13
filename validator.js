// ============================================================
//  MKEpulse — server/security/validator.js
//
//  PRIORITY 3: Input Validation
//
//  Every API input is validated before any business logic runs.
//  Strategy:
//  - Joi schemas define the exact shape of every request body
//  - validate() middleware rejects malformed input with 422
//  - Sanitizers strip/escape dangerous content (XSS, injection)
//  - Type coercion is explicit — never trust raw types from JSON
// ============================================================
'use strict';

const Joi = require('joi');

// ── Common reusable fields ────────────────────────────────────
const uuid       = Joi.string().uuid({ version: 'uuidv4' });
const email      = Joi.string().email({ tlds: { allow: false } }).max(254).lowercase().trim();
const safeString = Joi.string().max(500).trim()
  .pattern(/^[^<>"';&\\]+$/, 'no HTML/script injection characters');
const latitude   = Joi.number().min(-90).max(90);
const longitude  = Joi.number().min(-180).max(180);

const EVENT_CATEGORIES  = ['concerts', 'food', 'sports', 'arts', 'family', 'community'];
const NEIGHBORHOODS     = ['downtown', 'third_ward', 'bay_view', 'east_side',
                           'riverwest', 'walkers_point', 'brady_street', 'suburbs', 'anywhere', 'lakefront'];
const GROUP_TYPES       = ['solo', 'partner', 'friends', 'family'];
const AGE_FILTERS       = ['all', '18plus', '21plus'];
const NOTIF_FREQUENCIES = ['realtime', 'smart', 'daily', 'weekly'];
const INTERACTION_TYPES = ['view', 'save', 'checkin', 'dismiss'];

// ── Request schemas ───────────────────────────────────────────

const schemas = {

  // POST /api/preferences (onboarding quiz)
  preferences: Joi.object({
    categories:       Joi.array().items(Joi.string().valid(...EVENT_CATEGORIES)).min(1).max(6).required(),
    budget_max:       Joi.number().integer().min(0).max(10000).allow(null).default(null),
    include_free:     Joi.boolean().default(true),
    flash_deals_only: Joi.boolean().default(false),
    neighborhoods:    Joi.array().items(Joi.string().valid(...NEIGHBORHOODS)).max(10).default([]),
    geo_radius_miles: Joi.number().min(0.5).max(50).precision(1).default(3.0),
    group_type:       Joi.string().valid(...GROUP_TYPES).allow(null).default(null),
    age_filter:       Joi.string().valid(...AGE_FILTERS).default('all'),
    notif_frequency:  Joi.string().valid(...NOTIF_FREQUENCIES).default('smart'),
    push_enabled:     Joi.boolean().default(true),
    parking_alerts:   Joi.boolean().default(true),
    max_parking_walk: Joi.number().integer().min(1).max(60).default(10),
  }),

  // PATCH /api/preferences (partial update)
  preferencesPartial: Joi.object({
    categories:       Joi.array().items(Joi.string().valid(...EVENT_CATEGORIES)).min(1).max(6),
    budget_max:       Joi.number().integer().min(0).max(10000).allow(null),
    include_free:     Joi.boolean(),
    flash_deals_only: Joi.boolean(),
    neighborhoods:    Joi.array().items(Joi.string().valid(...NEIGHBORHOODS)).max(10),
    geo_radius_miles: Joi.number().min(0.5).max(50).precision(1),
    group_type:       Joi.string().valid(...GROUP_TYPES).allow(null),
    age_filter:       Joi.string().valid(...AGE_FILTERS),
    notif_frequency:  Joi.string().valid(...NOTIF_FREQUENCIES),
    push_enabled:     Joi.boolean(),
    parking_alerts:   Joi.boolean(),
    max_parking_walk: Joi.number().integer().min(1).max(60),
  }).min(1),  // at least one field required

  // PATCH /api/preferences/location
  location: Joi.object({
    lat: latitude.required(),
    lng: longitude.required(),
  }),

  // POST /api/geo/update
  geoUpdate: Joi.object({
    lat: latitude.required(),
    lng: longitude.required(),
  }),

  // POST /api/feed/interaction
  interaction: Joi.object({
    event_id: uuid.required(),
    action:   Joi.string().valid(...INTERACTION_TYPES).required(),
  }),

  // GET /api/feed query params
  feedQuery: Joi.object({
    lat:    latitude.optional(),
    lng:    longitude.optional(),
    limit:  Joi.number().integer().min(1).max(100).default(50),
    offset: Joi.number().integer().min(0).default(0),
  }),

  // POST /api/stripe/subscribe-with-method
  subscribeWithMethod: Joi.object({
    payment_method_id: Joi.string().pattern(/^pm_[A-Za-z0-9]+$/).required()
      .messages({ 'string.pattern.base': 'Invalid Stripe payment method ID format' }),
  }),

  // Admin: approve/reject event
  adminEventAction: Joi.object({
    action: Joi.string().valid('approve', 'reject').required(),
    reason: safeString.max(500).optional(),
  }),

  // Admin: resolve alert
  adminAlertResolve: Joi.object({
    resolution_note: safeString.max(1000).optional(),
  }),

  // Profile update
  profileUpdate: Joi.object({
    display_name: safeString.max(100).optional(),
    avatar_url:   Joi.string().uri({ scheme: ['https'] }).max(500).optional(),
    // role and tier are NOT in this schema — cannot be self-updated
  }).min(1),

};

// ── Validate middleware factory ───────────────────────────────
// Usage: router.post('/path', validate('preferences'), handler)
// Source: 'body' (default), 'query', or 'params'

function validate(schemaName, source = 'body') {
  const schema = schemas[schemaName];
  if (!schema) throw new Error(`[validator] unknown schema: ${schemaName}`);

  return function validationMiddleware(req, res, next) {
    const data   = source === 'query'  ? req.query
                 : source === 'params' ? req.params
                 : req.body;

    const { error, value } = schema.validate(data, {
      abortEarly:       false,    // report all errors, not just first
      stripUnknown:     true,     // silently drop unknown fields (no pollution)
      convert:          true,     // coerce types (string '3' → number 3)
      allowUnknown:     false,    // reject unexpected keys
    });

    if (error) {
      const details = error.details.map(d => ({
        field:   d.path.join('.'),
        message: d.message.replace(/['"]/g, ''),
      }));

      return res.status(422).json({
        error:   'Validation failed',
        details,
      });
    }

    // Replace raw input with validated + sanitized values
    if (source === 'query')       req.query  = value;
    else if (source === 'params') req.params = value;
    else                          req.body   = value;

    next();
  };
}

// ── XSS sanitizer ─────────────────────────────────────────────
// Applied to any free-text fields that might be rendered in the UI.
// Strips all HTML tags and dangerous characters.
function sanitizeString(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/[<>]/g, '')          // strip angle brackets (HTML tags)
    .replace(/javascript:/gi, '')  // strip JS protocol
    .replace(/on\w+=/gi, '')       // strip event handlers
    .replace(/&[a-z]+;/gi, '')     // strip HTML entities
    .trim();
}

function sanitizeObject(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [
      k,
      typeof v === 'string' ? sanitizeString(v)
        : Array.isArray(v)  ? v.map(i => typeof i === 'string' ? sanitizeString(i) : i)
        : typeof v === 'object' ? sanitizeObject(v)
        : v,
    ])
  );
}

// ── SQL injection guard ───────────────────────────────────────
// Secondary defence — Supabase parameterises queries, but this
// catches any raw string interpolation that slipped through code review.
const SQL_INJECTION_PATTERN = /('|--|;|\bDROP\b|\bUNION\b|\bSELECT\b|\bINSERT\b|\bDELETE\b|\bUPDATE\b|\bEXEC\b)/i;

function hasSQLInjection(str) {
  return typeof str === 'string' && SQL_INJECTION_PATTERN.test(str);
}

function sqlGuard(req, res, next) {
  const suspect = JSON.stringify(req.body) + JSON.stringify(req.query);
  if (hasSQLInjection(suspect)) {
    console.warn('[validator] SQL injection pattern detected:', {
      ip:   req.ip,
      path: req.path,
      body: req.body,
    });
    return res.status(400).json({ error: 'Invalid characters in request' });
  }
  next();
}

// ── Content-type guard ────────────────────────────────────────
// Reject requests with wrong Content-Type to prevent CSRF via form submissions
function requireJSON(req, res, next) {
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    const ct = req.headers['content-type'] ?? '';
    if (!ct.includes('application/json')) {
      return res.status(415).json({
        error: 'Content-Type must be application/json',
      });
    }
  }
  next();
}

// ── Request size guard ────────────────────────────────────────
// Express bodyParser handles this, but we double-check
function maxBodySize(maxBytes = 10240) {  // default 10KB
  return (req, res, next) => {
    const len = parseInt(req.headers['content-length'] ?? 0);
    if (len > maxBytes) {
      return res.status(413).json({
        error: `Request body too large. Max: ${maxBytes} bytes`,
      });
    }
    next();
  };
}

module.exports = {
  schemas,
  validate,
  sanitizeString,
  sanitizeObject,
  sqlGuard,
  requireJSON,
  maxBodySize,
};
