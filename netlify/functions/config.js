// ── /api/config ────────────────────────────────────────────────────────────
// GET  → returns published site config from Google Drive
//         Response shape:
//           { status: 'ok',        config: {...} }   — config loaded
//           { status: 'empty',     config: null  }   — no config saved yet (normal first run)
//           { status: 'error',     error: '...'  }   — something went wrong (surface to admin)
//
// POST → saves config to Google Drive (requires x-admin-password header)
//         Response shape:
//           { success: true, savedAt: '...' }
//           { error: '...' }

exports.handler = async (event) => {
  const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
  const ADMIN_PASSWORD  = process.env.ADMIN_PASSWORD;

  const headers = {
    'Content-Type'                : 'application/json',
    'Access-Control-Allow-Origin' : '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-admin-password',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // APPS_SCRIPT_URL is required for both GET and POST
  if (!APPS_SCRIPT_URL) {
    console.error('[config] APPS_SCRIPT_URL env var not set');
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ status: 'error', error: 'Server misconfiguration: APPS_SCRIPT_URL is not set' }),
    };
  }

  // ── GET ────────────────────────────────────────────────────────────────
  if (event.httpMethod === 'GET') {
    let appsScriptRes;
    try {
      appsScriptRes = await fetch(APPS_SCRIPT_URL + '?action=getSiteConfig');
    } catch (err) {
      const msg = 'Could not reach Apps Script: ' + err.message;
      console.error('[config GET]', msg);
      // Return 502 so the frontend knows this is a real server error, not just "no config yet"
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({ status: 'error', error: msg }),
      };
    }

    if (!appsScriptRes.ok) {
      const msg = 'Apps Script returned HTTP ' + appsScriptRes.status;
      console.error('[config GET]', msg);
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({ status: 'error', error: msg }),
      };
    }

    let data;
    try {
      data = await appsScriptRes.json();
    } catch (err) {
      const msg = 'Apps Script response was not valid JSON';
      console.error('[config GET]', msg);
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({ status: 'error', error: msg }),
      };
    }

    if (!data.success) {
      const msg = data.error || 'Apps Script reported failure with no error message';
      console.error('[config GET] Apps Script error:', msg);
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({ status: 'error', error: msg }),
      };
    }

    // config === null just means no file saved yet — that is normal on first run
    if (data.config === null || data.config === undefined) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ status: 'empty', config: null }),
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ status: 'ok', config: data.config }),
    };
  }

  // ── POST ───────────────────────────────────────────────────────────────
  if (event.httpMethod === 'POST') {
    if (!ADMIN_PASSWORD) {
      console.error('[config POST] ADMIN_PASSWORD env var not set');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Server misconfiguration: ADMIN_PASSWORD is not set' }),
      };
    }

    const supplied = (event.headers['x-admin-password'] || '').trim();
    if (!supplied || supplied !== ADMIN_PASSWORD) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Unauthorized — incorrect admin password' }),
      };
    }

    let config;
    try {
      config = JSON.parse(event.body);
    } catch (err) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Request body is not valid JSON' }),
      };
    }

    let appsScriptRes;
    try {
      appsScriptRes = await fetch(APPS_SCRIPT_URL, {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ action: 'saveSiteConfig', data: config }),
      });
    } catch (err) {
      const msg = 'Could not reach Apps Script: ' + err.message;
      console.error('[config POST]', msg);
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({ error: msg }),
      };
    }

    if (!appsScriptRes.ok) {
      const body = await appsScriptRes.text().catch(() => '(unreadable)');
      const msg  = 'Apps Script returned HTTP ' + appsScriptRes.status + ': ' + body;
      console.error('[config POST]', msg);
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({ error: msg }),
      };
    }

    let data;
    try {
      data = await appsScriptRes.json();
    } catch (err) {
      const msg = 'Apps Script response was not valid JSON';
      console.error('[config POST]', msg);
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({ error: msg }),
      };
    }

    if (!data.success) {
      const msg = data.error || 'Apps Script reported failure with no error message';
      console.error('[config POST] Apps Script error:', msg);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: msg }),
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, savedAt: data.savedAt }),
    };
  }

  return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
};
