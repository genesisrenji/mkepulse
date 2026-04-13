// ============================================================
//  MKEpulse — server/routes/stripe-webhook.js
//  Handles all Stripe webhook events for subscription lifecycle
//
//  Register this endpoint in Stripe Dashboard:
//  https://dashboard.stripe.com/webhooks
//  URL: https://your-domain.com/api/stripe/webhook
//  Events to listen for:
//    customer.subscription.created
//    customer.subscription.updated
//    customer.subscription.deleted
//    invoice.payment_succeeded
//    invoice.payment_failed
//    customer.created
// ============================================================
'use strict';

const express = require('express');
const Stripe  = require('stripe');
const { supabaseAdmin } = require('../middleware/auth');

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });

// ── Stripe requires the raw body for signature verification ──
// Mount BEFORE express.json() in index.js using:
// app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }), stripeRouter)

router.post('/', async (req, res) => {
  const sig     = req.headers['stripe-signature'];
  const payload = req.body; // raw Buffer

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      payload,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('[stripe-webhook] signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  // ── Idempotency: skip if already processed ────────────────
  const { data: existing } = await supabaseAdmin
    .from('stripe_events')
    .select('id')
    .eq('id', event.id)
    .single();

  if (existing) {
    console.log('[stripe-webhook] duplicate event, skipping:', event.id);
    return res.json({ received: true, duplicate: true });
  }

  // ── Log the event ─────────────────────────────────────────
  await supabaseAdmin.from('stripe_events').insert({
    id:           event.id,
    type:         event.type,
    processed_at: new Date().toISOString(),
    payload:      event.data.object,
  });

  // ── Route to handler ──────────────────────────────────────
  try {
    switch (event.type) {
      case 'customer.created':
        await handleCustomerCreated(event.data.object);
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionUpsert(event.data.object);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;
      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(event.data.object);
        break;
      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object);
        break;
      default:
        console.log('[stripe-webhook] unhandled event type:', event.type);
    }
    res.json({ received: true });
  } catch (err) {
    console.error('[stripe-webhook] handler error:', err);
    res.status(500).json({ error: 'Handler failed' });
  }
});

// ── Handlers ──────────────────────────────────────────────────

async function handleCustomerCreated(customer) {
  // Link Stripe customer ID to profile by email
  if (!customer.email) return;
  const { error } = await supabaseAdmin
    .from('subscriptions')
    .upsert({
      stripe_customer_id: customer.id,
      // user_id is linked when subscription is created
    }, { onConflict: 'stripe_customer_id' });

  if (error) console.error('[stripe-webhook] customer.created error:', error);
}

async function handleSubscriptionUpsert(sub) {
  // Find user by Stripe customer ID
  const userId = await getUserIdByCustomer(sub.customer);
  if (!userId) {
    console.warn('[stripe-webhook] no user found for customer:', sub.customer);
    return;
  }

  const isActive = ['active', 'trialing'].includes(sub.status);
  const newTier  = isActive ? 'pro' : 'free';

  // Upsert subscription row
  const { error: subErr } = await supabaseAdmin
    .from('subscriptions')
    .upsert({
      user_id:                userId,
      stripe_customer_id:     sub.customer,
      stripe_subscription_id: sub.id,
      stripe_price_id:        sub.items?.data[0]?.price?.id ?? null,
      status:                 sub.status,
      current_period_start:   sub.current_period_start
                                ? new Date(sub.current_period_start * 1000).toISOString()
                                : null,
      current_period_end:     sub.current_period_end
                                ? new Date(sub.current_period_end * 1000).toISOString()
                                : null,
      cancel_at_period_end:   sub.cancel_at_period_end ?? false,
      amount_cents:           sub.items?.data[0]?.price?.unit_amount ?? 414,
      currency:               sub.currency ?? 'usd',
      updated_at:             new Date().toISOString(),
    }, { onConflict: 'stripe_subscription_id' });

  if (subErr) {
    console.error('[stripe-webhook] subscription upsert error:', subErr);
    return;
  }

  // Sync tier to profile (trigger on DB also does this, belt+suspenders)
  const { error: profileErr } = await supabaseAdmin
    .from('profiles')
    .update({ tier: newTier, updated_at: new Date().toISOString() })
    .eq('id', userId);

  if (profileErr) console.error('[stripe-webhook] profile tier sync error:', profileErr);

  console.log(`[stripe-webhook] user ${userId} tier synced to: ${newTier} (${sub.status})`);
}

async function handleSubscriptionDeleted(sub) {
  const userId = await getUserIdByCustomer(sub.customer);
  if (!userId) return;

  await supabaseAdmin
    .from('subscriptions')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('stripe_subscription_id', sub.id);

  await supabaseAdmin
    .from('profiles')
    .update({ tier: 'free', updated_at: new Date().toISOString() })
    .eq('id', userId);

  console.log(`[stripe-webhook] subscription cancelled for user: ${userId}`);
}

async function handlePaymentSucceeded(invoice) {
  if (!invoice.subscription) return;
  console.log(`[stripe-webhook] payment succeeded for subscription: ${invoice.subscription}`);
  // Could trigger a "thank you" email or push notification here
}

async function handlePaymentFailed(invoice) {
  if (!invoice.subscription) return;
  const userId = await getUserIdByCustomer(invoice.customer);
  if (!userId) return;

  // Create an alert for the admin dashboard
  await supabaseAdmin.from('alerts').insert({
    severity:    'warning',
    title:       'Payment failed',
    description: `Stripe payment failed for user ${userId}. Subscription: ${invoice.subscription}`,
    requires_approval: false,
  });

  console.warn(`[stripe-webhook] payment failed for user: ${userId}`);
}

// ── Helper: find user_id by Stripe customer ID ───────────────
async function getUserIdByCustomer(customerId) {
  const { data } = await supabaseAdmin
    .from('subscriptions')
    .select('user_id')
    .eq('stripe_customer_id', customerId)
    .single();
  return data?.user_id ?? null;
}

module.exports = router;
