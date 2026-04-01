// ── /api/webhook ─────────────────────────────────────────────
// Stripe webhook (checkout.session.completed)
// → Writes confirmed booking to Supabase
// → Sends branded confirmation email via Resend

const { confirmationEmail } = require('./email-templates');

const { SUPABASE_URL, SUPABASE_SERVICE_KEY, PROPERTY_ID, HOST_USER_ID,
        STRIPE_WEBHOOK_SECRET, RESEND_API_KEY, RESEND_FROM, HOST_EMAIL } = process.env;
const SITE_URL = process.env.URL || 'https://glenhaven-book.netlify.app';

const sbHeaders = {
  'apikey': SUPABASE_SERVICE_KEY,
  'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const rawBody = event.body;

  // ── Stripe signature verification ──────────────────────────
  if (STRIPE_WEBHOOK_SECRET) {
    const sigHeader = event.headers['stripe-signature'];
    if (!sigHeader) return { statusCode: 400, body: 'Missing signature' };

    const crypto = require('crypto');
    let timestamp, signatures;
    try {
      const parts = sigHeader.split(',');
      timestamp   = parts.find(p => p.startsWith('t=')).split('=')[1];
      signatures  = parts.filter(p => p.startsWith('v1=')).map(p => p.split('=')[1]);
    } catch {
      return { statusCode: 400, body: 'Invalid signature header' };
    }

    const expected = crypto.createHmac('sha256', STRIPE_WEBHOOK_SECRET)
                           .update(`${timestamp}.${rawBody}`, 'utf8')
                           .digest('hex');

    if (!signatures.includes(expected)) return { statusCode: 400, body: 'Invalid signature' };
    if (Math.floor(Date.now() / 1000) - parseInt(timestamp) > 300) return { statusCode: 400, body: 'Webhook expired' };
  } else {
    console.warn('STRIPE_WEBHOOK_SECRET not set — skipping signature check');
  }

  // ── Parse event ────────────────────────────────────────────
  let stripeEvent;
  try { stripeEvent = JSON.parse(rawBody); }
  catch { return { statusCode: 400, body: 'Invalid JSON' }; }

  if (stripeEvent.type !== 'checkout.session.completed') {
    return { statusCode: 200, body: JSON.stringify({ received: true }) };
  }

  const session = stripeEvent.data.object;
  const meta    = session.metadata || {};

  if (!meta.checkIn || !meta.checkOut || !meta.guestName || !meta.email) {
    console.error('Missing metadata in Stripe session:', session.id);
    return { statusCode: 200, body: JSON.stringify({ received: true, warning: 'incomplete metadata' }) };
  }

  // ── Idempotency check ─────────────────────────────────────
  try {
    const checkUrl = `${SUPABASE_URL}/rest/v1/bookings?confirmation_code=eq.${encodeURIComponent(session.id)}&property_id=eq.${PROPERTY_ID}&select=id&limit=1`;
    const checkRes = await fetch(checkUrl, { headers: sbHeaders });
    const existing = await checkRes.json();
    if (Array.isArray(existing) && existing.length > 0) {
      console.log('Duplicate webhook ignored:', session.id);
      return { statusCode: 200, body: JSON.stringify({ received: true, duplicate: true }) };
    }
  } catch (err) {
    console.warn('Idempotency check failed:', err.message);
  }

  // ── Generate reference code ────────────────────────────────
  const refCode = 'GH-' + Date.now().toString(36).toUpperCase().slice(-5);

  // ── Write booking to Supabase ──────────────────────────────
  const nights     = parseInt(meta.nights) || 0;
  const total      = parseFloat(meta.total) || 0;
  const amountPaid = (session.amount_total || 0) / 100;

  const booking = {
    user_id: HOST_USER_ID,
    property_id: PROPERTY_ID,
    local_id: 'direct-' + session.id.slice(-12),
    checkin: meta.checkIn,
    checkout: meta.checkOut,
    nights,
    guest_name: meta.guestName,
    email: meta.email,
    phone: meta.phone || null,
    guests: parseInt(meta.guests) || 1,
    host_payout: total,
    platform: 'Direct',
    confirmation_code: session.id,
    status: 'confirmed',
    source: 'direct-booking',
    message: meta.message || null,
    emails_sent: JSON.stringify(['confirmation']),
  };

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/bookings`, {
      method: 'POST',
      headers: { ...sbHeaders, 'Prefer': 'return=minimal' },
      body: JSON.stringify(booking),
    });
    if (!res.ok) throw new Error('Supabase returned ' + res.status);
    console.log('Booking confirmed:', meta.checkIn, '→', meta.checkOut, 'for', meta.guestName);
  } catch (err) {
    console.error('Supabase write failed:', err.message);
  }

  // ── Calculate cancellation date (7 days before check-in) ───
  const ciDate = new Date(meta.checkIn + 'T00:00:00');
  const cancelDate = new Date(ciDate);
  cancelDate.setDate(cancelDate.getDate() - 7);
  const cancellationDate = cancelDate > new Date() ? cancelDate.toISOString().split('T')[0] : null;

  // ── Send branded confirmation email to guest ───────────────
  if (RESEND_API_KEY) {
    const html = confirmationEmail({
      guestName: meta.guestName,
      checkIn: meta.checkIn,
      checkOut: meta.checkOut,
      nights,
      guests: parseInt(meta.guests) || 1,
      total,
      amountPaid,
      avgNightly: Math.round((total - 150) / (nights || 1)),
      cleaningFee: 150,
      discountAmt: 0,
      losDiscount: 0,
      refCode,
      cancellationDate,
      siteUrl: SITE_URL,
    });

    try {
      const guestRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: RESEND_FROM || 'Glenhaven Bookings <noreply@resend.dev>',
          to: meta.email,
          subject: `Booking confirmed: Glenhaven · ${meta.checkIn} → ${meta.checkOut}`,
          html,
        }),
      });
      if (!guestRes.ok) {
        const errBody = await guestRes.text();
        console.error('Guest email failed:', guestRes.status, errBody);
      } else {
        console.log('Guest confirmation email sent to:', meta.email);
      }
    } catch (err) {
      console.error('Guest email failed:', err.message);
    }

    // Host notification (simpler)
    if (HOST_EMAIL) {
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: RESEND_FROM || 'Glenhaven Bookings <noreply@resend.dev>',
            to: HOST_EMAIL,
            subject: `New booking: ${meta.guestName} · ${meta.checkIn} → ${meta.checkOut} · ${refCode}`,
            html: `<h2>New Confirmed Booking</h2>
              <p><strong>Ref:</strong> ${refCode}</p>
              <p><strong>Guest:</strong> ${meta.guestName} (${meta.email})</p>
              <p><strong>Dates:</strong> ${meta.checkIn} → ${meta.checkOut} (${nights} nights)</p>
              <p><strong>Guests:</strong> ${meta.guests}</p>
              <p><strong>Total:</strong> $${total} AUD</p>
              <p><strong>Paid:</strong> $${amountPaid} AUD</p>
              <p><strong>Stripe:</strong> ${session.id}</p>`,
          }),
        });
        console.log('Host notification email sent');
      } catch (err) {
        console.error('Host email failed:', err.message);
      }
    }
  }

  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ received: true }) };
};
