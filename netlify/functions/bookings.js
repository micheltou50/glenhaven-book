// ── /api/bookings ─────────────────────────────────────────────
// GET → returns all bookings from the Google Sheet for the admin dashboard

exports.handler = async (event) => {
  const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;

  const headers = {
    'Content-Type'                : 'application/json',
    'Access-Control-Allow-Origin' : '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  if (!APPS_SCRIPT_URL) {
    return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: 'APPS_SCRIPT_URL not set' }) };
  }

  try {
    const res  = await fetch(APPS_SCRIPT_URL + '?action=getAdminBookings');
    const data = await res.json();
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  } catch (err) {
    console.error('[bookings]', err.message);
    return { statusCode: 502, headers, body: JSON.stringify({ success: false, error: err.message }) };
  }
};
