// ── /api/book ────────────────────────────────────────────────
// 1. Checks availability against Google Sheet
// 2. Creates Stripe Checkout session
// 3. Fires enquiry emails via Apps Script
// All server-side — no CORS, keys never exposed to browser.

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch {
    return respond(400, { success: false, error: 'Invalid request body.' });
  }

  const { checkIn, checkOut, nights, guestName, email, phone, guests, message, total, totalAmount } = payload;
  const chargeAmount = totalAmount || total; // use deposit amount if provided
  if (!checkIn || !checkOut || !nights || !guestName || !email || !guests || (!total && !totalAmount)) {
    return respond(200, { success: false, error: 'Missing required booking fields.' });
  }

  const APPS_SCRIPT_URL  = process.env.APPS_SCRIPT_URL;
  const STRIPE_SECRET    = process.env.STRIPE_SECRET_KEY;
  const SITE_URL         = process.env.URL || 'https://glenhaven-book.netlify.app';

  // ── 1. Check availability ──────────────────────────────────
  try {
    const avRes  = await fetch(`${APPS_SCRIPT_URL}?action=availability`);
    const avData = await avRes.json();
    if (avData.success && Array.isArray(avData.ranges)) {
      const conflict = avData.ranges.some(r => checkIn < r.end && checkOut > r.start);
      if (conflict) {
        return respond(200, { success: false, error: 'Those dates are already booked. Please choose different dates.' });
      }
    }
  } catch (err) {
    // Availability check failed — block booking to prevent double-bookings
    // Better to show an error than allow a double booking
    console.error('Availability check failed:', err.message);
    return respond(200, { success: false, error: 'Could not verify availability. Please try again in a moment.' });
  }

  // ── 2. Create Stripe Checkout session ─────────────────────
  const params = new URLSearchParams({
    'payment_method_types[]'                                : 'card',
    'line_items[0][price_data][currency]'                   : 'aud',
    'line_items[0][price_data][unit_amount]'                : String(Math.round(chargeAmount * 100)),
    'line_items[0][price_data][product_data][name]'         : 'Glenhaven — Blue Mountains Cottage',
    'line_items[0][price_data][product_data][description]'  : `${chargeAmount < total ? '30% deposit — ' : ''}${nights} night${nights>1?'s':''} · ${checkIn} → ${checkOut} · ${guests} guest${guests>1?'s':''}`,
    'line_items[0][quantity]'                               : '1',
    'mode'                                                  : 'payment',
    'customer_email'                                        : email,
    'success_url'                                           : `${SITE_URL}/confirmation.html?booking=success`,
    'cancel_url'                                            : `${SITE_URL}/confirmation.html?booking=cancelled`,
    // Store everything in metadata so the webhook can confirm the booking
    'metadata[checkIn]'                                     : checkIn,
    'metadata[checkOut]'                                    : checkOut,
    'metadata[nights]'                                      : String(nights),
    'metadata[guestName]'                                   : guestName,
    'metadata[email]'                                       : email,
    'metadata[phone]'                                       : phone || '',
    'metadata[guests]'                                      : String(guests),
    'metadata[total]'                                       : String(total),
    'metadata[message]'                                     : (message || '').slice(0, 500),
  });

  let session;
  try {
    const sRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method  : 'POST',
      headers : {
        'Authorization' : `Bearer ${STRIPE_SECRET}`,
        'Content-Type'  : 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    session = await sRes.json();
  } catch (err) {
    return respond(200, { success: false, error: 'Could not connect to payment provider. Please try again.' });
  }

  if (session.error) {
    return respond(200, { success: false, error: `Payment setup failed: ${session.error.message}` });
  }

  // ── 3. Fire enquiry emails (non-blocking) ─────────────────
  const enquiryPayload = { action: 'enquiry', checkIn, checkOut, nights, guestName, email, phone, guests, message, total, paymentLink: session.url };
  fetch(`${APPS_SCRIPT_URL}?payload=${encodeURIComponent(JSON.stringify(enquiryPayload))}`)
    .catch(err => console.warn('Enquiry email failed:', err.message));

  return respond(200, { success: true, paymentLink: session.url });
};

function respond(status, body) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}
