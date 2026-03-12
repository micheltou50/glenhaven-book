// ── /api/contact ──────────────────────────────────────────────
// POST → sends contact form message via Apps Script email

exports.handler = async (event) => {
  const headers = {
    'Content-Type'                : 'application/json',
    'Access-Control-Allow-Origin' : '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers, body: JSON.stringify({ success: false, error: 'Method not allowed' }) };

  const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
  if (!APPS_SCRIPT_URL) return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: 'APPS_SCRIPT_URL not set' }) };

  try {
    const body = JSON.parse(event.body || '{}');
    const payload = {
      action  : 'contact',
      name    : body.name    || '',
      email   : body.email   || '',
      topic   : body.topic   || 'General',
      message : body.message || '',
    };

    const res  = await fetch(`${APPS_SCRIPT_URL}?payload=${encodeURIComponent(JSON.stringify(payload))}`);
    const data = await res.json();

    return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
  } catch (err) {
    console.error('[contact]', err.message);
    return { statusCode: 502, headers, body: JSON.stringify({ success: false, error: err.message }) };
  }
};
