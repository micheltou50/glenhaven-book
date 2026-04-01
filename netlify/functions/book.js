// ── /api/book ────────────────────────────────────────────────
// 1. Checks availability in Supabase
// 2. Creates Stripe Checkout session

const { SUPABASE_URL, SUPABASE_SERVICE_KEY, PROPERTY_ID, STRIPE_SECRET_KEY } = process.env;
const SITE_URL = process.env.URL || 'https://glenhaven-book.netlify.app';

const sbHeaders = {
  'apikey': SUPABASE_SERVICE_KEY,
  'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
};

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  let payload;
  try { payload = JSON.parse(event.body); }
  catch { return respond(400, { success: false, error: 'Invalid request body.' }); }

  const { checkIn, checkOut, nights, guestName, email, phone, guests, message, total, totalAmount, cleaningFee } = payload;
  const chargeAmount = totalAmount || total;
  if (!checkIn || !checkOut || !nights || !guestName || !email || !guests || (!total && !totalAmount)) {
    return respond(200, { success: false, error: 'Missing required booking fields.' });
  }

  // ── 1. Check availability in Supabase ──────────────────────
  try {
    const url = `${SUPABASE_URL}/rest/v1/bookings?property_id=eq.${PROPERTY_ID}&status=neq.cancelled&select=checkin,checkout`;
    const res = await fetch(url, { headers: sbHeaders });
    const rows = await res.json();
    if (Array.isArray(rows)) {
      const conflict = rows.some(r => checkIn < r.checkout && checkOut > r.checkin);
      if (conflict) {
        return respond(200, { success: false, error: 'Those dates are already booked. Please choose different dates.' });
      }
    }
  } catch (err) {
    console.error('Availability check failed:', err.message);
    return respond(200, { success: false, error: 'Could not verify availability. Please try again in a moment.' });
  }

  // ── 2. Create Stripe Checkout session ──────────────────────
  const params = new URLSearchParams({
    'payment_method_types[]'                               : 'card',
    'line_items[0][price_data][currency]'                   : 'aud',
    'line_items[0][price_data][unit_amount]'                : String(Math.round(chargeAmount * 100)),
    'line_items[0][price_data][product_data][name]'         : 'Glenhaven — Blue Mountains Cottage',
    'line_items[0][price_data][product_data][description]'  : `${nights} night${nights > 1 ? 's' : ''} · ${checkIn} → ${checkOut} · ${guests} guest${guests > 1 ? 's' : ''}`,
    'line_items[0][quantity]'                               : '1',
    'mode'                                                  : 'payment',
    'customer_email'                                        : email,
    'success_url'                                           : `${SITE_URL}/confirmation.html?booking=success`,
    'cancel_url'                                            : `${SITE_URL}/confirmation.html?booking=cancelled`,
    'metadata[checkIn]'    : checkIn,
    'metadata[checkOut]'   : checkOut,
    'metadata[nights]'     : String(nights),
    'metadata[guestName]'  : guestName,
    'metadata[email]'      : email,
    'metadata[phone]'      : phone || '',
    'metadata[guests]'     : String(guests),
    'metadata[total]'      : String(total),
    'metadata[cleaningFee]': String(cleaningFee || 150),
    'metadata[message]'    : (message || '').slice(0, 500),
  });

  let session;
  try {
    const sRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    session = await sRes.json();
  } catch (err) {
    return respond(200, { success: false, error: 'Could not connect to payment provider. Please try again.' });
  }

  if (session.error) {
    return respond(200, { success: false, error: `Payment setup failed: ${session.error.message}` });
  }

  return respond(200, { success: true, paymentLink: session.url });
};

function respond(status, body) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}
