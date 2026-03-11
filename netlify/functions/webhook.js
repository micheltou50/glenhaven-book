// ── /api/webhook ─────────────────────────────────────────────
// Receives Stripe webhook (checkout.session.completed).
// Calls Apps Script to write the confirmed row to Google Sheet
// and send confirmation emails to host + guest.
//
// Register this URL in Stripe Dashboard:
//   https://glenhaven-book.netlify.app/api/webhook
// Event: checkout.session.completed
//
// Add STRIPE_WEBHOOK_SECRET to Netlify env vars:
//   Stripe Dashboard → Developers → Webhooks → your endpoint → Signing secret

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
  const rawBody        = event.body;

  // ── Stripe signature verification ────────────────────────
  // Prevents anyone from POSTing fake webhook events
  if (WEBHOOK_SECRET) {
    const sigHeader = event.headers['stripe-signature'];
    if (!sigHeader) {
      console.error('Missing stripe-signature header');
      return { statusCode: 400, body: 'Missing signature' };
    }

    // Manual HMAC-SHA256 verification (no stripe npm package needed)
    const crypto = require('crypto');
    let timestamp, signatures;
    try {
      const parts = sigHeader.split(',');
      timestamp   = parts.find(p => p.startsWith('t=')).split('=')[1];
      signatures  = parts.filter(p => p.startsWith('v1=')).map(p => p.split('=')[1]);
    } catch {
      return { statusCode: 400, body: 'Invalid signature header' };
    }

    const signedPayload = `${timestamp}.${rawBody}`;
    const expected      = crypto.createHmac('sha256', WEBHOOK_SECRET)
                                .update(signedPayload, 'utf8')
                                .digest('hex');

    if (!signatures.includes(expected)) {
      console.error('Stripe signature mismatch — possible forged webhook');
      return { statusCode: 400, body: 'Invalid signature' };
    }

    // Reject webhooks older than 5 minutes (replay attack protection)
    const age = Math.floor(Date.now() / 1000) - parseInt(timestamp);
    if (age > 300) {
      console.error('Webhook too old:', age, 'seconds');
      return { statusCode: 400, body: 'Webhook expired' };
    }
  } else {
    console.warn('STRIPE_WEBHOOK_SECRET not set — skipping signature check (set this in production!)');
  }

  // ── Parse event ───────────────────────────────────────────
  let stripeEvent;
  try {
    stripeEvent = JSON.parse(rawBody);
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  // Only process completed checkouts
  if (stripeEvent.type !== 'checkout.session.completed') {
    return { statusCode: 200, body: JSON.stringify({ received: true }) };
  }

  const session = stripeEvent.data.object;
  const meta    = session.metadata || {};

  // Validate required metadata before writing to sheet
  if (!meta.checkIn || !meta.checkOut || !meta.guestName || !meta.email) {
    console.error('Missing required metadata in Stripe session:', session.id);
    return { statusCode: 200, body: JSON.stringify({ received: true, warning: 'incomplete metadata' }) };
  }

  const confirmPayload = {
    action          : 'confirm',
    checkIn         : meta.checkIn,
    checkOut        : meta.checkOut,
    nights          : parseInt(meta.nights)   || 0,
    guestName       : meta.guestName          || '',
    email           : meta.email              || (session.customer_details && session.customer_details.email) || '',
    phone           : meta.phone              || '',
    guests          : parseInt(meta.guests)   || 1,
    total           : parseFloat(meta.total)  || 0,
    amountPaid      : (session.amount_total   || 0) / 100,
    stripeSessionId : session.id,
    message         : meta.message            || '',
  };

  try {
    const url = process.env.APPS_SCRIPT_URL + '?payload=' + encodeURIComponent(JSON.stringify(confirmPayload));
    const res = await fetch(url);
    if (!res.ok) throw new Error('Apps Script returned ' + res.status);
    console.log('Booking confirmed:', meta.checkIn, '→', meta.checkOut, 'for', meta.guestName);
  } catch (err) {
    // Log but return 200 — Stripe will retry if we return an error
    console.error('Apps Script confirm failed:', err.message);
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ received: true }),
  };
};
