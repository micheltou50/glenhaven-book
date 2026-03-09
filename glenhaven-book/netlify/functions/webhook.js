// ── /api/webhook ─────────────────────────────────────────────
// Receives Stripe webhook (checkout.session.completed).
// Calls Apps Script to write the confirmed row to Google Sheet
// and send confirmation emails to host + guest.
//
// Register this URL in Stripe Dashboard:
//   https://glenhaven-book.netlify.app/api/webhook
// Event: checkout.session.completed

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let stripeEvent;
  try {
    stripeEvent = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  // Only process completed checkouts
  if (stripeEvent.type !== 'checkout.session.completed') {
    return { statusCode: 200, body: JSON.stringify({ received: true }) };
  }

  const session = stripeEvent.data.object;
  const meta    = session.metadata || {};

  const confirmPayload = {
    action          : 'confirm',
    checkIn         : meta.checkIn,
    checkOut        : meta.checkOut,
    nights          : parseInt(meta.nights)   || 0,
    guestName       : meta.guestName          || '',
    email           : meta.email              || (session.customer_details && session.customer_details.email) || '',
    phone           : meta.phone              || '',
    guests          : parseInt(meta.guests)   || 1,
    total           : parseFloat(meta.total)  || 0,
    amountPaid      : (session.amount_total   || 0) / 100,
    stripeSessionId : session.id,
    message         : meta.message            || '',
  };

  try {
    const url = process.env.APPS_SCRIPT_URL + '?payload=' + encodeURIComponent(JSON.stringify(confirmPayload));
    await fetch(url);
  } catch (err) {
    // Log but return 200 — Stripe will retry if we return an error
    console.error('Apps Script confirm failed:', err.message);
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ received: true }),
  };
};
