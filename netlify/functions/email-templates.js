// ── email-templates.js — Branded HTML email templates ────────
// Used by webhook.js (confirmation) and email-sequence.js (pre-arrival, check-in, post-checkout)
// All templates accept an optional siteConfig parameter to pull dynamic property info.
// All templates use email-safe inline styles (no CSS variables, no SVG, no flexbox)

const { getPropertyName, getPropertyLocation, getCheckinTime, getCheckoutTime,
        getBedrooms, getBathrooms, getMaxGuests } = require('./site-config-loader');

function shadeColor(hex, pct) {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.max(0, (num >> 16) + Math.round(2.55 * pct)));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + Math.round(2.55 * pct)));
  const b = Math.min(255, Math.max(0, (num & 0x0000FF) + Math.round(2.55 * pct)));
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function buildBrand(cfg) {
  const primary = cfg?.colors?.primary || '#1a6640';
  const dark = shadeColor(primary, -30);
  return {
    dark: dark,
    green: primary,
    cream: '#fdfaf5',
    linen: '#f5f0e8',
    bark: '#2c1c0e',
    text: '#5a5043',
    muted: '#7a6a58',
    faint: '#8a7d6b',
    border: '#e8e0d0',
    light: '#b0a898',
  };
}

function header(cfg) {
  const BRAND = buildBrand(cfg);
  const name = getPropertyName(cfg);
  const loc = getPropertyLocation(cfg);
  const locTag = loc.replace(/[,·\n]/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase().split(' ').filter(Boolean).join(' &middot; ');
  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.dark};">
      <tr>
        <td style="padding:28px 32px;">
          <p style="margin:0;font-size:26px;font-weight:bold;color:#fff;font-family:Georgia,serif;">${name}</p>
          <p style="margin:6px 0 0;font-size:11px;color:rgba(255,255,255,0.45);letter-spacing:2px;">${locTag}</p>
        </td>
      </tr>
    </table>`;
}

function footer(siteUrl, cfg) {
  const BRAND = buildBrand(cfg);
  const name = getPropertyName(cfg);
  const loc = getPropertyLocation(cfg);
  return `
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding:12px 32px;text-align:center;font-size:12px;color:${BRAND.light};">
          Questions? <a href="${siteUrl}/contact.html" style="color:${BRAND.green};text-decoration:none;font-weight:bold;">Contact us</a>
        </td>
      </tr>
      <tr>
        <td style="border-top:1px solid ${BRAND.border};padding:16px 32px;text-align:center;font-size:11px;color:${BRAND.light};">
          &#8962; ${name} &middot; ${loc}
        </td>
      </tr>
    </table>`;
}

function btn(text, href, primary, cfg) {
  const BRAND = buildBrand(cfg);
  const bg = primary ? BRAND.green : BRAND.cream;
  const fg = primary ? '#fff' : BRAND.bark;
  const bdr = primary ? BRAND.green : '#d4cbbe';
  return `<a href="${href}" style="display:inline-block;background:${bg};color:${fg};border:1px solid ${bdr};border-radius:8px;padding:12px 28px;font-size:13px;font-weight:bold;text-decoration:none;">${text}</a>`;
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
}

function fmtAUD(n) {
  return '$' + Number(n).toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function getTopAmenities(cfg) {
  if (!cfg?.amenities || !cfg.amenities.length) {
    return [
      ['Fresh linen &amp; towels', 'Firewood &amp; kindling'],
      ['Full kitchen', 'Toiletries &amp; essentials'],
      ['Fast WiFi', 'Free parking'],
    ];
  }
  const flat = [];
  for (const cat of cfg.amenities) {
    if (typeof cat === 'string') { flat.push(cat); }
    else if (cat.items) { flat.push(...cat.items); }
  }
  const cleaned = flat.map(a => a.replace(/^\p{Emoji}\s*/u, '').trim()).filter(Boolean);
  const rows = [];
  for (let i = 0; i < Math.min(6, cleaned.length); i += 2) {
    rows.push([cleaned[i] || '', cleaned[i + 1] || '']);
  }
  return rows.length ? rows : [['Fresh linen &amp; towels', 'Full kitchen'], ['Fast WiFi', 'Free parking']];
}

function getQuietHours(cfg) {
  const noise = cfg?.houseRules?.noise;
  if (Array.isArray(noise)) {
    const match = noise.find(r => /quiet/i.test(r));
    if (match) {
      const timeMatch = match.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm)\s*(?:to|–|-)\s*\d{1,2}(?::\d{2})?\s*(?:am|pm))/i);
      if (timeMatch) return timeMatch[1];
    }
  }
  return '11 PM';
}

function getPreArrivalTips(cfg) {
  const loc = cfg?.location;
  const tips = [];

  let gettingThere = '90 minutes from Sydney CBD. Free parking in the driveway for 2 cars.';
  if (loc?.transport && loc.transport.length) {
    const bycar = loc.transport.find(t => /car|driv/i.test(t.title || ''));
    if (bycar) gettingThere = bycar.description;
  }
  tips.push({ icon: '&#128663;', title: 'Getting there', text: gettingThere });

  tips.push({ icon: '&#129717;', title: 'Fireplace ready', text: 'Firewood and kindling are stocked by the hearth. Perfect for those cool mountain evenings.' });
  tips.push({ icon: '&#128722;', title: 'Stock up', text: 'The kitchen is fully equipped for cooking in. Local shops are just minutes away.' });
  tips.push({ icon: '&#129406;', title: 'What to pack', text: 'Layers are key &mdash; mountain weather shifts fast. Walking shoes if you plan to hit the trails. We supply towels, linen, and essentials.' });

  return tips;
}

// ═══════════════════════════════════════════════════════════════
// EMAIL 1 — Booking confirmed (sent immediately after payment)
// ═══════════════════════════════════════════════════════════════
function confirmationEmail({ guestName, checkIn, checkOut, nights, guests, total, amountPaid, avgNightly, cleaningFee, discountAmt, losDiscount, refCode, cancellationDate, siteUrl, siteConfig }) {
  const cfg = siteConfig || {};
  const BRAND = buildBrand(cfg);
  const propName = getPropertyName(cfg);
  const checkinTime = getCheckinTime(cfg);
  const checkoutTime = getCheckoutTime(cfg);
  const bedrooms = getBedrooms(cfg);
  const bathrooms = getBathrooms(cfg);
  const maxGuests = getMaxGuests(cfg);
  const amenityRows = getTopAmenities(cfg);

  const cleaning = cleaningFee || 150;
  const nightlyTotal = (avgNightly || Math.round((total - cleaning) / (nights || 1))) * (nights || 1);

  let priceRows = `
    <tr>
      <td style="padding:6px 0;font-size:13px;color:${BRAND.text};">${nights} night${nights > 1 ? 's' : ''} &times; ${fmtAUD(avgNightly || Math.round(nightlyTotal / nights))}</td>
      <td style="padding:6px 0;font-size:13px;color:${BRAND.bark};text-align:right;">${fmtAUD(nightlyTotal)}</td>
    </tr>`;
  if (discountAmt && discountAmt > 0) {
    priceRows += `
    <tr>
      <td style="padding:6px 0;font-size:13px;color:${BRAND.green};">Stay discount (${Math.round((losDiscount || 0) * 100)}%)</td>
      <td style="padding:6px 0;font-size:13px;color:${BRAND.green};text-align:right;">&minus;${fmtAUD(discountAmt)}</td>
    </tr>`;
  }
  priceRows += `
    <tr>
      <td style="padding:6px 0;font-size:13px;color:${BRAND.text};">Cleaning fee</td>
      <td style="padding:6px 0;font-size:13px;color:${BRAND.bark};text-align:right;">${fmtAUD(cleaning)}</td>
    </tr>`;

  const isDeposit = amountPaid && amountPaid < total;
  let totalRow = `
    <tr>
      <td style="padding:10px 0 0;font-size:14px;font-weight:bold;color:${BRAND.bark};border-top:1px solid ${BRAND.border};">Total${isDeposit ? '' : ' paid'}</td>
      <td style="padding:10px 0 0;font-size:14px;font-weight:bold;color:${BRAND.green};text-align:right;border-top:1px solid ${BRAND.border};">${fmtAUD(total)} AUD</td>
    </tr>`;

  if (isDeposit) {
    totalRow += `
    <tr>
      <td style="padding:6px 0;font-size:13px;color:${BRAND.text};">Deposit paid</td>
      <td style="padding:6px 0;font-size:13px;color:${BRAND.green};text-align:right;">${fmtAUD(amountPaid)} AUD</td>
    </tr>
    <tr>
      <td style="padding:6px 0;font-size:13px;font-weight:bold;color:#92650e;">Balance due before check-in</td>
      <td style="padding:6px 0;font-size:13px;font-weight:bold;color:#92650e;text-align:right;">${fmtAUD(total - amountPaid)} AUD</td>
    </tr>`;
  }

  const amenityHtml = amenityRows.map(([a, b]) =>
    `<tr><td style="font-size:13px;color:${BRAND.text};padding:3px 0;" width="50%">&#10003; ${a}</td><td style="font-size:13px;color:${BRAND.text};padding:3px 0;" width="50%">&#10003; ${b}</td></tr>`
  ).join('');

  return `
<!DOCTYPE html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/></head>
<body style="margin:0;padding:0;background:${BRAND.linen};font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.linen};">
<tr><td align="center" style="padding:24px 16px;">
<table width="520" cellpadding="0" cellspacing="0" style="background:${BRAND.cream};border-radius:8px;overflow:hidden;border:1px solid ${BRAND.border};max-width:100%;">

${header(cfg)}

<tr><td style="background:${BRAND.green};padding:14px 32px;">
  <table width="100%" cellpadding="0" cellspacing="0"><tr>
    <td style="font-size:14px;color:#fff;font-weight:bold;">&#10003; Booking confirmed</td>
    <td style="font-size:13px;color:rgba(255,255,255,0.7);text-align:right;font-family:monospace;">${refCode || ''}</td>
  </tr></table>
</td></tr>

<tr><td style="padding:28px 32px 8px;">
  <p style="margin:0 0 6px;font-size:22px;color:${BRAND.bark};font-family:Georgia,serif;">Welcome, ${guestName}!</p>
  <p style="margin:0;font-size:14px;color:${BRAND.text};line-height:1.65;">Your mountain retreat is locked in. We can't wait to host you at ${propName} &mdash; here's everything about your stay.</p>
</td></tr>

<tr><td style="padding:20px 32px;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.linen};border-radius:8px;">
    <tr>
      <td style="padding:20px 24px;" width="50%">
        <p style="margin:0;font-size:10px;color:${BRAND.faint};letter-spacing:1px;">CHECK-IN</p>
        <p style="margin:5px 0 0;font-size:15px;color:${BRAND.bark};font-weight:bold;">${fmtDate(checkIn)}</p>
        <p style="margin:2px 0 0;font-size:12px;color:${BRAND.muted};">from ${checkinTime}</p>
      </td>
      <td style="padding:20px 24px;" width="50%">
        <p style="margin:0;font-size:10px;color:${BRAND.faint};letter-spacing:1px;">CHECK-OUT</p>
        <p style="margin:5px 0 0;font-size:15px;color:${BRAND.bark};font-weight:bold;">${fmtDate(checkOut)}</p>
        <p style="margin:2px 0 0;font-size:12px;color:${BRAND.muted};">by ${checkoutTime}</p>
      </td>
    </tr>
    <tr>
      <td style="padding:0 24px 20px;">
        <p style="margin:0;font-size:10px;color:${BRAND.faint};letter-spacing:1px;">NIGHTS</p>
        <p style="margin:5px 0 0;font-size:15px;color:${BRAND.bark};font-weight:bold;">${nights} night${nights > 1 ? 's' : ''}</p>
      </td>
      <td style="padding:0 24px 20px;">
        <p style="margin:0;font-size:10px;color:${BRAND.faint};letter-spacing:1px;">GUESTS</p>
        <p style="margin:5px 0 0;font-size:15px;color:${BRAND.bark};font-weight:bold;">${guests} guest${guests > 1 ? 's' : ''}</p>
      </td>
    </tr>
  </table>
</td></tr>

<tr><td style="padding:0 32px 20px;">
  <p style="margin:0 0 12px;font-size:10px;color:${BRAND.faint};letter-spacing:1px;">PAYMENT SUMMARY</p>
  <table width="100%" cellpadding="0" cellspacing="0">
    ${priceRows}
    ${totalRow}
  </table>
</td></tr>

${cancellationDate ? `
<tr><td style="padding:0 32px 20px;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef9ec;border:1px solid #f0e4c8;border-radius:8px;">
    <tr><td style="padding:14px 18px;">
      <p style="margin:0;font-size:12px;color:#92650e;font-weight:bold;">Cancellation policy</p>
      <p style="margin:4px 0 0;font-size:13px;color:${BRAND.muted};">Free cancellation until <strong style="color:${BRAND.bark};">${fmtDate(cancellationDate)}</strong> (48 hours from booking). After that, all cancellations are non-refundable.</p>
    </td></tr>
  </table>
</td></tr>` : `
<tr><td style="padding:0 32px 20px;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef9ec;border:1px solid #f0e4c8;border-radius:8px;">
    <tr><td style="padding:14px 18px;">
      <p style="margin:0;font-size:12px;color:#92650e;font-weight:bold;">Cancellation policy</p>
      <p style="margin:4px 0 0;font-size:13px;color:${BRAND.muted};">This booking is non-refundable.</p>
    </td></tr>
  </table>
</td></tr>`}

<tr><td style="padding:0 32px 20px;">
  <p style="margin:0 0 12px;font-size:10px;color:${BRAND.faint};letter-spacing:1px;">THE PROPERTY</p>
  <p style="margin:0;font-size:13px;color:${BRAND.text};">&#9744; ${bedrooms} bedrooms &nbsp;&middot;&nbsp; &#9744; ${bathrooms} baths &nbsp;&middot;&nbsp; &#9744; Sleeps ${maxGuests}</p>
</td></tr>

<tr><td style="padding:0 32px 20px;">
  <p style="margin:0 0 10px;font-size:10px;color:${BRAND.faint};letter-spacing:1px;">WHAT'S INCLUDED</p>
  <table width="100%" cellpadding="0" cellspacing="0">
    ${amenityHtml}
  </table>
</td></tr>

<tr><td style="padding:0 32px 24px;text-align:center;">
  ${btn('Add to calendar', siteUrl + '/api/calendar-invite?ref=' + (refCode || ''), true, cfg)}
  &nbsp;&nbsp;
  ${btn('House rules', siteUrl + '/house-rules.html', false, cfg)}
</td></tr>

<tr><td style="padding:16px 32px;background:${BRAND.linen};font-size:13px;color:${BRAND.muted};line-height:1.6;">
  Check-in details &mdash; keypad code, WiFi, and directions &mdash; will be sent the day before your arrival.
</td></tr>

${footer(siteUrl, cfg)}

</table>
</td></tr></table>
</body></html>`;
}

// ═══════════════════════════════════════════════════════════════
// EMAIL 2 — Pre-arrival (7 days before check-in)
// ═══════════════════════════════════════════════════════════════
function preArrivalEmail({ guestName, checkIn, siteUrl, siteConfig }) {
  const cfg = siteConfig || {};
  const BRAND = buildBrand(cfg);
  const tips = getPreArrivalTips(cfg);

  const tipsHtml = tips.map(t => `
<tr><td style="padding:0 32px 14px;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td style="width:40px;vertical-align:top;padding-top:2px;">
        <div style="width:36px;height:36px;border-radius:8px;background:#EAF3DE;text-align:center;line-height:36px;font-size:16px;">${t.icon}</div>
      </td>
      <td style="padding-left:12px;">
        <p style="margin:0;font-size:13px;font-weight:bold;color:${BRAND.bark};">${t.title}</p>
        <p style="margin:4px 0 0;font-size:13px;color:${BRAND.muted};line-height:1.5;">${t.text}</p>
      </td>
    </tr>
  </table>
</td></tr>`).join('');

  return `
<!DOCTYPE html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/></head>
<body style="margin:0;padding:0;background:${BRAND.linen};font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.linen};">
<tr><td align="center" style="padding:24px 16px;">
<table width="520" cellpadding="0" cellspacing="0" style="background:${BRAND.cream};border-radius:8px;overflow:hidden;border:1px solid ${BRAND.border};max-width:100%;">

${header(cfg)}

<tr><td style="padding:28px 32px 8px;">
  <p style="margin:0 0 4px;font-size:12px;color:${BRAND.green};font-weight:bold;letter-spacing:1px;">7 DAYS TO GO</p>
  <p style="margin:0 0 16px;font-size:22px;color:${BRAND.bark};font-family:Georgia,serif;">Getting excited, ${guestName}?</p>
  <p style="margin:0 0 20px;font-size:14px;color:${BRAND.text};line-height:1.65;">Your escape is just around the corner. Here are a few things to help you prepare.</p>
</td></tr>

${tipsHtml}

<tr><td style="padding:12px 32px 20px;">
  <p style="margin:0;font-size:13px;color:${BRAND.muted};line-height:1.6;">Your check-in details (keypad code, WiFi, etc.) will arrive the day before. See you soon!</p>
</td></tr>

${footer(siteUrl, cfg)}

</table>
</td></tr></table>
</body></html>`;
}

// ═══════════════════════════════════════════════════════════════
// EMAIL 3 — Check-in details (1 day before check-in)
// ═══════════════════════════════════════════════════════════════
function checkInEmail({ guestName, checkIn, checkOut, checkInInfo, siteUrl, siteConfig }) {
  const cfg = siteConfig || {};
  const BRAND = buildBrand(cfg);
  const info = checkInInfo || {};
  const checkinTime = getCheckinTime(cfg);
  const checkoutTime = getCheckoutTime(cfg);
  const quietHours = getQuietHours(cfg);

  return `
<!DOCTYPE html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/></head>
<body style="margin:0;padding:0;background:${BRAND.linen};font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.linen};">
<tr><td align="center" style="padding:24px 16px;">
<table width="520" cellpadding="0" cellspacing="0" style="background:${BRAND.cream};border-radius:8px;overflow:hidden;border:1px solid ${BRAND.border};max-width:100%;">

${header(cfg)}

<tr><td style="padding:28px 32px 8px;">
  <p style="margin:0 0 4px;font-size:12px;color:#b45309;font-weight:bold;letter-spacing:1px;">ARRIVING TOMORROW</p>
  <p style="margin:0 0 16px;font-size:22px;color:${BRAND.bark};font-family:Georgia,serif;">Your check-in details</p>
  <p style="margin:0 0 16px;font-size:14px;color:${BRAND.text};line-height:1.65;">Hi ${guestName} &mdash; everything is ready for you. Here's all you need to let yourself in and get settled.</p>
</td></tr>

<tr><td style="padding:0 32px 16px;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bark};border-radius:8px;">
    <tr><td style="padding:20px;text-align:center;">
      <p style="margin:0 0 4px;font-size:11px;color:rgba(255,255,255,0.5);letter-spacing:2px;">${(info.access_type || 'KEYPAD').toUpperCase()} CODE</p>
      <p style="margin:0;font-size:36px;font-weight:bold;color:#fff;font-family:monospace;letter-spacing:8px;">${info.access_code || '----'}</p>
      <p style="margin:8px 0 0;font-size:12px;color:rgba(255,255,255,0.5);">${info.access_note || 'On the front door'}</p>
    </td></tr>
  </table>
</td></tr>

<tr><td style="padding:0 32px 16px;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.linen};border-radius:8px;">
    <tr>
      <td style="padding:16px 20px;" width="50%">
        <p style="margin:0;font-size:10px;color:${BRAND.faint};letter-spacing:1px;">WIFI NETWORK</p>
        <p style="margin:4px 0 0;font-size:13px;color:${BRAND.bark};font-weight:bold;font-family:monospace;">${info.wifi_network || '—'}</p>
      </td>
      <td style="padding:16px 20px;" width="50%">
        <p style="margin:0;font-size:10px;color:${BRAND.faint};letter-spacing:1px;">WIFI PASSWORD</p>
        <p style="margin:4px 0 0;font-size:13px;color:${BRAND.bark};font-weight:bold;font-family:monospace;">${info.wifi_password || '—'}</p>
      </td>
    </tr>
    <tr>
      <td style="padding:0 20px 16px;">
        <p style="margin:0;font-size:10px;color:${BRAND.faint};letter-spacing:1px;">PARKING</p>
        <p style="margin:4px 0 0;font-size:13px;color:${BRAND.bark};">${info.parking || '—'}</p>
      </td>
      <td style="padding:0 20px 16px;">
        <p style="margin:0;font-size:10px;color:${BRAND.faint};letter-spacing:1px;">ADDRESS</p>
        <p style="margin:4px 0 0;font-size:13px;color:${BRAND.bark};">${info.address || '—'}</p>
      </td>
    </tr>
  </table>
</td></tr>

<tr><td style="padding:0 32px 16px;text-align:center;">
  ${btn('Get directions', 'https://maps.google.com/?q=' + encodeURIComponent(info.address || 'Katoomba NSW'), true, cfg)}
</td></tr>

<tr><td style="padding:0 32px 20px;border-top:1px solid ${BRAND.border};margin:0 32px;">
  <p style="margin:16px 0 8px;font-size:13px;font-weight:bold;color:${BRAND.bark};">Quick reminders</p>
  <p style="margin:0 0 4px;font-size:13px;color:${BRAND.muted};">&middot; Check-in from ${checkinTime} &middot; Check-out by ${checkoutTime}</p>
  <p style="margin:0 0 4px;font-size:13px;color:${BRAND.muted};">&middot; Quiet hours after ${quietHours}</p>
  <p style="margin:0 0 4px;font-size:13px;color:${BRAND.muted};">&middot; Heating instructions on the kitchen noticeboard</p>
</td></tr>

<tr><td style="padding:0 32px 20px;">
  <p style="margin:0;font-size:13px;color:${BRAND.muted};">Any issues on arrival? <a href="${siteUrl}/contact.html" style="color:${BRAND.green};text-decoration:none;font-weight:bold;">Contact us here</a>.</p>
</td></tr>

${footer(siteUrl, cfg)}

</table>
</td></tr></table>
</body></html>`;
}

// ═══════════════════════════════════════════════════════════════
// EMAIL 4 — Post-checkout (1 day after checkout)
// ═══════════════════════════════════════════════════════════════
function postCheckoutEmail({ guestName, returnCode, siteUrl, siteConfig }) {
  const cfg = siteConfig || {};
  const BRAND = buildBrand(cfg);
  const propName = getPropertyName(cfg);

  return `
<!DOCTYPE html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/></head>
<body style="margin:0;padding:0;background:${BRAND.linen};font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.linen};">
<tr><td align="center" style="padding:24px 16px;">
<table width="520" cellpadding="0" cellspacing="0" style="background:${BRAND.cream};border-radius:8px;overflow:hidden;border:1px solid ${BRAND.border};max-width:100%;">

${header(cfg)}

<tr><td style="padding:28px 32px 8px;">
  <p style="margin:0 0 16px;font-size:22px;color:${BRAND.bark};font-family:Georgia,serif;">Thanks for staying, ${guestName}!</p>
  <p style="margin:0 0 16px;font-size:14px;color:${BRAND.text};line-height:1.65;">We hope the mountains treated you well. Whether it was the fireplace, the trails, or just the quiet &mdash; we're glad you chose ${propName}.</p>
  <p style="margin:0 0 20px;font-size:14px;color:${BRAND.text};line-height:1.65;">If you have a moment, a short review would mean the world to us. It helps other travellers find their way here too.</p>
</td></tr>

<tr><td style="padding:0 32px 24px;text-align:center;">
  ${btn('Leave a review', siteUrl + '/submit-review.html?ref=' + (returnCode || ''), true, cfg)}
</td></tr>

<tr><td style="padding:0 32px 24px;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.linen};border-radius:8px;">
    <tr><td style="padding:20px;text-align:center;">
      <p style="margin:0 0 2px;font-size:17px;font-weight:bold;color:${BRAND.bark};font-family:Georgia,serif;">Come back for 10% off</p>
      <p style="margin:0 0 12px;font-size:13px;color:${BRAND.muted};">Book direct next time with code</p>
      <div style="display:inline-block;background:${BRAND.bark};color:#fff;border-radius:6px;padding:8px 24px;font-family:monospace;font-size:16px;font-weight:bold;letter-spacing:3px;">${returnCode}</div>
      <p style="margin:10px 0 0;font-size:12px;color:${BRAND.light};">at ${siteUrl || ''}</p>
    </td></tr>
  </table>
</td></tr>

${footer(siteUrl, cfg)}

</table>
</td></tr></table>
</body></html>`;
}

// ═══════════════════════════════════════════════════════════════
// HOST NOTIFICATION — New confirmed booking (sent to host)
// ═══════════════════════════════════════════════════════════════
function hostNotificationEmail({ guestName, email, phone, checkIn, checkOut, nights, guests, total, amountPaid, cleaningFee, refCode, stripeId, siteUrl, siteConfig }) {
  const cfg = siteConfig || {};
  const BRAND = buildBrand(cfg);
  const checkinTime = getCheckinTime(cfg);
  const checkoutTime = getCheckoutTime(cfg);

  return `
<!DOCTYPE html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/></head>
<body style="margin:0;padding:0;background:${BRAND.linen};font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.linen};">
<tr><td align="center" style="padding:24px 16px;">
<table width="520" cellpadding="0" cellspacing="0" style="background:${BRAND.cream};border-radius:8px;overflow:hidden;border:1px solid ${BRAND.border};max-width:100%;">

${header(cfg)}

<tr><td style="background:${BRAND.green};padding:14px 32px;">
  <table width="100%" cellpadding="0" cellspacing="0"><tr>
    <td style="font-size:14px;color:#fff;font-weight:bold;">&#10003; New confirmed booking</td>
    <td style="font-size:13px;color:rgba(255,255,255,0.7);text-align:right;font-family:monospace;">${refCode || ''}</td>
  </tr></table>
</td></tr>

<tr><td style="padding:28px 32px 8px;">
  <p style="margin:0 0 6px;font-size:22px;color:${BRAND.bark};font-family:Georgia,serif;">${guestName} is confirmed</p>
  <p style="margin:0;font-size:14px;color:${BRAND.text};line-height:1.65;">Payment received and booking written to the system. Here are the details.</p>
</td></tr>

<tr><td style="padding:20px 32px;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.linen};border-radius:8px;">
    <tr>
      <td style="padding:20px 24px;" width="50%">
        <p style="margin:0;font-size:10px;color:${BRAND.faint};letter-spacing:1px;">CHECK-IN</p>
        <p style="margin:5px 0 0;font-size:15px;color:${BRAND.bark};font-weight:bold;">${fmtDate(checkIn)}</p>
        <p style="margin:2px 0 0;font-size:12px;color:${BRAND.muted};">from ${checkinTime}</p>
      </td>
      <td style="padding:20px 24px;" width="50%">
        <p style="margin:0;font-size:10px;color:${BRAND.faint};letter-spacing:1px;">CHECK-OUT</p>
        <p style="margin:5px 0 0;font-size:15px;color:${BRAND.bark};font-weight:bold;">${fmtDate(checkOut)}</p>
        <p style="margin:2px 0 0;font-size:12px;color:${BRAND.muted};">by ${checkoutTime}</p>
      </td>
    </tr>
    <tr>
      <td style="padding:0 24px 20px;">
        <p style="margin:0;font-size:10px;color:${BRAND.faint};letter-spacing:1px;">NIGHTS</p>
        <p style="margin:5px 0 0;font-size:15px;color:${BRAND.bark};font-weight:bold;">${nights} night${nights > 1 ? 's' : ''}</p>
      </td>
      <td style="padding:0 24px 20px;">
        <p style="margin:0;font-size:10px;color:${BRAND.faint};letter-spacing:1px;">GUESTS</p>
        <p style="margin:5px 0 0;font-size:15px;color:${BRAND.bark};font-weight:bold;">${guests} guest${guests > 1 ? 's' : ''}</p>
      </td>
    </tr>
  </table>
</td></tr>

<tr><td style="padding:0 32px 20px;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.linen};border-radius:8px;">
    <tr>
      <td style="padding:16px 24px;" width="50%">
        <p style="margin:0;font-size:10px;color:${BRAND.faint};letter-spacing:1px;">GUEST EMAIL</p>
        <p style="margin:4px 0 0;font-size:13px;color:${BRAND.bark};font-weight:bold;">${email || '—'}</p>
      </td>
      <td style="padding:16px 24px;" width="50%">
        <p style="margin:0;font-size:10px;color:${BRAND.faint};letter-spacing:1px;">GUEST PHONE</p>
        <p style="margin:4px 0 0;font-size:13px;color:${BRAND.bark};font-weight:bold;">${phone || '—'}</p>
      </td>
    </tr>
    <tr>
      <td style="padding:0 24px 16px;" width="50%">
        <p style="margin:0;font-size:10px;color:${BRAND.faint};letter-spacing:1px;">TOTAL</p>
        <p style="margin:4px 0 0;font-size:13px;color:${BRAND.bark};font-weight:bold;">${fmtAUD(total)} AUD</p>
      </td>
      <td style="padding:0 24px 16px;" width="50%">
        <p style="margin:0;font-size:10px;color:${BRAND.faint};letter-spacing:1px;">PAID</p>
        <p style="margin:4px 0 0;font-size:13px;color:${BRAND.bark};font-weight:bold;">${fmtAUD(amountPaid)} AUD</p>
      </td>
    </tr>
  </table>
</td></tr>

<tr><td style="padding:0 32px 20px;">
  <p style="margin:0;font-size:12px;color:${BRAND.light};">Stripe: ${stripeId || '—'}</p>
</td></tr>

${footer(siteUrl, cfg)}

</table>
</td></tr></table>
</body></html>`;
}

module.exports = {
  confirmationEmail,
  hostNotificationEmail,
  preArrivalEmail,
  checkInEmail,
  postCheckoutEmail,
};
