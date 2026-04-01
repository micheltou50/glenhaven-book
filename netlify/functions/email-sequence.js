// ── /api/email-sequence ──────────────────────────────────────
// Runs daily (via pg_cron or Netlify scheduled function).
// Sends timed emails for upcoming and recent bookings:
//   - 7 days before check-in  → pre-arrival tips
//   - 1 day before check-in   → check-in details (keypad, WiFi, map)
//   - 1 day after checkout    → thank you + review request
//
// Uses emails_sent jsonb column on bookings to prevent duplicates.
// Trigger: GET /api/email-sequence?secret=CRON_SECRET
//   or POST with x-cron-secret header

const { preArrivalEmail, checkInEmail, postCheckoutEmail } = require('./email-templates');

const { SUPABASE_URL, SUPABASE_SERVICE_KEY, PROPERTY_ID,
        RESEND_API_KEY, RESEND_FROM } = process.env;
const SITE_URL = process.env.URL || 'https://glenhaven-book.netlify.app';

const sbHeaders = {
  'apikey': SUPABASE_SERVICE_KEY,
  'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

exports.handler = async (event) => {
  if (!RESEND_API_KEY) {
    return { statusCode: 500, body: 'RESEND_API_KEY not set' };
  }

  // ── Date helpers ───────────────────────────────────────────
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  function dateOffset(days) {
    const d = new Date(today);
    d.setDate(d.getDate() + days);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }

  const in7days   = dateOffset(7);   // check-in in 7 days → pre-arrival
  const tomorrow  = dateOffset(1);   // check-in tomorrow  → check-in details
  const yesterday = dateOffset(-1);  // checked out yesterday → post-checkout

  const results = { sent: [], skipped: [], errors: [] };

  console.log('[email-sequence] Looking for bookings with:', { in7days, tomorrow, yesterday });

  // ── Fetch property check-in info ───────────────────────────
  let checkInInfo = {};
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/properties?id=eq.${PROPERTY_ID}&select=check_in_info&limit=1`,
      { headers: sbHeaders }
    );
    const rows = await res.json();
    if (Array.isArray(rows) && rows[0]?.check_in_info) {
      checkInInfo = rows[0].check_in_info;
    }
  } catch (err) {
    console.error('Failed to load check_in_info:', err.message);
  }

  // ── Fetch bookings that need emails ────────────────────────
  // Get all confirmed direct bookings with check-in/checkout near today
  try {
    const url = `${SUPABASE_URL}/rest/v1/bookings?property_id=eq.${PROPERTY_ID}&status=eq.confirmed&platform=eq.Direct&select=id,checkin,checkout,guest_name,email,emails_sent&or=(checkin.eq.${in7days},checkin.eq.${tomorrow},checkout.eq.${yesterday})`;
    const res = await fetch(url, { headers: sbHeaders });
    const bookings = await res.json();

    console.log('[email-sequence] Found', Array.isArray(bookings) ? bookings.length : 0, 'matching bookings:', JSON.stringify(bookings));

    if (!Array.isArray(bookings)) {
      console.warn('No bookings array returned');
      return respond(200, results);
    }

    for (const bk of bookings) {
      const sent = Array.isArray(bk.emails_sent) ? bk.emails_sent : [];
      const firstName = (bk.guest_name || 'Guest').split(' ')[0];

      // ── Pre-arrival (7 days before) ────────────────────────
      if (bk.checkin === in7days && !sent.includes('pre-arrival')) {
        try {
          const html = preArrivalEmail({
            guestName: firstName,
            checkIn: bk.checkin,
            siteUrl: SITE_URL,
          });
          await sendEmail(bk.email, `Your Blue Mountains escape is one week away!`, html);
          await markSent(bk.id, sent, 'pre-arrival');
          results.sent.push({ id: bk.id, type: 'pre-arrival' });
        } catch (err) {
          results.errors.push({ id: bk.id, type: 'pre-arrival', error: err.message });
        }
      }

      // ── Check-in details (1 day before) ────────────────────
      if (bk.checkin === tomorrow && !sent.includes('check-in')) {
        try {
          const html = checkInEmail({
            guestName: firstName,
            checkIn: bk.checkin,
            checkOut: bk.checkout,
            checkInInfo,
            siteUrl: SITE_URL,
          });
          await sendEmail(bk.email, `Check-in tomorrow — here's everything you need`, html);
          await markSent(bk.id, sent, 'check-in');
          results.sent.push({ id: bk.id, type: 'check-in' });
        } catch (err) {
          results.errors.push({ id: bk.id, type: 'check-in', error: err.message });
        }
      }

      // ── Post-checkout (1 day after) ────────────────────────
      if (bk.checkout === yesterday && !sent.includes('post-checkout')) {
        try {
          const returnCode = generateReturnCode();
          const html = postCheckoutEmail({
            guestName: firstName,
            returnCode,
            siteUrl: SITE_URL,
          });
          await sendEmail(bk.email, `Thanks for staying at Glenhaven!`, html);
          await markSent(bk.id, sent, 'post-checkout');
          await storeReturnCode(bk.id, returnCode);
          results.sent.push({ id: bk.id, type: 'post-checkout', returnCode });
        } catch (err) {
          results.errors.push({ id: bk.id, type: 'post-checkout', error: err.message });
        }
      }
    }
  } catch (err) {
    console.error('Email sequence failed:', err.message);
    results.errors.push({ error: err.message });
  }

  console.log('Email sequence results:', JSON.stringify(results));
  return respond(200, results);
};

// ── Helpers ──────────────────────────────────────────────────

async function sendEmail(to, subject, html) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: RESEND_FROM || 'Glenhaven Bookings <noreply@resend.dev>',
      to,
      subject,
      html,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend ${res.status}: ${text}`);
  }
}

async function markSent(bookingId, existingSent, emailType) {
  const updated = [...existingSent, emailType];
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/bookings?id=eq.${bookingId}`,
    {
      method: 'PATCH',
      headers: { ...sbHeaders, 'Prefer': 'return=minimal' },
      body: JSON.stringify({ emails_sent: updated }),
    }
  );
  if (!res.ok) {
    console.warn(`Failed to mark ${emailType} sent for ${bookingId}`);
  }
}

function generateReturnCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'GH-R';
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

async function storeReturnCode(bookingId, returnCode) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/bookings?id=eq.${bookingId}`,
    {
      method: 'PATCH',
      headers: { ...sbHeaders, 'Prefer': 'return=minimal' },
      body: JSON.stringify({ return_code: returnCode }),
    }
  );
  if (!res.ok) {
    console.warn(`Failed to store return code for ${bookingId}`);
  }
}

function respond(status, body) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}
