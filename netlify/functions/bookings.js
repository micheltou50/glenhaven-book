// ── /api/bookings ─────────────────────────────────────────────
// GET → returns all bookings from Supabase for the admin dashboard
// Requires the admin password — this endpoint exposes guest personal
// information (names, emails, phone numbers), so it must never be public.

const { SUPABASE_URL, SUPABASE_SERVICE_KEY, PROPERTY_ID, ADMIN_PASSWORD } = process.env;

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-admin-password',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  // ── Auth: admin password required (protects guest PII) ───────
  if (!ADMIN_PASSWORD) {
    return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: 'ADMIN_PASSWORD not set' }) };
  }
  const supplied = (event.headers['x-admin-password'] || '').trim();
  if (!supplied || supplied !== ADMIN_PASSWORD) {
    return { statusCode: 401, headers, body: JSON.stringify({ success: false, error: 'Unauthorized' }) };
  }

  try {
    const url = `${SUPABASE_URL}/rest/v1/bookings?property_id=eq.${PROPERTY_ID}&order=checkin.desc&select=id,checkin,checkout,guest_name,email,phone,guests,host_payout,cleaning_fee,platform,status,confirmation_code,source,created_at`;
    const res = await fetch(url, {
      headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}` },
    });
    const rows = await res.json();

    // Map to the shape the admin frontend expects
    const bookings = (Array.isArray(rows) ? rows : []).map(r => ({
      id: r.id,
      checkIn: r.checkin,
      checkOut: r.checkout,
      guestName: r.guest_name,
      email: r.email,
      phone: r.phone,
      guests: r.guests,
      total: r.host_payout,
      platform: r.platform,
      status: r.status,
      confirmationCode: r.confirmation_code,
    }));

    return { statusCode: 200, headers, body: JSON.stringify({ success: true, bookings }) };
  } catch (err) {
    console.error('[bookings]', err.message);
    return { statusCode: 502, headers, body: JSON.stringify({ success: false, error: err.message }) };
  }
};
