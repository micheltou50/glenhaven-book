// ── POST /api/refund ─────────────────────────────────────────
// Refund a DIRECT (website / Stripe) booking. Auth required (_auth.js).
//
// Body: {
//   bookingId?        : uuid of the booking            (either this…)
//   confirmationCode? : Stripe checkout session id      (…or this)
//   amount?           : AUD amount for a PARTIAL refund (omit = full refund)
//   reason?           : 'requested_by_customer' | 'duplicate' | 'fraudulent'
//   cancel?           : true → also mark the booking cancelled
// }
//
// Safety:
//   • Only source='direct-booking' rows (charged through this Stripe account).
//   • The charged amount + existing refunds are read from Stripe (authoritative),
//     so we can never refund more than was paid, even across several partials.
//   • The Stripe call is idempotent; success is only reported when Stripe
//     confirms status='succeeded'.

const { checkAuth } = require('./_auth');

const { SUPABASE_URL, SUPABASE_SERVICE_KEY, PROPERTY_ID, STRIPE_SECRET_KEY } = process.env;

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-admin-password, x-api-key, Authorization',
};

const sbHeaders = {
  'apikey': SUPABASE_SERVICE_KEY,
  'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

function reply(statusCode, obj) {
  return { statusCode, headers: corsHeaders, body: JSON.stringify(obj) };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return reply(200, {});
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Method Not Allowed' });

  const auth = checkAuth(event);
  if (auth) return reply(auth.statusCode, { error: auth.error });

  if (!STRIPE_SECRET_KEY) return reply(500, { error: 'STRIPE_SECRET_KEY not set' });

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return reply(400, { error: 'Invalid JSON' }); }

  const { bookingId, confirmationCode, amount, reason, cancel } = body;
  if (!bookingId && !confirmationCode) {
    return reply(400, { error: 'bookingId or confirmationCode required' });
  }

  // Validate a partial amount up front
  let amountCents = null;
  if (amount !== undefined && amount !== null && amount !== '') {
    const a = Number(amount);
    if (!Number.isFinite(a) || a <= 0) return reply(400, { error: 'amount must be a positive number' });
    amountCents = Math.round(a * 100);
  }

  // ── 1. Look up the booking, scoped to THIS property ──────────
  let booking;
  try {
    const filter = bookingId
      ? `id=eq.${encodeURIComponent(bookingId)}`
      : `confirmation_code=eq.${encodeURIComponent(confirmationCode)}`;
    const url = `${SUPABASE_URL}/rest/v1/bookings?${filter}&property_id=eq.${PROPERTY_ID}`
              + `&select=id,confirmation_code,source,platform,status&limit=1`;
    const res = await fetch(url, { headers: sbHeaders });
    const rows = await res.json();
    booking = Array.isArray(rows) ? rows[0] : null;
  } catch (err) {
    return reply(502, { error: 'Booking lookup failed: ' + err.message });
  }
  if (!booking) return reply(404, { error: 'Booking not found for this property' });

  // Only direct Stripe bookings can be refunded through this account
  if (booking.source !== 'direct-booking') {
    return reply(422, { error: `This booking (platform "${booking.platform}") was not charged via the website — refund it in the original channel.` });
  }

  const sessionId = booking.confirmation_code; // for direct bookings this IS the Stripe checkout session id
  if (!sessionId || !/^cs_/.test(sessionId)) {
    return reply(422, { error: 'No Stripe checkout session on this booking; cannot refund automatically.' });
  }

  // ── 2. Resolve payment_intent + the CHARGED amount from Stripe ─
  let paymentIntent, chargedCents = null;
  try {
    const sRes = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
      headers: { 'Authorization': `Bearer ${STRIPE_SECRET_KEY}` },
    });
    if (!sRes.ok) {
      const e = await sRes.json().catch(() => ({}));
      return reply(sRes.status >= 500 ? 502 : 422, { error: 'Stripe session lookup failed: ' + ((e.error && e.error.message) || ('HTTP ' + sRes.status)) });
    }
    const s = await sRes.json();
    if (s.payment_status && s.payment_status !== 'paid') {
      return reply(422, { error: `Session is not paid (status "${s.payment_status}"); nothing to refund.` });
    }
    chargedCents = Number.isFinite(s.amount_total) ? s.amount_total : null;
    paymentIntent = (s.payment_intent && typeof s.payment_intent === 'object') ? s.payment_intent.id : s.payment_intent;
  } catch (err) {
    return reply(502, { error: 'Stripe session lookup failed: ' + err.message });
  }
  if (!paymentIntent) return reply(422, { error: 'No payment found on this booking to refund.' });

  // ── 2b. Sum any EXISTING refunds so we can never over-refund ──
  let alreadyRefunded = 0;
  try {
    const lRes = await fetch(`https://api.stripe.com/v1/refunds?payment_intent=${encodeURIComponent(paymentIntent)}&limit=100`, {
      headers: { 'Authorization': `Bearer ${STRIPE_SECRET_KEY}` },
    });
    if (!lRes.ok) throw new Error('HTTP ' + lRes.status);
    const list = await lRes.json();
    if (list && Array.isArray(list.data)) {
      alreadyRefunded = list.data
        .filter(r => r.status !== 'failed' && r.status !== 'canceled')
        .reduce((sum, r) => sum + (r.amount || 0), 0);
    }
  } catch (err) {
    // If we cannot verify existing refunds we must NOT guess — fail closed.
    return reply(502, { error: 'Could not verify existing refunds: ' + err.message });
  }

  // Enforce the cap: (existing + requested) can never exceed the amount charged.
  if (chargedCents != null) {
    const requested = amountCents != null ? amountCents : (chargedCents - alreadyRefunded);
    if (requested <= 0) {
      return reply(422, { error: 'This payment is already fully refunded.' });
    }
    if (alreadyRefunded + requested > chargedCents) {
      const remaining = ((chargedCents - alreadyRefunded) / 100).toFixed(2);
      return reply(400, { error: `Refund would exceed the amount paid. Remaining refundable: ${remaining}.` });
    }
  }

  // ── 3. Create the refund (idempotent on payment_intent+amount) ─
  let refund, rRes;
  try {
    const params = new URLSearchParams({ payment_intent: paymentIntent });
    if (amountCents != null) params.set('amount', String(amountCents));
    if (reason && ['duplicate', 'fraudulent', 'requested_by_customer'].includes(reason)) {
      params.set('reason', reason);
    }
    const idemKey = `refund:${paymentIntent}:${amountCents == null ? 'full' : amountCents}`;
    rRes = await fetch('https://api.stripe.com/v1/refunds', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Idempotency-Key': idemKey,
      },
      body: params.toString(),
    });
    refund = await rRes.json();
  } catch (err) {
    return reply(502, { error: 'Refund request failed: ' + err.message });
  }

  // Stripe error → 4xx (client/logic) surfaces as 422, 5xx (transient) as 502.
  if (!rRes.ok || (refund && refund.error)) {
    const msg = (refund && refund.error && refund.error.message) || ('HTTP ' + rRes.status);
    return reply(rRes.status >= 500 ? 502 : 422, { error: 'Refund failed: ' + msg });
  }

  // A 2xx does NOT prove the money moved — only status='succeeded' does.
  if (refund.status !== 'succeeded') {
    const code = refund.status === 'pending' ? 202 : 502;
    return reply(code, {
      success: false,
      pending: refund.status === 'pending',
      refundId: refund.id,
      status: refund.status,
      error: refund.status === 'pending' ? 'Refund accepted but pending at the bank.' : `Refund ${refund.status}.`,
    });
  }

  // ── 4. Optionally mark the booking cancelled ─────────────────
  // The refund has already SUCCEEDED, so a DB failure here must NOT bubble up as
  // an error the caller might retry (a retry could issue a second refund).
  let cancelled = false;
  if (cancel === true) {
    try {
      const patchUrl = `${SUPABASE_URL}/rest/v1/bookings?id=eq.${encodeURIComponent(booking.id)}&property_id=eq.${PROPERTY_ID}`;
      const pRes = await fetch(patchUrl, {
        method: 'PATCH',
        headers: { ...sbHeaders, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ status: 'cancelled', cancelled_at: new Date().toISOString() }),
      });
      cancelled = pRes.ok;
    } catch (err) {
      console.warn('[refund] booking cancel patch failed (refund still succeeded):', err.message);
    }
  }

  return reply(200, {
    success: true,
    refundId: refund.id,
    amount: refund.amount != null ? refund.amount / 100 : null,
    status: refund.status,
    bookingId: booking.id,
    cancelled,
  });
};
