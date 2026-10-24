// ── /api/reviews ─────────────────────────────────────────────
// GET    → approved reviews for the public reviews page
//          (admin: ?status=all with x-admin-password to see everything)
// PATCH  → admin: approve / reject, and/or edit guest_name, rating, stay_date,
//          review_text (used to complete reviews Airbnb's email cut short)
// POST   → admin: add a review (imported ones are approved immediately)
// DELETE → admin: remove a review
//
// Rows also arrive from StayOps: its email scanner parses Airbnb's
// "<Name> left a 5-star review!" emails and inserts them here as
// status='pending', platform='airbnb'. Only approved rows are ever public.

const { SUPABASE_URL, SUPABASE_SERVICE_KEY, PROPERTY_ID, ADMIN_PASSWORD } = process.env;

const sbHeaders = {
  'apikey': SUPABASE_SERVICE_KEY,
  'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
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
      const url = `${SUPABASE_URL}/rest/v1/reviews?${filter}&order=created_at.desc&select=id,guest_name,rating,review_text,stay_date,status,platform,created_at`;
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

    const { id, status, guest_name, rating, review_text, stay_date } = body;
    if (!id) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'id required' }) };
    }
    const patch = {};
    if (status != null) {
      if (!['approved', 'rejected', 'pending'].includes(status)) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'status must be approved, rejected or pending' }) };
      }
      patch.status = status;
    }
    if (guest_name != null) {
      const g = String(guest_name).trim().slice(0, 80);
      if (!g) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'guest_name cannot be empty' }) };
      patch.guest_name = g;
    }
    if (rating != null) {
      const n = parseInt(rating);
      if (!(n >= 1 && n <= 5)) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'rating must be 1-5' }) };
      patch.rating = n;
    }
    if (review_text != null) {
      const t = String(review_text).trim();
      if (t.length < 5) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'review_text is too short' }) };
      patch.review_text = t.slice(0, 4000);
    }
    if (stay_date != null) {
      patch.stay_date = String(stay_date).trim().slice(0, 60) || null;
    }
    if (!Object.keys(patch).length) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'nothing to update' }) };
    }

    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/reviews?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { ...sbHeaders, 'Prefer': 'return=minimal' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error('Supabase returned ' + res.status);
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true }) };
    } catch (err) {
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: err.message }) };
    }
  }

  // ── POST — add review (admin only) ──────────────────────────
  if (event.httpMethod === 'POST') {
    const adminPwd = event.headers?.['x-admin-password'] || '';
    if (!adminPwd || adminPwd !== ADMIN_PASSWORD) {
      return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    let body;
    try { body = JSON.parse(event.body); }
    catch { return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

    const { guest_name, rating, review_text, stay_date, platform } = body;
    if (!guest_name || !rating || !review_text) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'guest_name, rating, and review_text required' }) };
    }

    const row = {
      property_id: PROPERTY_ID,
      guest_name,
      rating: Math.min(5, Math.max(1, parseInt(rating))),
      review_text,
      stay_date: stay_date || null,
      platform: platform || 'direct',
      status: 'approved',
    };

    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/reviews`, {
        method: 'POST',
        headers: { ...sbHeaders, 'Prefer': 'return=representation' },
        body: JSON.stringify(row),
      });
      if (!res.ok) throw new Error('Supabase returned ' + res.status);
      const created = await res.json();
      return { statusCode: 201, headers: corsHeaders, body: JSON.stringify({ success: true, review: created[0] || created }) };
    } catch (err) {
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: err.message }) };
    }
  }

  // ── DELETE — remove review (admin only) ────────────────────
  if (event.httpMethod === 'DELETE') {
    const adminPwd = event.headers?.['x-admin-password'] || '';
    if (!adminPwd || adminPwd !== ADMIN_PASSWORD) {
      return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    const id = event.queryStringParameters?.id;
    if (!id) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'id required' }) };

    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/reviews?id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { ...sbHeaders, 'Prefer': 'return=minimal' },
      });
      if (!res.ok) throw new Error('Supabase returned ' + res.status);
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true }) };
    } catch (err) {
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: err.message }) };
    }
  }

  return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
};
