// ── POST /api/reservations ───────────────────────────────────
// Write operations on reservations. Auth required (_auth.js).
//
// Body: { action, ... }
//   action='cancel'  { bookingId }
//        → sets status='cancelled' (frees the dates; matches the rest of the app)
//   action='modify'  { bookingId, checkin?, checkout?, guests?, guestName?, email?, phone?, notes? }
//        → updates only the supplied fields; date changes are clash-checked
//   action='block'   { checkin, checkout, note?, idempotencyKey? }
//        → creates an owner/maintenance block that reserves those nights
//
// Every operation is scoped to THIS property. Date changes and blocks are
// checked against all other non-cancelled bookings so we never double-book.
//
// NOTE (known limitation): the clash check is read-then-write, so two block/modify
// requests fired in the SAME instant could both pass and overlap. For a single
// operator this is not a practical risk; a DB exclusion constraint on the shared
// table is deliberately avoided here to not disturb StayOps' own writers.

const crypto = require('crypto');
const { checkAuth } = require('./_auth');

const { SUPABASE_URL, SUPABASE_SERVICE_KEY, PROPERTY_ID, HOST_USER_ID } = process.env;

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-admin-password, x-api-key, Authorization',
};

const sbHeaders = {
  'apikey': SUPABASE_SERVICE_KEY,
  'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function reply(statusCode, obj) {
  return { statusCode, headers: corsHeaders, body: JSON.stringify(obj) };
}

function validDate(s) {
  if (typeof s !== 'string' || !ISO_DATE.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === s;   // rejects e.g. 2026-02-31
}

function nightsBetween(ci, co) {
  return Math.round((new Date(co + 'T00:00:00Z') - new Date(ci + 'T00:00:00Z')) / 86400000);
}

// All non-cancelled bookings for this property, optionally excluding one id.
async function activeBookings(excludeId) {
  const url = `${SUPABASE_URL}/rest/v1/bookings?property_id=eq.${PROPERTY_ID}`
            + `&status=neq.cancelled&select=id,checkin,checkout`;
  const res = await fetch(url, { headers: sbHeaders });
  const rows = await res.json();
  if (!Array.isArray(rows)) throw new Error('Could not read existing bookings');
  return excludeId ? rows.filter(r => r.id !== excludeId) : rows;
}

// half-open overlap: [ci, co) intersects [r.checkin, r.checkout)
function hasClash(ci, co, rows) {
  return rows.some(r => ci < r.checkout && co > r.checkin);
}

async function getBooking(id) {
  const url = `${SUPABASE_URL}/rest/v1/bookings?id=eq.${encodeURIComponent(id)}`
            + `&property_id=eq.${PROPERTY_ID}&select=*&limit=1`;
  const res = await fetch(url, { headers: sbHeaders });
  const rows = await res.json();
  return Array.isArray(rows) ? rows[0] : null;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return reply(200, {});
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Method Not Allowed' });

  const auth = checkAuth(event);
  if (auth) return reply(auth.statusCode, { error: auth.error });

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return reply(400, { error: 'Invalid JSON' }); }

  const action = body.action;

  // ── CANCEL ──────────────────────────────────────────────────
  if (action === 'cancel') {
    if (!body.bookingId) return reply(400, { error: 'bookingId required' });
    try {
      const url = `${SUPABASE_URL}/rest/v1/bookings?id=eq.${encodeURIComponent(body.bookingId)}`
                + `&property_id=eq.${PROPERTY_ID}`;
      const res = await fetch(url, {
        method: 'PATCH',
        headers: { ...sbHeaders, 'Prefer': 'return=representation' },
        body: JSON.stringify({ status: 'cancelled', cancelled_at: new Date().toISOString() }),
      });
      if (!res.ok) return reply(502, { error: 'Cancel failed: ' + (await res.text()) });
      const rows = await res.json();
      if (!Array.isArray(rows) || rows.length === 0) {
        return reply(404, { error: 'Booking not found for this property' });
      }
      return reply(200, { success: true, action: 'cancel', bookingId: rows[0].id, status: 'cancelled' });
    } catch (err) {
      return reply(502, { error: 'Cancel failed: ' + err.message });
    }
  }

  // ── MODIFY ──────────────────────────────────────────────────
  if (action === 'modify') {
    if (!body.bookingId) return reply(400, { error: 'bookingId required' });

    let existing;
    try { existing = await getBooking(body.bookingId); }
    catch (err) { return reply(502, { error: 'Lookup failed: ' + err.message }); }
    if (!existing) return reply(404, { error: 'Booking not found for this property' });

    const patch = {};

    // Dates (validate + clash-check if either changes)
    const newCheckin  = body.checkin  !== undefined ? body.checkin  : existing.checkin;
    const newCheckout = body.checkout !== undefined ? body.checkout : existing.checkout;
    const datesChanged = body.checkin !== undefined || body.checkout !== undefined;
    if (datesChanged) {
      if (!validDate(newCheckin) || !validDate(newCheckout)) {
        return reply(400, { error: 'checkin/checkout must be valid YYYY-MM-DD dates' });
      }
      if (!(newCheckin < newCheckout)) {
        return reply(400, { error: 'checkout must be after checkin' });
      }
      let others;
      try { others = await activeBookings(existing.id); }
      catch (err) { return reply(502, { error: err.message }); }
      if (hasClash(newCheckin, newCheckout, others)) {
        return reply(409, { error: 'Those dates clash with an existing booking' });
      }
      patch.checkin = newCheckin;
      patch.checkout = newCheckout;
      patch.nights = nightsBetween(newCheckin, newCheckout);
    }

    // Optional guest fields (only patch what was supplied)
    if (body.guests !== undefined) {
      const g = parseInt(body.guests, 10);
      if (!Number.isInteger(g) || g < 1) return reply(400, { error: 'guests must be a positive integer' });
      patch.guests = g;
    }
    if (body.guestName !== undefined) patch.guest_name = String(body.guestName).slice(0, 200);
    if (body.email !== undefined)     patch.email = body.email == null ? null : String(body.email).slice(0, 200);
    if (body.phone !== undefined)     patch.phone = body.phone == null ? null : String(body.phone).slice(0, 50);
    if (body.notes !== undefined)     patch.notes = body.notes == null ? null : String(body.notes).slice(0, 2000);

    if (Object.keys(patch).length === 0) {
      return reply(400, { error: 'No changes supplied' });
    }
    patch.updated_at = new Date().toISOString();

    try {
      const url = `${SUPABASE_URL}/rest/v1/bookings?id=eq.${encodeURIComponent(existing.id)}`
                + `&property_id=eq.${PROPERTY_ID}`;
      const res = await fetch(url, {
        method: 'PATCH',
        headers: { ...sbHeaders, 'Prefer': 'return=representation' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) return reply(502, { error: 'Modify failed: ' + (await res.text()) });
      const rows = await res.json();
      return reply(200, { success: true, action: 'modify', booking: Array.isArray(rows) ? rows[0] : null });
    } catch (err) {
      return reply(502, { error: 'Modify failed: ' + err.message });
    }
  }

  // ── BLOCK ───────────────────────────────────────────────────
  if (action === 'block') {
    if (!HOST_USER_ID) return reply(500, { error: 'HOST_USER_ID not configured' });

    const { checkin, checkout } = body;
    if (!validDate(checkin) || !validDate(checkout)) {
      return reply(400, { error: 'checkin/checkout must be valid YYYY-MM-DD dates' });
    }
    if (!(checkin < checkout)) return reply(400, { error: 'checkout must be after checkin' });

    let others;
    try { others = await activeBookings(null); }
    catch (err) { return reply(502, { error: err.message }); }
    if (hasClash(checkin, checkout, others)) {
      return reply(409, { error: 'Those dates clash with an existing booking' });
    }

    // Idempotency: an optional client key is folded into local_id, which is
    // protected by UNIQUE (local_id, user_id) — so a retry can NEVER create a
    // second block (the duplicate INSERT returns 409). Without a key we use a
    // collision-proof UUID.
    const localId = body.idempotencyKey
      ? 'block-' + String(body.idempotencyKey).replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 60)
      : 'block-' + crypto.randomUUID();

    const row = {
      user_id: HOST_USER_ID,
      property_id: PROPERTY_ID,
      checkin,
      checkout,
      nights: nightsBetween(checkin, checkout),
      guest_name: (body.note ? String(body.note).slice(0, 200) : 'Owner block'),
      guests: 0,
      host_payout: 0,               // $0 — keeps blocks out of any revenue rollup
      platform: 'Blocked',          // StayOps rollups should filter platform='Blocked'
      source: 'manual-block',
      status: 'confirmed',          // active, so the nights are blocked in availability
      confirmation_code: localId,   // non-null; never matches ^cs_, so /api/refund ignores it
      local_id: localId,
      notes: body.note ? String(body.note).slice(0, 2000) : null,
    };

    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/bookings`, {
        method: 'POST',
        headers: { ...sbHeaders, 'Prefer': 'return=representation' },
        body: JSON.stringify(row),
      });
      if (res.status === 409) {
        return reply(409, { error: 'A block with this idempotencyKey already exists.' });
      }
      if (!res.ok) return reply(502, { error: 'Block failed: ' + (await res.text()) });
      const rows = await res.json();
      return reply(201, { success: true, action: 'block', booking: Array.isArray(rows) ? rows[0] : null });
    } catch (err) {
      return reply(502, { error: 'Block failed: ' + err.message });
    }
  }

  return reply(400, { error: `Unknown action "${action}" (expected: cancel | modify | block)` });
};
