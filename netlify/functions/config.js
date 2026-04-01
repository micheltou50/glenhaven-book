// ── /api/config ──────────────────────────────────────────────
// GET  → returns published site config from Supabase site_config table
// POST → saves config to Supabase (requires x-admin-password header)

const { SUPABASE_URL, SUPABASE_SERVICE_KEY, PROPERTY_ID, ADMIN_PASSWORD } = process.env;

const sbHeaders = {
  'apikey': SUPABASE_SERVICE_KEY,
  'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-admin-password',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders, body: '' };

  // ── GET ────────────────────────────────────────────────────
  if (event.httpMethod === 'GET') {
    try {
      const url = `${SUPABASE_URL}/rest/v1/site_config?property_id=eq.${PROPERTY_ID}&select=config,updated_at&limit=1`;
      const res = await fetch(url, { headers: sbHeaders });
      const rows = await res.json();

      if (!Array.isArray(rows) || rows.length === 0) {
        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ status: 'empty', config: null }) };
      }

      const row = rows[0];
      const config = row.config || null;
      if (!config) {
        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ status: 'empty', config: null }) };
      }

      if (row.updated_at) config.savedAt = row.updated_at;
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ status: 'ok', config }) };
    } catch (err) {
      console.error('[config GET]', err.message);
      return { statusCode: 502, headers: corsHeaders, body: JSON.stringify({ status: 'error', error: err.message }) };
    }
  }

  // ── POST ───────────────────────────────────────────────────
  if (event.httpMethod === 'POST') {
    if (!ADMIN_PASSWORD) {
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'ADMIN_PASSWORD not set' }) };
    }

    const supplied = (event.headers['x-admin-password'] || '').trim();
    if (!supplied || supplied !== ADMIN_PASSWORD) {
      return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    let config;
    try { config = JSON.parse(event.body); }
    catch { return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

    try {
      // Upsert: insert or update by property_id
      const url = `${SUPABASE_URL}/rest/v1/site_config?on_conflict=property_id`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { ...sbHeaders, 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify({
          property_id: PROPERTY_ID,
          config: config,
          updated_at: new Date().toISOString(),
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error('Supabase returned ' + res.status + ': ' + text);
      }

      const savedAt = new Date().toISOString();
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true, savedAt }) };
    } catch (err) {
      console.error('[config POST]', err.message);
      return { statusCode: 502, headers: corsHeaders, body: JSON.stringify({ error: err.message }) };
    }
  }

  return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method Not Allowed' }) };
};
