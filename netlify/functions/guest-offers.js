// ── /api/guest-offers ────────────────────────────────────────
// Returning-guest 5%-off signups (hidden /guest-offer page).
//   POST  (public) → store a signup and auto-verify against real bookings.
//                    Match    → approve, email the code, FYI the owner.
//                    No match → pending, email "we're confirming your stay",
//                               and ask the owner to review in admin.
//   GET   (admin)  → list all signups
//   PATCH (admin)  → approve (generate + email a unique code) or reject
//
// Admin calls carry an x-admin-password header (same scheme as /api/reviews).

const { loadSiteConfig, getEmailFrom, getRefPrefix, getPropertyName } = require('./site-config-loader');
const { guestOfferCodeEmail, guestOfferPendingEmail, guestOfferHostEmail } = require('./email-templates');
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

  // ── POST — public signup (with auto-verification) ──────────
  if (event.httpMethod === 'POST') {
    let body;
    try { body = JSON.parse(event.body); }
    catch { return respond(400, { success: false, error: 'Invalid request.' }); }

    // Honeypot: real guests never fill this; bots that do get a silent OK.
    if ((body.company || '').trim()) return respond(200, { success: true, verified: false });

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

    // Auto-verify: does this match a real, non-cancelled stay?
    const verified = await verifyAgainstBookings({ name, email, checkinDate });

    const cfg = await loadSiteConfig();
    let code = null, expires = null, status = 'pending';
    if (verified) {
      code = generatePromoCode(cfg);
      expires = isoDatePlusMonths(12);
      status = 'approved';
    }

    const row = {
      property_id: PROPERTY_ID,
      guest_name: name,
      email,
      phone,
      checkin_date: checkinDate,
      newsletter_opt_in: newsletter,
      status,
      promo_code: code,
      discount_pct: 5,
      expires_at: expires,
      approved_at: verified ? new Date().toISOString() : null,
    };

    let offer;
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
      offer = Array.isArray(created) ? created[0] : created;
    } catch (err) {
      console.error('[guest-offers] POST', err.message);
      return respond(200, { success: false, error: 'Could not save your details. Please try again.' });
    }

    // Emails are best effort — never fail the signup over a mail hiccup.
    if (verified) {
      await emailGuestCode(offer, cfg).catch(e => console.error('[guest-offers] guest code email failed:', e.message));
    } else {
      await emailGuestPending(offer, cfg).catch(e => console.error('[guest-offers] guest pending email failed:', e.message));
    }
    await notifyOwner(offer, cfg, verified).catch(e => console.error('[guest-offers] owner email failed:', e.message));

    return respond(200, { success: true, verified });
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

    // approve — mint a code if needed, then email it
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

// Auto-verify a signup against real stays. A match is either an exact email
// match, or the same check-in date with a compatible name. Fails closed (returns
// false → manual review) on any error, so a DB blip never auto-issues a code.
async function verifyAgainstBookings({ name, email, checkinDate }) {
  try {
    const url = `${SUPABASE_URL}/rest/v1/bookings?property_id=eq.${PROPERTY_ID}&status=neq.cancelled&select=guest_name,checkin,email`;
    const res = await fetch(url, { headers: sbHeaders });
    const rows = await res.json();
    if (!Array.isArray(rows)) return false;

    const em = (email || '').trim().toLowerCase();
    const nm = normalizeName(name);

    return rows.some(b => {
      if (em && (b.email || '').trim().toLowerCase() === em) return true;
      if (checkinDate && b.checkin && String(b.checkin).slice(0, 10) === checkinDate) {
        const bn = normalizeName(b.guest_name);
        if (bn && nm && (bn === nm || bn.includes(nm) || nm.includes(bn))) return true;
      }
      return false;
    });
  } catch (err) {
    console.error('[guest-offers] verify failed:', err.message);
    return false;
  }
}

function normalizeName(s) {
  return String(s || '').toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim();
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

async function emailGuestCode(offer, cfg) {
  if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY not set');
  const propName = getPropertyName(cfg);
  const html = guestOfferCodeEmail({
    guestName: offer.guest_name,
    promoCode: offer.promo_code,
    discountPct: offer.discount_pct || 5,
    expiresAt: offer.expires_at,
    siteUrl: SITE_URL,
    siteConfig: cfg,
  });
  await sendEmail(getEmailFrom(cfg), offer.email, `Your ${offer.discount_pct || 5}% off code for ${propName}`, html);
}

async function emailGuestPending(offer, cfg) {
  if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY not set');
  const propName = getPropertyName(cfg);
  const html = guestOfferPendingEmail({
    guestName: offer.guest_name,
    siteUrl: SITE_URL,
    siteConfig: cfg,
  });
  await sendEmail(getEmailFrom(cfg), offer.email, `We've received your request — ${propName}`, html);
}

async function notifyOwner(offer, cfg, autoApproved) {
  if (!RESEND_API_KEY || !HOST_EMAIL) { console.warn('[guest-offers] owner notify skipped — email not configured'); return; }
  const html = guestOfferHostEmail({
    guestName: offer.guest_name,
    email: offer.email,
    phone: offer.phone,
    checkinDate: offer.checkin_date,
    newsletter: offer.newsletter_opt_in,
    autoApproved,
    promoCode: offer.promo_code,
    siteUrl: SITE_URL,
    siteConfig: cfg,
  });
  const subject = autoApproved
    ? `Guest code auto-sent — ${offer.guest_name}`
    : `New guest discount signup (review) — ${offer.guest_name}`;
  await sendEmail(getEmailFrom(cfg), HOST_EMAIL, subject, html, offer.email);
}

function respond(status, body) {
  return { statusCode: status, headers: corsHeaders, body: JSON.stringify(body) };
}
