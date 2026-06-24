// ── /api/validate-promo ──────────────────────────────────────
// GET ?code=XXXX → { valid, discountPct } for a returning-guest 5% code.
// Display-only convenience for the booking page; book.js re-validates the code
// authoritatively before charging, so this can never be trusted for the price.

const { SUPABASE_URL, SUPABASE_SERVICE_KEY, PROPERTY_ID } = process.env;

const sbHeaders = {
  'apikey': SUPABASE_SERVICE_KEY,
  'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
};

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return resp(200, {});
  if (event.httpMethod !== 'GET') return resp(405, { valid: false, error: 'Method not allowed' });

  const code = (event.queryStringParameters?.code || '').trim();
  if (!code) return resp(200, { valid: false, reason: 'missing' });

  try {
    const url = `${SUPABASE_URL}/rest/v1/guest_offers?promo_code=eq.${encodeURIComponent(code)}`
      + `&property_id=eq.${PROPERTY_ID}&select=status,discount_pct,expires_at,redeemed_at&limit=1`;
    const res = await fetch(url, { headers: sbHeaders });
    const rows = await res.json();
    const offer = Array.isArray(rows) ? rows[0] : null;

    if (!offer || offer.status !== 'approved') return resp(200, { valid: false, reason: 'invalid' });
    if (offer.redeemed_at)                       return resp(200, { valid: false, reason: 'used' });
    if (offer.expires_at && offer.expires_at < todayISO()) return resp(200, { valid: false, reason: 'expired' });

    return resp(200, { valid: true, discountPct: offer.discount_pct || 5 });
  } catch (err) {
    console.error('[validate-promo]', err.message);
    return resp(200, { valid: false, reason: 'error' });
  }
};

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function resp(status, body) {
  return { statusCode: status, headers: corsHeaders, body: JSON.stringify(body) };
}
