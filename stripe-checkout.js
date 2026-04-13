// ============================================================
//  MKEpulse — server/routes/stripe-checkout.js
//  Creates Stripe Checkout sessions for $4.14/mo Pro plan
//  Supports Apple Pay + Google Pay via Payment Request Button
// ============================================================
'use strict';

const express = require('express');
const Stripe  = require('stripe');
const { requireAuth, supabaseAdmin } = require('../middleware/auth');

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });

// ── POST /api/stripe/checkout ─────────────────────────────────
// Creates a Checkout Session and returns the session URL.
// Frontend redirects to this URL (or opens in modal).
router.post('/checkout', requireAuth, async (req, res) => {
  try {
    const userId  = req.profile.id;
    const email   = req.profile.email;

    // Already subscribed?
    if (req.isPro) {
      return res.status(400).json({ error: 'Already subscribed to Pro' });
    }

    // Get or create Stripe customer
    let customerId = await getOrCreateStripeCustomer(userId, email);

    const session = await stripe.checkout.sessions.create({
      customer:    customerId,
      mode:        'subscription',
      line_items:  [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      // Apple Pay + Google Pay enabled automatically when available
      payment_method_types: ['card', 'link'],
      payment_method_options: {
        card: {
          request_three_d_secure: 'automatic',
        },
      },
      subscription_data: {
        metadata: { user_id: userId, app: 'mkepulse' },
      },
      success_url: `${process.env.FRONTEND_URL}/subscribe/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${process.env.FRONTEND_URL}/subscribe/cancel`,
      metadata:    { user_id: userId },
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
    });

    res.json({ url: session.url, session_id: session.id });
  } catch (err) {
    console.error('[checkout] error:', err);
    res.status(500).json({ error: 'Checkout session creation failed' });
  }
});

// ── POST /api/stripe/payment-intent ──────────────────────────
// For in-app Payment Request Button (Apple Pay / Google Pay)
// without redirect. Returns a SetupIntent client secret.
router.post('/payment-intent', requireAuth, async (req, res) => {
  try {
    const userId = req.profile.id;
    const email  = req.profile.email;

    if (req.isPro) {
      return res.status(400).json({ error: 'Already subscribed' });
    }

    const customerId = await getOrCreateStripeCustomer(userId, email);

    // SetupIntent: saves payment method, then subscribe server-side
    const intent = await stripe.setupIntents.create({
      customer:             customerId,
      payment_method_types: ['card'],
      metadata:             { user_id: userId },
    });

    res.json({ client_secret: intent.client_secret, customer_id: customerId });
  } catch (err) {
    console.error('[payment-intent] error:', err);
    res.status(500).json({ error: 'Payment intent creation failed' });
  }
});

// ── POST /api/stripe/subscribe-with-method ────────────────────
// After Apple/Google Pay confirms, call this to create the sub
router.post('/subscribe-with-method', requireAuth, async (req, res) => {
  try {
    const { payment_method_id } = req.body;
    if (!payment_method_id) {
      return res.status(400).json({ error: 'payment_method_id required' });
    }

    const userId     = req.profile.id;
    const email      = req.profile.email;
    const customerId = await getOrCreateStripeCustomer(userId, email);

    // Attach payment method to customer
    await stripe.paymentMethods.attach(payment_method_id, { customer: customerId });
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: payment_method_id },
    });

    // Create subscription
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items:    [{ price: process.env.STRIPE_PRICE_ID }],
      expand:   ['latest_invoice.payment_intent'],
      metadata: { user_id: userId, app: 'mkepulse' },
    });

    const invoice = subscription.latest_invoice;
    const pi      = invoice?.payment_intent;

    // If payment requires further action
    if (pi?.status === 'requires_action') {
      return res.json({
        requires_action:     true,
        payment_intent_secret: pi.client_secret,
        subscription_id:     subscription.id,
      });
    }

    // Payment succeeded — webhook will sync tier, but also do it here
    if (['active', 'trialing'].includes(subscription.status)) {
      await supabaseAdmin
        .from('profiles')
        .update({ tier: 'pro', updated_at: new Date().toISOString() })
        .eq('id', userId);
    }

    res.json({
      subscription_id: subscription.id,
      status:          subscription.status,
      tier:            'pro',
    });
  } catch (err) {
    console.error('[subscribe-with-method] error:', err);
    res.status(500).json({ error: 'Subscription creation failed' });
  }
});

// ── GET /api/stripe/portal ────────────────────────────────────
// Returns a Stripe Customer Portal URL for managing billing
router.get('/portal', requireAuth, async (req, res) => {
  try {
    const { data: sub } = await supabaseAdmin
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', req.profile.id)
      .single();

    if (!sub?.stripe_customer_id) {
      return res.status(404).json({ error: 'No Stripe customer found' });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer:   sub.stripe_customer_id,
      return_url: `${process.env.FRONTEND_URL}/settings`,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('[portal] error:', err);
    res.status(500).json({ error: 'Portal session creation failed' });
  }
});

// ── GET /api/stripe/status ────────────────────────────────────
// Returns current subscription status for the logged-in user
router.get('/status', requireAuth, async (req, res) => {
  const { data: sub } = await supabaseAdmin
    .from('subscriptions')
    .select('status, current_period_end, cancel_at_period_end, amount_cents')
    .eq('user_id', req.profile.id)
    .single();

  res.json({
    tier:                  req.profile.tier,
    subscription:          sub ?? null,
    is_pro:                req.isPro,
    price_monthly:         '4.14',
    price_display:         '$4.14/mo',
  });
});

// ── Helper ────────────────────────────────────────────────────
async function getOrCreateStripeCustomer(userId, email) {
  // Check if customer already exists in our DB
  const { data: existing } = await supabaseAdmin
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', userId)
    .single();

  if (existing?.stripe_customer_id) {
    return existing.stripe_customer_id;
  }

  // Create new Stripe customer
  const customer = await stripe.customers.create({
    email,
    metadata: { user_id: userId, app: 'mkepulse' },
  });

  // Store customer ID
  await supabaseAdmin.from('subscriptions').upsert({
    user_id:            userId,
    stripe_customer_id: customer.id,
    status:             'trialing',
    amount_cents:       414,
    currency:           'usd',
  }, { onConflict: 'user_id' });

  return customer.id;
}

module.exports = router;
