// ── /api/reviews ─────────────────────────────────────────────
// GET → returns approved reviews for the public reviews page
// Used by admin too — pass ?status=all with admin password to see everything

const { SUPABASE_URL, SUPABASE_SERVICE_KEY, PROPERTY_ID, ADMIN_PASSWORD } = process.env;

const sbHeaders = {
  'apikey': SUPABASE_SERVICE_KEY,
  'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-admin-password',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders, body: '' };

  // ── GET — fetch reviews ────────────────────────────────────
  if (event.httpMethod === 'GET') {
    const showAll = event.queryStringParameters?.status === 'all';
    const adminPwd = event.headers?.['x-admin-password'] || '';
    const isAdmin = showAll && adminPwd === ADMIN_PASSWORD;

    let filter = `property_id=eq.${PROPERTY_ID}`;
    if (!isAdmin) filter += '&status=eq.approved';

    try {
      const url = `${SUPABASE_URL}/rest/v1/reviews?${filter}&order=created_at.desc&select=id,guest_name,rating,review_text,stay_date,status,created_at`;
      const res = await fetch(url, { headers: sbHeaders });
      const rows = await res.json();
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true, reviews: Array.isArray(rows) ? rows : [] }) };
    } catch (err) {
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: err.message }) };
    }
  }

  // ── PATCH — approve/reject (admin only) ────────────────────
  if (event.httpMethod === 'PATCH') {
    const adminPwd = event.headers?.['x-admin-password'] || '';
    if (!adminPwd || adminPwd !== ADMIN_PASSWORD) {
      return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    let body;
    try { body = JSON.parse(event.body); }
    catch { return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

    const { id, status } = body;
    if (!id || !['approved', 'rejected'].includes(status)) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'id and status (approved/rejected) required' }) };
    }

    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/reviews?id=eq.${id}`, {
        method: 'PATCH',
        headers: { ...sbHeaders, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error('Supabase returned ' + res.status);
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true }) };
    } catch (err) {
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: err.message }) };
    }
  }

  return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
};
