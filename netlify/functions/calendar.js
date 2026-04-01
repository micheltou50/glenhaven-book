// ── /calendar.ics ─────────────────────────────────────────────
// Generates an iCal feed of DIRECT bookings from Supabase.
// Import into Airbnb to block direct-booking dates.
// Exports dates only — no guest names/emails/phones.

const { SUPABASE_URL, SUPABASE_SERVICE_KEY, PROPERTY_ID } = process.env;

exports.handler = async () => {
  try {
    const url = `${SUPABASE_URL}/rest/v1/bookings?property_id=eq.${PROPERTY_ID}&platform=eq.Direct&status=neq.cancelled&select=checkin,checkout`;
    const res = await fetch(url, {
      headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}` },
    });
    const rows = await res.json();
    const ranges = Array.isArray(rows) ? rows : [];

    const events = ranges.map((r, i) => {
      const dtStart = r.checkin.replace(/-/g, '');
      const dtEnd   = r.checkout.replace(/-/g, '');
      const uid     = `${r.checkin}-${r.checkout}-${i}@glenhaven-book.netlify.app`;
      return [
        'BEGIN:VEVENT',
        `DTSTART;VALUE=DATE:${dtStart}`,
        `DTEND;VALUE=DATE:${dtEnd}`,
        'SUMMARY:Glenhaven Direct Booking',
        `UID:${uid}`,
        'END:VEVENT',
      ].join('\r\n');
    }).join('\r\n');

    const ical = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Glenhaven//Direct Bookings//EN',
      'X-WR-CALNAME:Glenhaven Direct Bookings',
      'X-WR-TIMEZONE:Australia/Sydney',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      events,
      'END:VCALENDAR',
    ].join('\r\n');

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'inline; filename="glenhaven.ics"',
        'Cache-Control': 'no-cache, no-store',
      },
      body: ical,
    };
  } catch (err) {
    return { statusCode: 500, body: 'Error generating calendar: ' + err.message };
  }
};
