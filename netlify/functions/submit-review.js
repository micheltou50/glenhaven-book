// ── /api/submit-review ───────────────────────────────────────
// POST → validates return code against bookings, saves review as pending
// GET  → returns booking info for the review form (guest name, stay dates)

const { SUPABASE_URL, SUPABASE_SERVICE_KEY, PROPERTY_ID } = process.env;

const sbHeaders = {
  'apikey': SUPABASE_SERVICE_KEY,
  'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders, body: '' };

  const ref = event.queryStringParameters?.ref || '';

  // ── GET — look up booking by return code ───────────────────
  if (event.httpMethod === 'GET') {
    if (!ref) return respond(400, { error: 'Missing ref code' });

    try {
      const url = `${SUPABASE_URL}/rest/v1/bookings?return_code=eq.${encodeURIComponent(ref)}&property_id=eq.${PROPERTY_ID}&select=id,guest_name,checkin,checkout&limit=1`;
      const res = await fetch(url, { headers: sbHeaders });
      const rows = await res.json();

      if (!Array.isArray(rows) || rows.length === 0) {
        return respond(404, { error: 'Invalid or expired review link' });
      }

      // Check if already reviewed
      const checkUrl = `${SUPABASE_URL}/rest/v1/reviews?return_code=eq.${encodeURIComponent(ref)}&select=id&limit=1`;
      const checkRes = await fetch(checkUrl, { headers: sbHeaders });
      const existing = await checkRes.json();
      if (Array.isArray(existing) && existing.length > 0) {
        return respond(409, { error: 'You have already submitted a review for this stay. Thank you!' });
      }

      const bk = rows[0];
      return respond(200, {
        guestName: bk.guest_name,
        stayDate: bk.checkin + ' → ' + bk.checkout,
        bookingId: bk.id,
      });
    } catch (err) {
      return respond(500, { error: err.message });
    }
  }

  // ── POST — submit the review ───────────────────────────────
  if (event.httpMethod === 'POST') {
    let body;
    try { body = JSON.parse(event.body); }
    catch { return respond(400, { error: 'Invalid JSON' }); }

    const { ref: reviewRef, rating, reviewText } = body;

    if (!reviewRef) return respond(400, { error: 'Missing ref code' });
    if (!rating || rating < 1 || rating > 5) return respond(400, { error: 'Rating must be 1-5' });
    if (!reviewText || reviewText.trim().length < 10) return respond(400, { error: 'Please write at least a short review' });

    // Validate the return code
    try {
      const url = `${SUPABASE_URL}/rest/v1/bookings?return_code=eq.${encodeURIComponent(reviewRef)}&property_id=eq.${PROPERTY_ID}&select=id,guest_name,checkin,checkout&limit=1`;
      const res = await fetch(url, { headers: sbHeaders });
      const rows = await res.json();

      if (!Array.isArray(rows) || rows.length === 0) {
        return respond(404, { error: 'Invalid review link' });
      }

      // Check for duplicate
      const checkUrl = `${SUPABASE_URL}/rest/v1/reviews?return_code=eq.${encodeURIComponent(reviewRef)}&select=id&limit=1`;
      const checkRes = await fetch(checkUrl, { headers: sbHeaders });
      const existing = await checkRes.json();
      if (Array.isArray(existing) && existing.length > 0) {
        return respond(409, { error: 'You have already submitted a review for this stay' });
      }

      const bk = rows[0];

      // Save review as pending
      const review = {
        property_id: PROPERTY_ID,
        booking_id: bk.id,
        return_code: reviewRef,
        guest_name: bk.guest_name,
        rating: parseInt(rating),
        review_text: reviewText.trim(),
        stay_date: bk.checkin + ' → ' + bk.checkout,
        status: 'pending',
      };

      const saveRes = await fetch(`${SUPABASE_URL}/rest/v1/reviews`, {
        method: 'POST',
        headers: { ...sbHeaders, 'Prefer': 'return=minimal' },
        body: JSON.stringify(review),
      });

      if (!saveRes.ok) throw new Error('Failed to save review');

      return respond(200, { success: true });
    } catch (err) {
      return respond(500, { error: err.message });
    }
  }

  return respond(405, { error: 'Method not allowed' });
};

function respond(status, body) {
  return { statusCode: status, headers: corsHeaders, body: JSON.stringify(body) };
}
