// ── /api/book ────────────────────────────────────────────────
// 1. Checks availability in Supabase
// 2. Creates Stripe Checkout session

const { loadSiteConfig, getPropertyName } = require('./site-config-loader');
const { calcServerPrice } = require('./pricing');

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
  const clientTotal = totalAmount || total;
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

  // ── 2. Recompute the price on the server ───────────────────
  // The browser is never trusted for the amount. We recompute from the same
  // config + price overrides the front-end uses, and reject if it disagrees.
  const siteConfig = await loadSiteConfig();
  const propName = getPropertyName(siteConfig);

  let overrides = {};
  try {
    const ovUrl = `${SUPABASE_URL}/rest/v1/price_overrides?property_id=eq.${PROPERTY_ID}&select=date,price`;
    const ovRes = await fetch(ovUrl, { headers: sbHeaders });
    const ovRows = await ovRes.json();
    if (Array.isArray(ovRows)) ovRows.forEach(r => { overrides[r.date] = parseFloat(r.price); });
  } catch (err) {
    console.warn('Price overrides fetch failed:', err.message);
  }

  const priced = calcServerPrice({ checkIn, checkOut, guests, cfg: siteConfig, overrides });
  if (!priced) {
    return respond(200, { success: false, error: 'Could not calculate a price for those dates. Please try again.' });
  }
  if (parseInt(guests) > priced.maxGuests) {
    return respond(200, { success: false, error: `This property accommodates a maximum of ${priced.maxGuests} guests.` });
  }

  // ── Returning-guest promo code (validated server-side; authoritative) ──
  // The browser may apply a 5% code for display, but the discount is only ever
  // honoured if the code is real, approved, unused and unexpired here.
  let chargeAmount = priced.total;
  let appliedPromo = null;
  if (payload.promoCode) {
    const promo = await validatePromo(payload.promoCode);
    if (!promo.valid) {
      return respond(200, { success: false, error: 'That discount code is no longer valid. Please remove it and try again.' });
    }
    const discount = Math.round(priced.total * (promo.discountPct / 100));
    chargeAmount = priced.total - discount;   // computed exactly as the client does
    appliedPromo = payload.promoCode;
  }

  // Authoritative total. Reject if the browser's figure doesn't match (tampering,
  // or the price changed since the page was loaded).
  if (Math.abs(chargeAmount - Number(clientTotal)) > 1) {
    console.warn(`Price mismatch — client=${clientTotal} server=${chargeAmount} (${checkIn}→${checkOut}, ${guests} guests)`);
    return respond(200, { success: false, error: 'The price for these dates has changed. Please refresh the page and try again.' });
  }

  const params = new URLSearchParams({
    'payment_method_types[]'                               : 'card',
    'line_items[0][price_data][currency]'                   : 'aud',
    'line_items[0][price_data][unit_amount]'                : String(Math.round(chargeAmount * 100)),
    'line_items[0][price_data][product_data][name]'         : propName,
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
    'metadata[total]'      : String(chargeAmount),
    'metadata[cleaningFee]': String(priced.cleaningFee),
    'metadata[message]'    : (message || '').slice(0, 500),
    'metadata[promoCode]'  : appliedPromo || '',
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

// Re-validate a returning-guest promo code at charge time (authoritative).
async function validatePromo(code) {
  try {
    const url = `${SUPABASE_URL}/rest/v1/guest_offers?promo_code=eq.${encodeURIComponent(code)}`
      + `&property_id=eq.${PROPERTY_ID}&select=status,discount_pct,expires_at,redeemed_at&limit=1`;
    const res = await fetch(url, { headers: sbHeaders });
    const rows = await res.json();
    const o = Array.isArray(rows) ? rows[0] : null;
    if (!o || o.status !== 'approved' || o.redeemed_at) return { valid: false };
    if (o.expires_at && o.expires_at < todayISO()) return { valid: false };
    return { valid: true, discountPct: o.discount_pct || 5 };
  } catch (err) {
    console.error('[book] promo validation failed:', err.message);
    return { valid: false };
  }
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function respond(status, body) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}
