// ── /api/welcome-details ─────────────────────────────────────
// POST { name, checkIn } → { wifi_network, wifi_password, address }
//
// The public Welcome-book.html no longer contains the Wi-Fi details or the
// street address. A guest unlocks them with the name on their booking and their
// check-in date. The details come from properties.check_in_info (the same
// record the day-before check-in email uses), so there is one place to edit
// them. Only these three fields are ever returned; the door access code stays
// email-only.
//
// A booking unlocks the details from 14 days before check-in until the day
// after check-out (Sydney time). Cancelled bookings never unlock.

const { SUPABASE_URL, SUPABASE_SERVICE_KEY, PROPERTY_ID } = process.env;

const sbHeaders = {
  'apikey': SUPABASE_SERVICE_KEY,
  'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
};

const headers = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex',
};

const DAYS_BEFORE_CHECKIN = 14;
const DAYS_AFTER_CHECKOUT = 1;
const FAIL_DELAY_MS = 800;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return resp(405, { error: 'method_not_allowed' });

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return resp(400, { error: 'bad_request' }); }

  const nameTokens = tokens(body.name);
  const checkIn = String(body.checkIn || '').trim();
  if (!nameTokens.length || !/^\d{4}-\d{2}-\d{2}$/.test(checkIn)) {
    return resp(400, { error: 'bad_request' });
  }

  try {
    const url = `${SUPABASE_URL}/rest/v1/bookings?property_id=eq.${PROPERTY_ID}`
      + `&checkin=eq.${checkIn}&status=neq.cancelled&select=guest_name,checkin,checkout`;
    const res = await fetch(url, { headers: sbHeaders });
    const rows = await res.json();
    const today = sydneyToday();

    const match = (Array.isArray(rows) ? rows : []).find(b =>
      nameMatches(b.guest_name, nameTokens)
      && today >= addDays(b.checkin, -DAYS_BEFORE_CHECKIN)
      && today <= addDays(b.checkout || b.checkin, DAYS_AFTER_CHECKOUT));

    if (!match) return fail();

    const pres = await fetch(
      `${SUPABASE_URL}/rest/v1/properties?id=eq.${PROPERTY_ID}&select=check_in_info&limit=1`,
      { headers: sbHeaders });
    const props = await pres.json();
    const info = (Array.isArray(props) && props[0] && props[0].check_in_info) || {};

    return resp(200, {
      wifi_network: info.wifi_network || '',
      wifi_password: info.wifi_password || '',
      address: info.address || '',
    });
  } catch (err) {
    console.error('[welcome-details]', err.message);
    return resp(500, { error: 'unavailable' });
  }
};

// Letters-only, lower-case name words, accents removed.
function tokens(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().split(/[^a-z]+/).filter(Boolean);
}

// The guest must give the surname on the booking. If the booking holds only a
// first name (or a surname initial), the first name is accepted instead.
function nameMatches(guestName, given) {
  const parts = tokens(guestName);
  if (!parts.length || /^reserved/i.test(String(guestName || '').trim())) return false;
  const last = parts[parts.length - 1];
  const key = parts.length > 1 && last.length > 1 ? last : parts[0];
  return given.includes(key);
}

function sydneyToday() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' });
}

function addDays(iso, n) {
  const d = new Date(String(iso).slice(0, 10) + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function fail() {
  await new Promise(r => setTimeout(r, FAIL_DELAY_MS));
  return resp(404, { error: 'not_found' });
}

function resp(status, body) {
  return { statusCode: status, headers, body: JSON.stringify(body) };
}
