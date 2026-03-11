// ── /calendar.ics ─────────────────────────────────────────────
// Generates an iCal feed of DIRECT bookings only.
// Import this URL into Airbnb to block direct-booking dates.
//
// Privacy: exports dates only — no guest names, emails, or phones.
// DTEND = checkout date (iCal exclusive end) — correct for accommodation.

exports.handler = async () => {
  try {
    const url  = process.env.APPS_SCRIPT_URL + '?action=directCalendar';
    const res  = await fetch(url);
    const data = await res.json();

    const ranges = (data.success && Array.isArray(data.ranges)) ? data.ranges : [];

    const events = ranges.map((r, i) => {
      // Strip dashes: 2026-04-02 → 20260402
      const dtStart = r.start.replace(/-/g, '');
      const dtEnd   = r.end.replace(/-/g, '');
      // DTEND is checkout date exactly — iCal all-day end is exclusive,
      // so this correctly blocks up to (but not including) the checkout day.
      const uid = `${r.start}-${r.end}-${i}@glenhaven-book.netlify.app`;
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
        'Content-Type'        : 'text/calendar; charset=utf-8',
        'Content-Disposition' : 'inline; filename="glenhaven.ics"',
        'Cache-Control'       : 'no-cache, no-store',
      },
      body: ical,
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: 'Error generating calendar: ' + err.message,
    };
  }
};
