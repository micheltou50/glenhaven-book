// ── /api/guest-offers ────────────────────────────────────────
// Returning-guest 5%-off signups (hidden /guest-offer page).
//   POST  (public) → store a signup as 'pending' + notify the owner by email
//   GET   (admin)  → list all signups
//   PATCH (admin)  → approve (generate + email a unique promo code) or reject
//
// Admin calls carry an x-admin-password header (same scheme as /api/reviews).

const { loadSiteConfig, getEmailFrom, getRefPrefix, getPropertyName } = require('./site-config-loader');
const crypto = require('crypto');

const { SUPABASE_URL, SUPABASE_SERVICE_KEY, PROPERTY_ID, ADMIN_PASSWORD,
        RESEND_API_KEY, HOST_EMAIL } = process.env;
const SITE_URL = process.env.URL || 'https://glenhaven.stayops.com.au';

const sbHeaders = {
  'apikey': SUPABASE_SERVICE_KEY,
  'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-admin-password',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders, body: '' };

  // ── POST — public signup ───────────────────────────────────
  if (event.httpMethod === 'POST') {
    let body;
    try { body = JSON.parse(event.body); }
    catch { return respond(400, { success: false, error: 'Invalid request.' }); }

    // Honeypot: real guests never fill this; bots that do get a silent OK.
    if ((body.company || '').trim()) return respond(200, { success: true });

    const name        = (body.name || '').trim();
    const email       = (body.email || '').trim();
    const phone       = (body.phone || '').trim();
    const checkinDate = (body.checkinDate || '').trim() || null;
    const newsletter  = !!body.newsletter;

    if (!name || !email || !phone) {
      return respond(200, { success: false, error: 'Please fill in your name, email, and phone number.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return respond(200, { success: false, error: 'Please enter a valid email address.' });
    }

    const row = {
      property_id: PROPERTY_ID,
      guest_name: name,
      email,
      phone,
      checkin_date: checkinDate,
      newsletter_opt_in: newsletter,
      status: 'pending',
    };

    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/guest_offers`, {
        method: 'POST',
        headers: { ...sbHeaders, 'Prefer': 'return=representation' },
        body: JSON.stringify(row),
      });
      if (!res.ok) {
        console.error('[guest-offers] insert failed:', res.status, await res.text());
        return respond(200, { success: false, error: 'Could not save your details. Please try again.' });
      }
      const created = await res.json();
      const offer = Array.isArray(created) ? created[0] : created;

      // Notify the owner — best effort; never fail the signup over a mail hiccup.
      await notifyOwner(offer).catch(e => console.error('[guest-offers] owner email failed:', e.message));

      return respond(200, { success: true });
    } catch (err) {
      console.error('[guest-offers] POST', err.message);
      return respond(200, { success: false, error: 'Could not save your details. Please try again.' });
    }
  }

  // ── GET — admin list ───────────────────────────────────────
  if (event.httpMethod === 'GET') {
    if (!isAdmin(event)) return respond(401, { error: 'Unauthorized' });
    try {
      const url = `${SUPABASE_URL}/rest/v1/guest_offers?property_id=eq.${PROPERTY_ID}&order=created_at.desc`
        + `&select=id,guest_name,email,phone,checkin_date,newsletter_opt_in,status,promo_code,discount_pct,expires_at,created_at,approved_at,redeemed_at`;
      const res = await fetch(url, { headers: sbHeaders });
      const rows = await res.json();
      return respond(200, { success: true, offers: Array.isArray(rows) ? rows : [] });
    } catch (err) {
      console.error('[guest-offers] GET', err.message);
      return respond(500, { error: 'Could not load signups.' });
    }
  }

  // ── PATCH — admin approve / reject ─────────────────────────
  if (event.httpMethod === 'PATCH') {
    if (!isAdmin(event)) return respond(401, { error: 'Unauthorized' });

    let body;
    try { body = JSON.parse(event.body); }
    catch { return respond(400, { error: 'Invalid JSON' }); }

    const { id, action } = body;
    if (!id || !['approve', 'reject'].includes(action)) {
      return respond(400, { error: 'id and action (approve/reject) required' });
    }

    // Load the target signup (scoped to this property).
    let offer;
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/guest_offers?id=eq.${encodeURIComponent(id)}&property_id=eq.${PROPERTY_ID}&limit=1`,
        { headers: sbHeaders }
      );
      const rows = await res.json();
      offer = Array.isArray(rows) ? rows[0] : null;
    } catch (err) {
      return respond(500, { error: 'Could not load the signup.' });
    }
    if (!offer) return respond(404, { error: 'Signup not found' });

    if (action === 'reject') {
      const pr = await patchOffer(id, { status: 'rejected' });
      if (!pr.ok) return respond(500, { error: 'Could not reject. Please try again.' });
      return respond(200, { success: true, status: 'rejected' });
    }

    // ── approve ──
    // Already has a code → just (re)send it, don't mint a new one.
    const cfg = await loadSiteConfig();
    let code = offer.promo_code;
    let expires = offer.expires_at;

    if (!code) {
      code = generatePromoCode(cfg);
      expires = isoDatePlusMonths(12);
      const pr = await patchOffer(id, {
        status: 'approved',
        promo_code: code,
        discount_pct: 5,
        expires_at: expires,
        approved_at: new Date().toISOString(),
      });
      if (!pr.ok) {
        console.error('[guest-offers] approve patch failed', pr.status, await pr.text());
        return respond(500, { error: 'Could not save the approval. Please try again.' });
      }
    } else if (offer.status !== 'approved') {
      await patchOffer(id, { status: 'approved' });
    }

    // Email the guest their code.
    try {
      await emailGuestCode({ ...offer, promo_code: code, expires_at: expires }, cfg);
    } catch (err) {
      console.error('[guest-offers] guest email failed:', err.message);
      return respond(200, { success: true, status: 'approved', promo_code: code, emailed: false,
        warning: 'Approved and code saved, but the email failed to send — you can retry Approve to resend.' });
    }

    return respond(200, { success: true, status: 'approved', promo_code: code, emailed: true });
  }

  return respond(405, { error: 'Method not allowed' });
};

// ── Helpers ──────────────────────────────────────────────────

function isAdmin(event) {
  const pwd = (event.headers && (event.headers['x-admin-password'] || event.headers['X-Admin-Password'])) || '';
  return !!ADMIN_PASSWORD && pwd === ADMIN_PASSWORD;
}

function patchOffer(id, fields) {
  return fetch(`${SUPABASE_URL}/rest/v1/guest_offers?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { ...sbHeaders, 'Prefer': 'return=minimal' },
    body: JSON.stringify(fields),
  });
}

function generatePromoCode(cfg) {
  // Crypto-random, unambiguous alphabet (no 0/O/1/I). 8 chars ≈ 10^12 space.
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const prefix = getRefPrefix(cfg).replace(/-$/, '');
  let suffix = '';
  for (let i = 0; i < 8; i++) suffix += chars[crypto.randomInt(chars.length)];
  return `${prefix}-SAVE-${suffix}`;
}

function isoDatePlusMonths(months) {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function sendEmail(from, to, subject, html, replyTo) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, html, ...(replyTo ? { reply_to: replyTo } : {}) }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}

async function notifyOwner(offer) {
  if (!RESEND_API_KEY || !HOST_EMAIL) { console.warn('[guest-offers] owner notify skipped — email not configured'); return; }
  const cfg = await loadSiteConfig();
  const from = getEmailFrom(cfg);
  const adminUrl = `${SITE_URL}/admin.html`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222;">
    <h2 style="color:#14532d;">New returning-guest discount signup</h2>
    <p>A guest requested their 5% returning-guest code. Review and approve in the admin panel to send it.</p>
    <table cellpadding="6" style="border-collapse:collapse;">
      <tr><td><strong>Name</strong></td><td>${esc(offer.guest_name)}</td></tr>
      <tr><td><strong>Email</strong></td><td>${esc(offer.email)}</td></tr>
      <tr><td><strong>Phone</strong></td><td>${esc(offer.phone || '—')}</td></tr>
      <tr><td><strong>Check-in date given</strong></td><td>${esc(offer.checkin_date || '—')}</td></tr>
      <tr><td><strong>Newsletter opt-in</strong></td><td>${offer.newsletter_opt_in ? 'Yes' : 'No'}</td></tr>
    </table>
    <p style="margin-top:16px;"><a href="${adminUrl}" style="background:#16a34a;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;display:inline-block;">Open admin → Guest offers</a></p>
    <p style="color:#888;font-size:12px;">Approve to generate a unique code and email it to the guest. Reject to discard.</p>
  </div>`;
  await sendEmail(from, HOST_EMAIL, `New guest discount signup — ${offer.guest_name}`, html, offer.email);
}

async function emailGuestCode(offer, cfg) {
  if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY not set');
  const from = getEmailFrom(cfg);
  const propName = getPropertyName(cfg);
  const bookUrl = `${SITE_URL}/booking.html`;
  const expiryNice = offer.expires_at
    ? new Date(offer.expires_at + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
    : '';
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#222;">
    <h2 style="color:#14532d;">Thanks for staying at ${esc(propName)}! 🌿</h2>
    <p>Here's your <strong>5% off</strong> code for your next direct booking with us:</p>
    <div style="background:#f0fdf4;border:1px dashed #16a34a;border-radius:10px;padding:18px;text-align:center;margin:18px 0;">
      <div style="font-size:24px;font-weight:800;letter-spacing:2px;color:#14532d;">${esc(offer.promo_code)}</div>
    </div>
    <p>To use it, book directly at <a href="${bookUrl}">${esc(propName)}</a> and enter this code at checkout — 5% comes off your total automatically.</p>
    ${expiryNice ? `<p style="color:#555;">Valid until <strong>${expiryNice}</strong>. One use per code.</p>` : ''}
    <p style="color:#888;font-size:12px;margin-top:24px;">Booking direct means no platform fees — the best rate you'll find. See you again soon!</p>
  </div>`;
  await sendEmail(from, offer.email, `Your 5% off code for ${propName}`, html);
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function respond(status, body) {
  return { statusCode: status, headers: corsHeaders, body: JSON.stringify(body) };
}
