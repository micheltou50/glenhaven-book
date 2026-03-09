// ── /api/availability ────────────────────────────────────────
// Proxies to Apps Script to get booked date ranges from Google Sheet.
// Server-side: no CORS, no redirect issues.

exports.handler = async () => {
  try {
    const url = process.env.APPS_SCRIPT_URL + '?action=availability';
    const res  = await fetch(url);
    const data = await res.json();
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    };
  } catch (err) {
    // Fail open — return empty ranges so calendar still works
    console.error('availability error:', err.message);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, ranges: [] }),
    };
  }
};
