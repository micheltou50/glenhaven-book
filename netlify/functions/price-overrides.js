// ── /api/price-overrides ─────────────────────────────────────
// GET  → returns all overrides for the property
// POST → upsert overrides (array of {date, price}) or delete (price=null)
// Requires x-admin-password header

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

  // ── GET — fetch all overrides ──────────────────────────────
  if (event.httpMethod === 'GET') {
    try {
      const url = `${SUPABASE_URL}/rest/v1/price_overrides?property_id=eq.${PROPERTY_ID}&select=date,price&order=date.asc`;
      const res = await fetch(url, { headers: sbHeaders });
      const rows = await res.json();
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true, overrides: Array.isArray(rows) ? rows : [] }) };
    } catch (err) {
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: err.message }) };
    }
  }

  // ── POST — upsert or delete overrides ──────────────────────
  if (event.httpMethod === 'POST') {
    const pwd = (event.headers['x-admin-password'] || '').trim();
    if (!pwd || pwd !== ADMIN_PASSWORD) {
      return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    let body;
    try { body = JSON.parse(event.body); }
    catch { return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

    const { overrides } = body;
    if (!Array.isArray(overrides)) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'overrides array required' }) };
    }

    try {
      const toUpsert = [];
      const toDelete = [];

      for (const o of overrides) {
        if (!o.date) continue;
        if (o.price === null || o.price === undefined || o.price === '') {
          toDelete.push(o.date);
        } else {
          toUpsert.push({ property_id: PROPERTY_ID, date: o.date, price: parseFloat(o.price) });
        }
      }

      // Delete cleared overrides
      if (toDelete.length) {
        for (const d of toDelete) {
          await fetch(`${SUPABASE_URL}/rest/v1/price_overrides?property_id=eq.${PROPERTY_ID}&date=eq.${d}`, {
            method: 'DELETE',
            headers: sbHeaders,
          });
        }
      }

      // Upsert new/updated overrides
      if (toUpsert.length) {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/price_overrides`, {
          method: 'POST',
          headers: { ...sbHeaders, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify(toUpsert),
        });
        if (!res.ok) throw new Error('Supabase returned ' + res.status);
      }

      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true, upserted: toUpsert.length, deleted: toDelete.length }) };
    } catch (err) {
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: err.message }) };
    }
  }

  return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
};
