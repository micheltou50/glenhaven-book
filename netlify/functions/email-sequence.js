// ── /api/email-sequence ──────────────────────────────────────
// Runs daily (via pg_cron or Netlify scheduled function).
// Sends timed emails for upcoming and recent bookings:
//   - 7 days before check-in  → pre-arrival tips
//   - 1 day before check-in   → check-in details (keypad, WiFi, map)
//   - 1 day after checkout    → thank you + review request
//   - host nudge: Airbnb reviews captured as pending in the last ~25h
//     (StayOps drops them into `reviews`; they are approved in /admin.html)
//
// Uses emails_sent jsonb column on bookings to prevent duplicates.
// Trigger: GET /api/email-sequence?secret=CRON_SECRET
//   or POST with x-cron-secret header

const { preArrivalEmail, checkInEmail, postCheckoutEmail } = require('./email-templates');
const { loadSiteConfig, getPropertyName, getEmailFrom, getRefPrefix } = require('./site-config-loader');
const crypto = require('crypto');

const { SUPABASE_URL, SUPABASE_SERVICE_KEY, PROPERTY_ID,
        RESEND_API_KEY, RESEND_FROM, CRON_SECRET, HOST_EMAIL } = process.env;
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

  // ── Auth ───────────────────────────────────────────────────
  // Netlify's scheduled invocation carries a { next_run } body and is allowed.
  // Any other (anonymous HTTP) caller must supply ?secret=CRON_SECRET or an
  // x-cron-secret header, so this send routine can't be triggered by just
  // anyone hitting the URL.
  let isScheduled = false;
  try { isScheduled = !!(event && event.body && JSON.parse(event.body).next_run); } catch (e) { /* not a scheduled body */ }
  if (!isScheduled) {
    const provided = (event.headers && (event.headers['x-cron-secret'] || event.headers['X-Cron-Secret']))
      || (event.queryStringParameters && event.queryStringParameters.secret) || '';
    if (!CRON_SECRET || provided !== CRON_SECRET) {
      return { statusCode: 401, body: 'Unauthorized' };
    }
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

  // ── Load site config for dynamic property info ─────────────
  const siteConfig = await loadSiteConfig();
  const propName = getPropertyName(siteConfig);
  const emailFrom = getEmailFrom(siteConfig);
  const contactEmail = (siteConfig && siteConfig.contact && siteConfig.contact.email) || 'info@stayops.com.au';
  const unsubMailto = 'mailto:' + contactEmail + '?subject=' + encodeURIComponent('Unsubscribe');

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

    // Log counts/ids only — never guest names/emails (PII) to the function logs.
    console.log('[email-sequence] Found', Array.isArray(bookings) ? bookings.length : 0, 'matching booking(s):', Array.isArray(bookings) ? bookings.map(b => b.id) : []);

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
            siteConfig,
          });
          await sendEmail(emailFrom, bk.email, `Your ${propName} escape is one week away!`, html);
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
            siteConfig,
          });
          await sendEmail(emailFrom, bk.email, `Check-in tomorrow — here's everything you need`, html);
          await markSent(bk.id, sent, 'check-in');
          results.sent.push({ id: bk.id, type: 'check-in' });
        } catch (err) {
          results.errors.push({ id: bk.id, type: 'check-in', error: err.message });
        }
      }

      // ── Post-checkout (1 day after) ────────────────────────
      if (bk.checkout === yesterday && !sent.includes('post-checkout')) {
        try {
          const returnCode = generateReturnCode(siteConfig);
          const html = postCheckoutEmail({
            guestName: firstName,
            returnCode,
            siteUrl: SITE_URL,
            siteConfig,
          });
          await sendEmail(emailFrom, bk.email, `Thanks for staying at ${propName}!`, html, { 'List-Unsubscribe': '<' + unsubMailto + '>' });
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

  // ── Host nudge: new Airbnb reviews awaiting approval ──────────
  // StayOps' hourly scan inserts newly published Airbnb reviews into
  // `reviews` as status='pending'. Once a day, tell the host about the ones
  // that arrived since the previous run so they get approved in the admin.
  // Goes to HOST_EMAIL only — never to guests.
  try {
    await nudgePendingReviews(results, { propName, emailFrom });
  } catch (err) {
    console.error('[email-sequence] review nudge failed:', err.message);
    results.errors.push({ type: 'review-nudge', error: err.message });
  }

  console.log('Email sequence results:', JSON.stringify(results));
  return respond(200, results);
};

// ── Helpers ──────────────────────────────────────────────────

async function sendEmail(from, to, subject, html, extraHeaders) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      html,
      ...(extraHeaders ? { headers: extraHeaders } : {}),
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

function generateReturnCode(cfg) {
  // Crypto-random, 16 chars from a 31-char alphabet (~10^24 space) so the review
  // link can't be brute-force enumerated to harvest guest PII. Math.random() is
  // NOT cryptographically secure, so use crypto.randomInt (unbiased).
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const prefix = getRefPrefix(cfg).replace(/-$/, '') + '-R';
  let code = prefix;
  for (let i = 0; i < 16; i++) {
    code += chars[crypto.randomInt(chars.length)];
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

async function nudgePendingReviews(results, { propName, emailFrom }) {
  if (!HOST_EMAIL) { results.skipped.push({ type: 'review-nudge', reason: 'HOST_EMAIL not set' }); return; }
  // 25h, not 24h, so a review that lands right at the cron boundary is never
  // missed; the admin badge covers the rare double mention.
  const since = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
  const url = `${SUPABASE_URL}/rest/v1/reviews?property_id=eq.${PROPERTY_ID}&status=eq.pending`
    + `&created_at=gte.${encodeURIComponent(since)}&select=id,guest_name,rating,review_text,stay_date,platform`
    + `&order=created_at.desc&limit=20`;
  const res = await fetch(url, { headers: sbHeaders });
  const rows = await res.json();
  if (!Array.isArray(rows) || !rows.length) { results.skipped.push({ type: 'review-nudge', reason: 'no new pending reviews' }); return; }

  const esc = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const n = rows.length;
  const items = rows.map(r => {
    const rating = Math.min(5, Math.max(1, parseInt(r.rating) || 5));
    const stars = '★'.repeat(rating) + '☆'.repeat(5 - rating);
    const text = String(r.review_text || '');
    const snippet = text.length > 180 ? text.slice(0, 180).trim() + '…' : text;
    const cut = /(…|\.\.\.)\s*$/.test(text.trim()) ? ' <span style="color:#92400e;font-size:12px;">(cut short in Airbnb\'s email — paste the full text via Edit)</span>' : '';
    return `<li style="margin:0 0 14px;"><strong>${esc(r.guest_name || 'Guest')}</strong> <span style="color:#1a6640;">${stars}</span>`
      + (r.stay_date ? ` <span style="color:#6b7280;font-size:12px;">· ${esc(r.stay_date)}</span>` : '')
      + `<br><span style="color:#374151;">“${esc(snippet)}”</span>${cut}</li>`;
  }).join('');
  const adminUrl = `${SITE_URL}/admin.html`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111;line-height:1.5;">
    <h2 style="margin:0 0 8px;font-size:20px;">${n === 1 ? 'A new Airbnb review is' : n + ' new Airbnb reviews are'} waiting for your approval</h2>
    <p style="margin:0 0 18px;color:#374151;">Captured from your Airbnb emails for <strong>${esc(propName)}</strong>. Nothing is published until you approve it in the website admin.</p>
    <ul style="padding-left:18px;margin:0 0 22px;">${items}</ul>
    <p style="margin:0 0 24px;"><a href="${adminUrl}" style="display:inline-block;background:#1a6640;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold;">Review &amp; approve</a></p>
    <p style="margin:0;color:#6b7280;font-size:12px;">Open the <strong>Reviews</strong> tab, then Approve, Edit or Reject each one.</p>
  </div>`;

  await sendEmail(emailFrom, HOST_EMAIL, `${n === 1 ? '1 Airbnb review' : n + ' Airbnb reviews'} awaiting approval — ${propName}`, html);
  results.sent.push({ type: 'review-nudge', count: n, ids: rows.map(r => r.id) });
}

function respond(status, body) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}
