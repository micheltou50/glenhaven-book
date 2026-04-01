// ── /api/availability ─────────────────────────────────────────
// Reads booked date ranges from Supabase + optional Airbnb iCal.
// Returns { success, ranges: [{start, end}] }

const { SUPABASE_URL, SUPABASE_SERVICE_KEY, PROPERTY_ID, AIRBNB_ICAL_URL } = process.env;

const sbHeaders = {
  'apikey': SUPABASE_SERVICE_KEY,
  'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
};

exports.handler = async () => {
  const ranges = [];

  // ── 1. Supabase bookings ───────────────────────────────────
  try {
    const url = `${SUPABASE_URL}/rest/v1/bookings?property_id=eq.${PROPERTY_ID}&status=neq.cancelled&select=checkin,checkout`;
    const res = await fetch(url, { headers: sbHeaders });
    const rows = await res.json();
    if (Array.isArray(rows)) {
      rows.forEach(r => {
        if (r.checkin && r.checkout) ranges.push({ start: r.checkin, end: r.checkout });
      });
    }
  } catch (err) {
    console.error('Supabase availability error:', err.message);
  }

  // ── 2. Airbnb iCal ─────────────────────────────────────────
  if (AIRBNB_ICAL_URL) {
    try {
      const res     = await fetch(AIRBNB_ICAL_URL);
      const icsText = await res.text();
      parseIcal(icsText).forEach(r => ranges.push(r));
    } catch (err) {
      console.error('iCal error:', err.message);
    }
  }

  // ── 3. Price overrides ───────────────────────────────────────
  let priceOverrides = {};
  try {
    const url = `${SUPABASE_URL}/rest/v1/price_overrides?property_id=eq.${PROPERTY_ID}&select=date,price`;
    const res = await fetch(url, { headers: sbHeaders });
    const rows = await res.json();
    if (Array.isArray(rows)) {
      rows.forEach(r => { priceOverrides[r.date] = parseFloat(r.price); });
    }
  } catch (err) {
    console.error('Price overrides error:', err.message);
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ success: true, ranges, priceOverrides }),
  };
};

function parseIcal(icsText) {
  const ranges = [];
  const events = icsText.split('BEGIN:VEVENT');
  for (let i = 1; i < events.length; i++) {
    const s = events[i].match(/DTSTART(?:[^:]*):(\d{8})/);
    const e = events[i].match(/DTEND(?:[^:]*):(\d{8})/);
    if (s && e) {
      const start = s[1].replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3');
      const end   = e[1].replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3');
      if (start < end) ranges.push({ start, end });
    }
  }
  return ranges;
}
