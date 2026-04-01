/* ── pages/booking.js — booking.html entry module ── */

import { CONFIG } from '../config.js';
import { getParam, fmtShort, fmtAUD } from '../utils.js';
import { calcPrice, getMinNights } from '../pricing.js';
import { loadAvailability } from '../availability.js';
import { loadSiteConfig } from '../site-config.js';
import { MiniCal } from '../calendar.js';
import { initNavBurger, initScrollReveal, getUrgencyMsg, sendBooking, storePendingBooking } from '../ui.js';

// ── State ────────────────────────────────────────────────────
let bkCI = null, bkCO = null;
let adults = 2, children = 0, infants = 0;

// URL pre-fill
const urlCI = getParam('ci'), urlCO = getParam('co'), urlG = getParam('g');
if (urlCI) bkCI = urlCI;
if (urlCO) bkCO = urlCO;
if (urlG)  adults = Math.min(CONFIG.MAX_GUESTS, Math.max(1, parseInt(urlG) || 2));

// Guard: show banner if no dates
if (!bkCI || !bkCO) {
  const alert = document.getElementById('dateAlert');
  alert.textContent = 'No dates selected — please pick your check-in and check-out from the calendar below.';
  alert.classList.add('show');
}

// Calendar
const bkCal = new MiniCal('bkCalContainer', {
  onSelect({ checkIn, checkOut }) {
    bkCI = checkIn; bkCO = checkOut;
    if (bkCI && bkCO) document.getElementById('dateAlert').classList.remove('show');
    updateSidebar();
  }
});
if (bkCI && bkCO) { bkCal.setRange(bkCI, bkCO); updateSidebar(); }

function updateSidebar() {
  const total = adults + children;
  const p = calcPrice(bkCI, bkCO, total);
  const empty   = document.getElementById('sidebarEmpty');
  const content = document.getElementById('sidebarContent');
  if (!p) { empty.style.display = 'block'; content.style.display = 'none'; return; }

  empty.style.display = 'none'; content.style.display = 'block';
  document.getElementById('sdPrice').textContent = fmtAUD(p.avgNightly) + '/night avg';
  document.getElementById('sdDates').textContent = fmtShort(bkCI) + ' → ' + fmtShort(bkCO) + ' · ' + total + ' guest' + (total > 1 ? 's' : '');

  let html = `<div class="price-row"><span>${p.nights} nights × ${fmtAUD(p.avgNightly)}</span><span>${fmtAUD(p.nightlyTotal)}</span></div>`;
  if (p.extraGuests > 0) html += `<div class="price-row"><span>Extra guest fee (×${p.extraGuests})</span><span>included</span></div>`;
  if (p.discountAmt > 0) html += `<div class="price-row dep"><span>Stay discount (${Math.round(p.losDiscount * 100)}%)</span><span>−${fmtAUD(p.discountAmt)}</span></div>`;
  html += `<div class="price-row"><span>Cleaning fee</span><span>${fmtAUD(p.cleaningFee)}</span></div>`;
  html += `<div class="price-row tot"><span>Total AUD</span><span>${fmtAUD(p.total)}</span></div>`;
  document.getElementById('sdBK').innerHTML = html;
  document.getElementById('sdUrgency').innerHTML = `<div class="urgency-dot"></div><span>${getUrgencyMsg(bkCI, bkCO)}</span>`;

  document.getElementById('payFullAmt').textContent = fmtAUD(p.total);
}

// Guest counter
function updateGC() {
  document.getElementById('adNum').textContent = adults;
  document.getElementById('chNum').textContent = children;
  document.getElementById('inNum').textContent = infants;
  document.getElementById('adDn').disabled = adults <= 1;
  document.getElementById('adUp').disabled = (adults + children) >= CONFIG.MAX_GUESTS;
  document.getElementById('chDn').disabled = children <= 0;
  document.getElementById('chUp').disabled = (adults + children) >= CONFIG.MAX_GUESTS;
  document.getElementById('inDn').disabled = infants <= 0;
  document.getElementById('inUp').disabled = infants >= 4;
  updateSidebar();
}

// Expose to inline onclick handlers
window.adj = function (type, d) {
  if (type === 'adults')   adults   = Math.max(1, adults + d);
  if (type === 'children') children = Math.max(0, children + d);
  if (type === 'infants')  infants  = Math.max(0, infants + d);
  if (adults + children > CONFIG.MAX_GUESTS) { if (type === 'adults') adults -= d; else children -= d; }
  updateGC();
};
updateGC();

// Step nav
function setStep(n) {
  for (let i = 1; i <= 4; i++) {
    const el = document.getElementById('st' + i);
    el.classList.remove('on', 'done');
    if (i < n) el.classList.add('done');
    if (i === n) el.classList.add('on');
  }
  ['secDates', 'secGuests', 'secDetails', 'secPayment'].forEach((id, i) => {
    document.getElementById(id).style.display = (i + 1 === n) ? 'block' : 'none';
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

window.goStep1 = function () { setStep(1); };
window.goStep2 = async function () {
  if (!bkCI || !bkCO) {
    const a = document.getElementById('dateAlert');
    a.textContent = 'Please select your check-in and check-out dates.';
    a.classList.add('show');
    return;
  }
  await loadSiteConfig();
  const nights = Math.round((new Date(bkCO) - new Date(bkCI)) / 86400000);
  const minN   = getMinNights(bkCI);
  if (nights < minN) {
    const a = document.getElementById('dateAlert');
    a.textContent = `Minimum stay is ${minN} nights for these dates.`;
    a.classList.add('show');
    return;
  }
  document.getElementById('dateAlert').classList.remove('show');
  setStep(2);
};
window.goStep3 = function () { setStep(3); };
window.goStep4 = function () {
  const fn = document.getElementById('fName').value.trim();
  const ln = document.getElementById('lName').value.trim();
  const em = document.getElementById('fEmail').value.trim();
  const ph = document.getElementById('fPhone').value.trim();
  const a  = document.getElementById('detailsAlert');
  a.classList.remove('show');
  if (!fn || !ln || !em || !ph) { a.textContent = 'Please fill in all required fields (name, email, and phone).'; a.classList.add('show'); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { a.textContent = 'Please enter a valid email address.'; a.classList.add('show'); return; }
  setStep(4);
};

// Submit
window.submitBooking = async function () {
  const p = calcPrice(bkCI, bkCO, adults + children);
  if (!p) { alert('Please go back and select valid dates.'); return; }

  const btn = document.getElementById('payBtn');
  const txt = document.getElementById('payBtnText');
  btn.disabled = true;
  txt.textContent = 'Processing…';

  const payload = {
    checkIn    : bkCI,
    checkOut   : bkCO,
    nights     : p.nights,
    guestName  : document.getElementById('fName').value.trim() + ' ' + document.getElementById('lName').value.trim(),
    email      : document.getElementById('fEmail').value.trim(),
    phone      : document.getElementById('fPhone').value.trim(),
    guests     : adults + children,
    message    : document.getElementById('fNotes').value.trim(),
    total      : p.total,
    totalAmount: p.total,
    cleaningFee: p.cleaningFee,
  };

  try {
    const result = await sendBooking(payload);
    if (result.success && result.paymentLink) {
      storePendingBooking(payload, p.total);
      window.location.href = result.paymentLink;
    } else {
      throw new Error(result.error || 'Something went wrong. Please try again.');
    }
  } catch (err) {
    const a = document.getElementById('payAlert');
    a.textContent = err.message;
    a.classList.add('show');
    btn.disabled = false;
    txt.textContent = 'Confirm & Pay Securely';
  }
};

// ── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initNavBurger();
  initScrollReveal();
});

loadSiteConfig().then(() => {
  const note = document.getElementById('guestFeeNote');
  if (note) note.textContent = 'Maximum ' + CONFIG.MAX_GUESTS + " guests (infants don't count). $" + CONFIG.EXTRA_GUEST + '/night per guest beyond ' + CONFIG.BASE_GUESTS + '.';
});

loadAvailability().then(() => {
  if (bkCI && bkCO) bkCal.setRange(bkCI, bkCO);
  else bkCal.renderDays();
});
