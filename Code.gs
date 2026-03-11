// ============================================================
//  GLENHAVEN — Apps Script (simplified)
//  Responsibilities:
//    1. Return booked date ranges from Google Sheet
//    2. Send enquiry emails (no sheet write yet)
//    3. Write confirmed booking to sheet + send confirmation emails
//
//  Stripe is handled entirely by the Netlify Functions.
//  This script never touches Stripe.
// ============================================================

const SHEET_ID   = '1MfTjakXDYLqfJzPQ18aw8OVuXHxmE9Jn69ILRSKXIIM';
const SHEET_NAME = 'Sheet1';

const CONFIG = {
  HOST_EMAIL        : 'micheltou50@gmail.com',
  PROPERTY_NAME     : 'Glenhaven — Katoomba Cottage',
  CLEANING_FEE      : 150,
  MANAGEMENT_FEE_PCT: 0.10,
};

// Column positions — must match your existing sheet exactly
const COL = {
  CHECK_IN          : 1,   // A
  NIGHTS            : 2,   // B
  CHECK_OUT         : 3,   // C
  GUEST_NAME        : 4,   // D
  NUM_GUESTS        : 5,   // E
  HOST_PAYOUT       : 6,   // F
  CLEANING_FEE      : 7,   // G
  MANAGEMENT_FEE    : 8,   // H
  // I & J = ArrayFormulas — leave blank
  CLEANER_CONFIRMED : 11,  // K
  PLATFORM          : 12,  // L
};

// ── ENTRY POINTS ─────────────────────────────────────────────

function doGet(e) {
  const action  = e.parameter.action;
  const payload = e.parameter.payload;

  if (action === 'availability') {
    return jsonResponse({ success: true, ranges: getBookedRanges() });
  }

  if (payload) {
    try {
      const data = JSON.parse(payload);
      if (data.action === 'enquiry') return handleEnquiry(data);
      if (data.action === 'confirm') return handleConfirm(data);
    } catch (err) {
      return jsonResponse({ success: false, error: err.message });
    }
  }

  return ContentService.createTextOutput('Glenhaven webhook is live.');
}

// doPost kept as fallback in case any caller uses POST
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.action === 'enquiry') return handleEnquiry(data);
    if (data.action === 'confirm') return handleConfirm(data);
    return jsonResponse({ success: false, error: 'Unknown action: ' + data.action });
  } catch (err) {
    return jsonResponse({ success: false, error: err.message });
  }
}

// ── 1. ENQUIRY — emails only, no sheet write ─────────────────

function handleEnquiry(data) {
  sendHostEnquiryEmail(data);
  sendGuestPaymentEmail(data);
  return jsonResponse({ success: true });
}

// ── 2. CONFIRM — write sheet row + confirmation emails ────────

function handleConfirm(data) {
  if (!data.checkIn || !data.checkOut) {
    return jsonResponse({ success: false, error: 'Missing checkIn or checkOut' });
  }

  const total          = parseFloat(data.amountPaid || data.total || 0);
  const managementAmt  = Math.round(total * CONFIG.MANAGEMENT_FEE_PCT * 100) / 100;
  const hostPayout     = total - managementAmt;

  appendBookingRow({
    checkIn    : data.checkIn,
    nights     : parseInt(data.nights) || 0,
    checkOut   : data.checkOut,
    guestName  : data.guestName  || '',
    numGuests  : parseInt(data.guests) || 1,
    hostPayout : hostPayout,
    cleaningFee: CONFIG.CLEANING_FEE,
    mgmtFee    : CONFIG.MANAGEMENT_FEE_PCT,
    platform   : 'Direct',
  });

  sendHostConfirmationEmail(data, total);
  sendGuestConfirmationEmail(data, total);

  return jsonResponse({ success: true });
}

// ── SHEET ─────────────────────────────────────────────────────

function getSheet() {
  return SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
}

function getBookedRanges() {
  const sheet   = getSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const rows   = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
  const ranges = [];

  for (const row of rows) {
    const ci = row[0], co = row[2];
    if (!ci || !co) continue;
    const dIn  = new Date(ci);
    const dOut = new Date(co);
    if (isNaN(dIn) || isNaN(dOut)) continue;
    ranges.push({
      start: dIn.toISOString().split('T')[0],
      end  : dOut.toISOString().split('T')[0],
    });
  }
  return ranges;
}

function appendBookingRow(b) {
  const sheet  = getSheet();
  const row    = sheet.getLastRow() + 1;

  sheet.getRange(row, COL.CHECK_IN,          1, 1).setValue(b.checkIn);
  sheet.getRange(row, COL.NIGHTS,            1, 1).setValue(b.nights);
  sheet.getRange(row, COL.CHECK_OUT,         1, 1).setValue(b.checkOut);
  sheet.getRange(row, COL.GUEST_NAME,        1, 1).setValue(b.guestName);
  sheet.getRange(row, COL.NUM_GUESTS,        1, 1).setValue(b.numGuests);
  sheet.getRange(row, COL.HOST_PAYOUT,       1, 1).setValue(b.hostPayout);
  sheet.getRange(row, COL.CLEANING_FEE,      1, 1).setValue(b.cleaningFee);
  sheet.getRange(row, COL.MANAGEMENT_FEE,    1, 1).setValue(b.mgmtFee);
  // I & J: ArrayFormulas fill these automatically
  sheet.getRange(row, COL.CLEANER_CONFIRMED, 1, 1).setValue('FALSE');
  sheet.getRange(row, COL.PLATFORM,          1, 1).setValue(b.platform);

  Logger.log('Booking confirmed: ' + b.guestName + ' · ' + b.checkIn + ' → ' + b.checkOut);
}

// ── EMAILS ───────────────────────────────────────────────────

function f(v)     { return v ? String(v) : '—'; }
function aud(v)   { return '$' + Number(v).toFixed(2); }

function sendHostEnquiryEmail(d) {
  GmailApp.sendEmail(
    CONFIG.HOST_EMAIL,
    '🔔 New Enquiry — ' + f(d.guestName) + ' (awaiting payment)',
    `A new direct booking enquiry has come in.\n` +
    `A Stripe payment link has been sent to the guest.\n` +
    `The booking will appear in Google Sheets once payment is completed.\n\n` +
    `GUEST DETAILS\n─────────────\n` +
    `Guest:     ${f(d.guestName)}\n` +
    `Email:     ${f(d.email)}\n` +
    `Phone:     ${f(d.phone)}\n` +
    `Guests:    ${f(d.guests)}\n` +
    `Check In:  ${f(d.checkIn)}\n` +
    `Check Out: ${f(d.checkOut)}\n` +
    `Nights:    ${f(d.nights)}\n` +
    `Total:     ${aud(d.total)} AUD\n\n` +
    `MESSAGE\n───────\n` + (d.message || 'No message provided.') + `\n\n` +
    `Payment link sent to guest:\n${f(d.paymentLink)}`
  );
}

function sendGuestPaymentEmail(d) {
  const firstName = (d.guestName || 'there').split(' ')[0];
  GmailApp.sendEmail(
    d.email,
    'Complete your Glenhaven booking — payment link inside',
    `Hi ${firstName},\n\n` +
    `Thanks for choosing to book Glenhaven directly!\n` +
    `To confirm your stay, please pay via the secure link below.\n\n` +
    `YOUR BOOKING\n────────────\n` +
    `Property:  Glenhaven — Katoomba Cottage\n` +
    `Check In:  ${f(d.checkIn)} (from 3:00 pm)\n` +
    `Check Out: ${f(d.checkOut)} (by 10:00 am)\n` +
    `Nights:    ${f(d.nights)}\n` +
    `Guests:    ${f(d.guests)}\n` +
    `Total:     ${aud(d.total)} AUD\n\n` +
    `SECURE PAYMENT LINK\n───────────────────\n` +
    `${f(d.paymentLink)}\n\n` +
    `⚠ Your dates are NOT confirmed until payment is received.\n` +
    `This link expires in 24 hours.\n\n` +
    `Once paid, you'll receive a full confirmation with check-in details.\n\n` +
    `Cheers,\nThe Glenhaven Team`
  );
}

function sendHostConfirmationEmail(d, total) {
  GmailApp.sendEmail(
    CONFIG.HOST_EMAIL,
    '✅ Booking Confirmed — ' + f(d.guestName),
    `Payment received! This booking is now confirmed and written to your Google Sheet.\n\n` +
    `CONFIRMED BOOKING\n─────────────────\n` +
    `Guest:       ${f(d.guestName)}\n` +
    `Email:       ${f(d.email)}\n` +
    `Phone:       ${f(d.phone)}\n` +
    `Guests:      ${f(d.guests)}\n` +
    `Check In:    ${f(d.checkIn)}\n` +
    `Check Out:   ${f(d.checkOut)}\n` +
    `Nights:      ${f(d.nights)}\n` +
    `Amount Paid: ${aud(total)} AUD\n` +
    `Stripe ID:   ${f(d.stripeSessionId)}`
  );
}

function sendGuestConfirmationEmail(d, total) {
  if (!d.email) return;
  const firstName = (d.guestName || 'there').split(' ')[0];
  GmailApp.sendEmail(
    d.email,
    '🏡 Booking Confirmed — Glenhaven, Katoomba',
    `Hi ${firstName},\n\n` +
    `Your payment has been received — your stay at Glenhaven is confirmed!\n\n` +
    `BOOKING CONFIRMATION\n────────────────────\n` +
    `Property:    Glenhaven — Katoomba Cottage\n` +
    `Check In:    ${f(d.checkIn)} (from 3:00 pm)\n` +
    `Check Out:   ${f(d.checkOut)} (by 10:00 am)\n` +
    `Nights:      ${f(d.nights)}\n` +
    `Guests:      ${f(d.guests)}\n` +
    `Amount Paid: ${aud(total)} AUD\n\n` +
    `CHECK-IN\n────────\n` +
    `Self check-in via smart lock.\n` +
    `Your unique door code arrives 24 hours before check-in.\n\n` +
    `We can't wait to welcome you!\n\n` +
    `Cheers,\nThe Glenhaven Team`
  );
}

// ── UTILITY ──────────────────────────────────────────────────

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
