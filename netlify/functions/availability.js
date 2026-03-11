// ── /api/availability ─────────────────────────────────────────
// Fetches blocked date ranges from TWO sources:
//   1. Google Sheet (via Apps Script) — direct bookings
//   2. Airbnb iCal URL (if AIRBNB_ICAL_URL env var is set) — Airbnb bookings
// Returns merged { success, ranges: [{start, end}] }

exports.handler = async () => {
  const ranges = [];

  // ── 1. Google Sheet bookings ──────────────────────────────
  try {
    const url  = process.env.APPS_SCRIPT_URL + '?action=availability';
    const res  = await fetch(url);
    const data = await res.json();
    if (data.success && Array.isArray(data.ranges)) {
      data.ranges.forEach(r => ranges.push({ start: r.start, end: r.end }));
    }
  } catch (err) {
    console.error('Google Sheet availability error:', err.message);
    // Continue — still try iCal
  }

  // ── 2. Airbnb iCal ───────────────────────────────────────
  const icalUrl = process.env.AIRBNB_ICAL_URL;
  if (icalUrl) {
    try {
      const res     = await fetch(icalUrl);
      const icsText = await res.text();
      const icalRanges = parseIcal(icsText);
      icalRanges.forEach(r => ranges.push(r));
      console.log('iCal parsed:', icalRanges.length, 'blocked ranges from Airbnb');
    } catch (err) {
      console.error('iCal fetch/parse error:', err.message);
      // Non-fatal — sheet data still returned
    }
  } else {
    console.log('AIRBNB_ICAL_URL not set — skipping iCal');
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ success: true, ranges }),
  };
};

// ── iCal parser ───────────────────────────────────────────────
// Handles both date-only (DTSTART;VALUE=DATE:20260101)
// and datetime (DTSTART:20260101T150000Z) formats from Airbnb
function parseIcal(icsText) {
  const ranges = [];
  const events = icsText.split('BEGIN:VEVENT');

  for (let i = 1; i < events.length; i++) {
    const block = events[i];

    // Match DTSTART with optional params (e.g. ;VALUE=DATE or ;TZID=...)
    const startMatch = block.match(/DTSTART(?:[^:]*):(\d{8})/);
    const endMatch   = block.match(/DTEND(?:[^:]*):(\d{8})/);

    if (startMatch && endMatch) {
      const start = formatIcalDate(startMatch[1]);
      const end   = formatIcalDate(endMatch[1]);
      if (start && end && start < end) {
        ranges.push({ start, end });
      }
    }
  }

  return ranges;
}

// Convert '20260101' → '2026-01-01'
function formatIcalDate(raw) {
  if (!raw || raw.length < 8) return null;
  return raw.slice(0, 4) + '-' + raw.slice(4, 6) + '-' + raw.slice(6, 8);
}
