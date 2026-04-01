// ── email-templates.js — Branded HTML email templates for Glenhaven ──
// Used by webhook.js (confirmation) and email-sequence.js (pre-arrival, check-in, post-checkout)
// All templates use email-safe inline styles (no CSS variables, no SVG, no flexbox)

const BRAND = {
  dark: '#1a3a2a',
  green: '#1a6640',
  cream: '#fdfaf5',
  linen: '#f5f0e8',
  bark: '#2c1c0e',
  text: '#5a5043',
  muted: '#7a6a58',
  faint: '#8a7d6b',
  border: '#e8e0d0',
  light: '#b0a898',
};

function header() {
  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.dark};">
      <tr>
        <td style="padding:28px 32px;">
          <p style="margin:0;font-size:26px;font-weight:bold;color:#fff;font-family:Georgia,serif;">Glenhaven</p>
          <p style="margin:6px 0 0;font-size:11px;color:rgba(255,255,255,0.45);letter-spacing:2px;">KATOOMBA &middot; BLUE MOUNTAINS &middot; NSW</p>
        </td>
      </tr>
    </table>`;
}

function footer(siteUrl) {
  return `
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding:12px 32px;text-align:center;font-size:12px;color:${BRAND.light};">
          Questions? <a href="${siteUrl}/contact.html" style="color:${BRAND.green};text-decoration:none;font-weight:bold;">Contact us</a>
        </td>
      </tr>
      <tr>
        <td style="border-top:1px solid ${BRAND.border};padding:16px 32px;text-align:center;font-size:11px;color:${BRAND.light};">
          &#8962; Glenhaven &middot; Katoomba, NSW &middot; Blue Mountains
        </td>
      </tr>
    </table>`;
}

function btn(text, href, primary = true) {
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

// ═══════════════════════════════════════════════════════════════
// EMAIL 1 — Booking confirmed (sent immediately after payment)
// ═══════════════════════════════════════════════════════════════
function confirmationEmail({ guestName, checkIn, checkOut, nights, guests, total, amountPaid, avgNightly, cleaningFee, discountAmt, losDiscount, refCode, cancellationDate, siteUrl }) {
  const nightlyTotal = (avgNightly || Math.round((total - (cleaningFee || 150)) / (nights || 1))) * (nights || 1);
  const cleaning = cleaningFee || 150;

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

  return `
<!DOCTYPE html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/></head>
<body style="margin:0;padding:0;background:${BRAND.linen};font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.linen};">
<tr><td align="center" style="padding:24px 16px;">
<table width="520" cellpadding="0" cellspacing="0" style="background:${BRAND.cream};border-radius:8px;overflow:hidden;border:1px solid ${BRAND.border};max-width:100%;">

${header()}

<tr><td style="background:${BRAND.green};padding:14px 32px;">
  <table width="100%" cellpadding="0" cellspacing="0"><tr>
    <td style="font-size:14px;color:#fff;font-weight:bold;">&#10003; Booking confirmed</td>
    <td style="font-size:13px;color:rgba(255,255,255,0.7);text-align:right;font-family:monospace;">${refCode || ''}</td>
  </tr></table>
</td></tr>

<tr><td style="padding:28px 32px 8px;">
  <p style="margin:0 0 6px;font-size:22px;color:${BRAND.bark};font-family:Georgia,serif;">Welcome, ${guestName}!</p>
  <p style="margin:0;font-size:14px;color:${BRAND.text};line-height:1.65;">Your mountain retreat is locked in. We can't wait to host you at Glenhaven &mdash; here's everything about your stay.</p>
</td></tr>

<tr><td style="padding:20px 32px;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.linen};border-radius:8px;">
    <tr>
      <td style="padding:20px 24px;" width="50%">
        <p style="margin:0;font-size:10px;color:${BRAND.faint};letter-spacing:1px;">CHECK-IN</p>
        <p style="margin:5px 0 0;font-size:15px;color:${BRAND.bark};font-weight:bold;">${fmtDate(checkIn)}</p>
        <p style="margin:2px 0 0;font-size:12px;color:${BRAND.muted};">from 3:00 PM</p>
      </td>
      <td style="padding:20px 24px;" width="50%">
        <p style="margin:0;font-size:10px;color:${BRAND.faint};letter-spacing:1px;">CHECK-OUT</p>
        <p style="margin:5px 0 0;font-size:15px;color:${BRAND.bark};font-weight:bold;">${fmtDate(checkOut)}</p>
        <p style="margin:2px 0 0;font-size:12px;color:${BRAND.muted};">by 10:00 AM</p>
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
      <p style="margin:4px 0 0;font-size:13px;color:${BRAND.muted};">Free cancellation until <strong style="color:${BRAND.bark};">${fmtDate(cancellationDate)}</strong>. After that, the first night is non-refundable.</p>
    </td></tr>
  </table>
</td></tr>` : ''}

<tr><td style="padding:0 32px 20px;">
  <p style="margin:0 0 12px;font-size:10px;color:${BRAND.faint};letter-spacing:1px;">THE PROPERTY</p>
  <p style="margin:0;font-size:13px;color:${BRAND.text};">&#9744; 4 bedrooms &nbsp;&middot;&nbsp; &#9744; 2.5 baths &nbsp;&middot;&nbsp; &#9744; Sleeps 8</p>
</td></tr>

<tr><td style="padding:0 32px 20px;">
  <p style="margin:0 0 10px;font-size:10px;color:${BRAND.faint};letter-spacing:1px;">WHAT'S INCLUDED</p>
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td style="font-size:13px;color:${BRAND.text};padding:3px 0;" width="50%">&#10003; Fresh linen &amp; towels</td>
      <td style="font-size:13px;color:${BRAND.text};padding:3px 0;" width="50%">&#10003; Firewood &amp; kindling</td>
    </tr>
    <tr>
      <td style="font-size:13px;color:${BRAND.text};padding:3px 0;">&#10003; Full kitchen</td>
      <td style="font-size:13px;color:${BRAND.text};padding:3px 0;">&#10003; Toiletries &amp; essentials</td>
    </tr>
    <tr>
      <td style="font-size:13px;color:${BRAND.text};padding:3px 0;">&#10003; Fast WiFi</td>
      <td style="font-size:13px;color:${BRAND.text};padding:3px 0;">&#10003; Free parking</td>
    </tr>
  </table>
</td></tr>

<tr><td style="padding:0 32px 24px;text-align:center;">
  ${btn('Add to calendar', siteUrl + '/api/calendar-invite?ref=' + (refCode || ''), true)}
  &nbsp;&nbsp;
  ${btn('House rules', siteUrl + '/house-rules.html', false)}
</td></tr>

<tr><td style="padding:16px 32px;background:${BRAND.linen};font-size:13px;color:${BRAND.muted};line-height:1.6;">
  Check-in details &mdash; keypad code, WiFi, and directions &mdash; will be sent the day before your arrival.
</td></tr>

${footer(siteUrl)}

</table>
</td></tr></table>
</body></html>`;
}

// ═══════════════════════════════════════════════════════════════
// EMAIL 2 — Pre-arrival (7 days before check-in)
// ═══════════════════════════════════════════════════════════════
function preArrivalEmail({ guestName, checkIn, siteUrl }) {
  return `
<!DOCTYPE html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/></head>
<body style="margin:0;padding:0;background:${BRAND.linen};font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.linen};">
<tr><td align="center" style="padding:24px 16px;">
<table width="520" cellpadding="0" cellspacing="0" style="background:${BRAND.cream};border-radius:8px;overflow:hidden;border:1px solid ${BRAND.border};max-width:100%;">

${header()}

<tr><td style="padding:28px 32px 8px;">
  <p style="margin:0 0 4px;font-size:12px;color:${BRAND.green};font-weight:bold;letter-spacing:1px;">7 DAYS TO GO</p>
  <p style="margin:0 0 16px;font-size:22px;color:${BRAND.bark};font-family:Georgia,serif;">Getting excited, ${guestName}?</p>
  <p style="margin:0 0 20px;font-size:14px;color:${BRAND.text};line-height:1.65;">Your Blue Mountains escape is just around the corner. Here are a few things to help you prepare.</p>
</td></tr>

<tr><td style="padding:0 32px 14px;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td style="width:40px;vertical-align:top;padding-top:2px;">
        <div style="width:36px;height:36px;border-radius:8px;background:#EAF3DE;text-align:center;line-height:36px;font-size:16px;">&#128663;</div>
      </td>
      <td style="padding-left:12px;">
        <p style="margin:0;font-size:13px;font-weight:bold;color:${BRAND.bark};">Getting there</p>
        <p style="margin:4px 0 0;font-size:13px;color:${BRAND.muted};line-height:1.5;">90 minutes from Sydney CBD. Take the M4 then Great Western Highway. Free parking in the driveway for 2 cars.</p>
      </td>
    </tr>
  </table>
</td></tr>

<tr><td style="padding:0 32px 14px;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td style="width:40px;vertical-align:top;padding-top:2px;">
        <div style="width:36px;height:36px;border-radius:8px;background:#FAEEDA;text-align:center;line-height:36px;font-size:16px;">&#129717;</div>
      </td>
      <td style="padding-left:12px;">
        <p style="margin:0;font-size:13px;font-weight:bold;color:${BRAND.bark};">Fireplace ready</p>
        <p style="margin:4px 0 0;font-size:13px;color:${BRAND.muted};line-height:1.5;">Firewood and kindling are stocked by the hearth. Perfect for those cool mountain evenings.</p>
      </td>
    </tr>
  </table>
</td></tr>

<tr><td style="padding:0 32px 14px;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td style="width:40px;vertical-align:top;padding-top:2px;">
        <div style="width:36px;height:36px;border-radius:8px;background:#E6F1FB;text-align:center;line-height:36px;font-size:16px;">&#128722;</div>
      </td>
      <td style="padding-left:12px;">
        <p style="margin:0;font-size:13px;font-weight:bold;color:${BRAND.bark};">Stock up</p>
        <p style="margin:4px 0 0;font-size:13px;color:${BRAND.muted};line-height:1.5;">Coles and Woolworths are both 5 minutes away in Katoomba. The kitchen is fully equipped for cooking in.</p>
      </td>
    </tr>
  </table>
</td></tr>

<tr><td style="padding:0 32px 14px;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td style="width:40px;vertical-align:top;padding-top:2px;">
        <div style="width:36px;height:36px;border-radius:8px;background:#EEEDFE;text-align:center;line-height:36px;font-size:16px;">&#129406;</div>
      </td>
      <td style="padding-left:12px;">
        <p style="margin:0;font-size:13px;font-weight:bold;color:${BRAND.bark};">What to pack</p>
        <p style="margin:4px 0 0;font-size:13px;color:${BRAND.muted};line-height:1.5;">Layers are key &mdash; mountain weather shifts fast. Walking shoes if you plan to hit the trails. We supply towels, linen, and essentials.</p>
      </td>
    </tr>
  </table>
</td></tr>

<tr><td style="padding:12px 32px 20px;">
  <p style="margin:0;font-size:13px;color:${BRAND.muted};line-height:1.6;">Your check-in details (keypad code, WiFi, etc.) will arrive the day before. See you soon!</p>
</td></tr>

${footer(siteUrl)}

</table>
</td></tr></table>
</body></html>`;
}

// ═══════════════════════════════════════════════════════════════
// EMAIL 3 — Check-in details (1 day before check-in)
// ═══════════════════════════════════════════════════════════════
function checkInEmail({ guestName, checkIn, checkOut, checkInInfo, siteUrl }) {
  const info = checkInInfo || {};
  return `
<!DOCTYPE html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/></head>
<body style="margin:0;padding:0;background:${BRAND.linen};font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.linen};">
<tr><td align="center" style="padding:24px 16px;">
<table width="520" cellpadding="0" cellspacing="0" style="background:${BRAND.cream};border-radius:8px;overflow:hidden;border:1px solid ${BRAND.border};max-width:100%;">

${header()}

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
  ${btn('Get directions', 'https://maps.google.com/?q=' + encodeURIComponent(info.address || 'Katoomba NSW'), true)}
</td></tr>

<tr><td style="padding:0 32px 20px;border-top:1px solid ${BRAND.border};margin:0 32px;">
  <p style="margin:16px 0 8px;font-size:13px;font-weight:bold;color:${BRAND.bark};">Quick reminders</p>
  <p style="margin:0 0 4px;font-size:13px;color:${BRAND.muted};">&middot; Check-in from 3:00 PM &middot; Check-out by 10:00 AM</p>
  <p style="margin:0 0 4px;font-size:13px;color:${BRAND.muted};">&middot; Quiet hours after 10 PM</p>
  <p style="margin:0 0 4px;font-size:13px;color:${BRAND.muted};">&middot; Heating instructions on the kitchen noticeboard</p>
</td></tr>

<tr><td style="padding:0 32px 20px;">
  <p style="margin:0;font-size:13px;color:${BRAND.muted};">Any issues on arrival? <a href="${siteUrl}/contact.html" style="color:${BRAND.green};text-decoration:none;font-weight:bold;">Contact us here</a>.</p>
</td></tr>

${footer(siteUrl)}

</table>
</td></tr></table>
</body></html>`;
}

// ═══════════════════════════════════════════════════════════════
// EMAIL 4 — Post-checkout (1 day after checkout)
// ═══════════════════════════════════════════════════════════════
function postCheckoutEmail({ guestName, returnCode, siteUrl }) {
  return `
<!DOCTYPE html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/></head>
<body style="margin:0;padding:0;background:${BRAND.linen};font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.linen};">
<tr><td align="center" style="padding:24px 16px;">
<table width="520" cellpadding="0" cellspacing="0" style="background:${BRAND.cream};border-radius:8px;overflow:hidden;border:1px solid ${BRAND.border};max-width:100%;">

${header()}

<tr><td style="padding:28px 32px 8px;">
  <p style="margin:0 0 16px;font-size:22px;color:${BRAND.bark};font-family:Georgia,serif;">Thanks for staying, ${guestName}!</p>
  <p style="margin:0 0 16px;font-size:14px;color:${BRAND.text};line-height:1.65;">We hope the mountains treated you well. Whether it was the fireplace, the trails, or just the quiet &mdash; we're glad you chose Glenhaven.</p>
  <p style="margin:0 0 20px;font-size:14px;color:${BRAND.text};line-height:1.65;">If you have a moment, a short review would mean the world to us. It helps other travellers find their way here too.</p>
</td></tr>

<tr><td style="padding:0 32px 24px;text-align:center;">
  ${btn('Leave a review', siteUrl + '/submit-review.html?ref=' + (returnCode || ''), true)}
</td></tr>

<tr><td style="padding:0 32px 24px;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.linen};border-radius:8px;">
    <tr><td style="padding:20px;text-align:center;">
      <p style="margin:0 0 2px;font-size:17px;font-weight:bold;color:${BRAND.bark};font-family:Georgia,serif;">Come back for 10% off</p>
      <p style="margin:0 0 12px;font-size:13px;color:${BRAND.muted};">Book direct next time with code</p>
      <div style="display:inline-block;background:${BRAND.bark};color:#fff;border-radius:6px;padding:8px 24px;font-family:monospace;font-size:16px;font-weight:bold;letter-spacing:3px;">${returnCode}</div>
      <p style="margin:10px 0 0;font-size:12px;color:${BRAND.light};">at ${siteUrl || 'glenhaven-book.netlify.app'}</p>
    </td></tr>
  </table>
</td></tr>

${footer(siteUrl)}

</table>
</td></tr></table>
</body></html>`;
}

module.exports = {
  confirmationEmail,
  preArrivalEmail,
  checkInEmail,
  postCheckoutEmail,
};
