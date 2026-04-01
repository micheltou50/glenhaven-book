/* ── pages/home.js — index.html entry module ── */

import { CONFIG } from '../config.js';
import { fmtShort, fmtAUD, getParam, todayISO } from '../utils.js';
import { calcPrice, getMinNights } from '../pricing.js';
import { loadAvailability } from '../availability.js';
import { loadSiteConfig } from '../site-config.js';
import { MiniCal } from '../calendar.js';
import { initNavBurger, initScrollReveal, initCarousel, initStrip, getUrgencyMsg } from '../ui.js';

// ── Shared state ─────────────────────────────────────────────
let sharedCI = null;
let sharedCO = null;
let mainCal     = null;
let heroCalInst = null;
let heroCalIsOpen = false;

// ── Hero floating panel ──────────────────────────────────────
function heroCalOpen() {
  const panel = document.getElementById('heroCal');
  const box   = document.getElementById('heroSearch').getBoundingClientRect();
  let topPos = box.bottom + 8;
  if (topPos < 8) topPos = 8;
  if (topPos + 500 > window.innerHeight) topPos = Math.max(8, box.top - 510);
  panel.style.top  = topPos + 'px';
  panel.style.left = Math.max(8, Math.min(box.left, window.innerWidth - 770)) + 'px';
  panel.classList.add('open');
  heroCalIsOpen = true;

  if (!heroCalInst) {
    heroCalInst = new MiniCal('heroCalMount', {
      onSelect({ checkIn, checkOut }) {
        sharedCI = checkIn  ? checkIn  : sharedCI;
        sharedCO = checkOut ? checkOut : null;
        if (checkIn && checkOut) { sharedCI = checkIn; sharedCO = checkOut; }
        if (mainCal) mainCal.setRange(sharedCI, sharedCO);
        onDateChange(checkIn, checkOut);
      }
    });
  }
  heroCalInst.setRange(sharedCI, sharedCO);
  updateHeroCalHint();
}

function heroCalClose() {
  document.getElementById('heroCal').classList.remove('open');
  heroCalIsOpen = false;
}

function updateHeroCalHint() {
  const hint    = document.getElementById('heroCalHint');
  const summary = document.getElementById('heroCalSummary');
  const pill    = document.getElementById('nightsPill');

  if (!sharedCI) {
    hint.textContent    = 'Select your check-in date';
    summary.textContent = '';
    pill.style.display  = 'none';
  } else if (!sharedCO) {
    hint.textContent    = 'Now select your check-out date';
    summary.textContent = fmtShort(sharedCI) + ' → ?';
    pill.style.display  = 'none';
  } else {
    const n = Math.round((new Date(sharedCO) - new Date(sharedCI)) / 864e5);
    hint.textContent    = n + ' night' + (n !== 1 ? 's' : '') + ' selected';
    summary.textContent = fmtShort(sharedCI) + ' → ' + fmtShort(sharedCO);
    pill.textContent    = n + ' night' + (n !== 1 ? 's' : '');
    pill.style.display  = 'inline-block';
  }
}

// ── Called every time either date changes ─────────────────────
function onDateChange(checkIn, checkOut) {
  sharedCI = checkIn  || sharedCI;
  sharedCO = checkOut || null;

  if (checkIn && checkOut) {
    sharedCI = checkIn;
    sharedCO = checkOut;
  }

  const txtCI = document.getElementById('txtCI');
  const txtCO = document.getElementById('txtCO');
  txtCI.textContent = sharedCI ? fmtShort(sharedCI) : 'Add date';
  txtCI.className   = 's-display-txt' + (sharedCI ? ' set' : '');
  txtCO.textContent = sharedCO ? fmtShort(sharedCO) : 'Add date';
  txtCO.className   = 's-display-txt' + (sharedCO ? ' set' : '');

  const sciEl = document.getElementById('s-ci');
  const scoEl = document.getElementById('s-co');
  if (sharedCI) sciEl.value = sharedCI;
  if (sharedCO) {
    scoEl.value = sharedCO;
  } else {
    scoEl.value = '';
    if (sharedCI) {
      const nx = new Date(sharedCI); nx.setDate(nx.getDate() + 1);
      scoEl.min = nx.toISOString().split('T')[0];
    }
  }

  updateHeroCalHint();
  updateStickyCard();

  if (sharedCI && sharedCO && heroCalIsOpen) {
    setTimeout(heroCalClose, 500);
  }
}

// ── Sticky card pricing ──────────────────────────────────────
function updateStickyCard() {
  const ci = document.getElementById('s-ci').value || sharedCI;
  const co = document.getElementById('s-co').value || sharedCO;
  const g  = document.getElementById('s-g').value;

  if (ci && co && co <= ci) {
    document.getElementById('s-co').value = '';
    sharedCO = null;
    return updateStickyCard(); // re-run without the bad co
  }

  const p   = calcPrice(ci, co, g);
  const bk  = document.getElementById('stickyBreakdown');
  const btn = document.getElementById('stickyBtn');

  document.getElementById('stickyUrgency').querySelector('span').textContent = getUrgencyMsg(ci, co);

  if (p) {
    let h = '<div class="price-row"><span>' + p.nights + ' nights × ' + fmtAUD(p.avgNightly) + '</span><span>' + fmtAUD(p.nightlyTotal) + '</span></div>';
    if (p.discountAmt > 0) h += '<div class="price-row" style="color:var(--green-d)"><span>Discount (' + Math.round(p.losDiscount * 100) + '%)</span><span>−' + fmtAUD(p.discountAmt) + '</span></div>';
    h += '<div class="price-row"><span>Cleaning fee</span><span>' + fmtAUD(p.cleaningFee) + '</span></div>';
    h += '<div class="price-row tot"><span>Total AUD</span><span>' + fmtAUD(p.total) + '</span></div>';
    document.getElementById('stickyBK').innerHTML = h;
    bk.style.display = 'block';
    btn.href = 'booking.html?ci=' + ci + '&co=' + co + '&g=' + g;
  } else {
    bk.style.display = 'none';
    if (ci && co) {
      btn.href = 'booking.html?ci=' + ci + '&co=' + co + '&g=' + g;
    } else {
      btn.href = 'booking.html';
    }
  }

  const mbb = document.getElementById('mobBookBtn');
  if (mbb) {
    if (ci && co) {
      mbb.href = 'booking.html?ci=' + ci + '&co=' + co + '&g=' + g;
      mbb.textContent = 'Reserve';
    } else {
      mbb.href = 'booking.html';
      mbb.textContent = 'Check Availability';
    }
  }

  if (mainCal)     mainCal.setRange(ci || sharedCI, co || sharedCO);
  if (heroCalInst) heroCalInst.setRange(ci || sharedCI, co || sharedCO);
}

// ── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initNavBurger();
  initScrollReveal();
});

// Sticky card input listeners
document.getElementById('s-ci').addEventListener('change', function () {
  const ci = this.value;
  if (ci) {
    sharedCI = ci;
    sharedCO = null;
    document.getElementById('s-co').value = '';
    const nx = new Date(ci); nx.setDate(nx.getDate() + 1);
    document.getElementById('s-co').min = nx.toISOString().split('T')[0];
    if (mainCal) { mainCal.ci = ci; mainCal.co = null; mainCal.renderDays(); }
    onDateChange(ci, null);
  }
  updateStickyCard();
});

document.getElementById('s-co').addEventListener('change', function () {
  const co = this.value;
  if (co) {
    sharedCO = co;
    if (mainCal) { mainCal.co = co; mainCal.renderDays(); }
    onDateChange(sharedCI, co);
  }
  updateStickyCard();
});

document.getElementById('s-g').addEventListener('change', updateStickyCard);

// Hero panel buttons
document.getElementById('dispCI').addEventListener('click', (e) => { e.stopPropagation(); heroCalOpen(); });
document.getElementById('dispCO').addEventListener('click', (e) => { e.stopPropagation(); heroCalOpen(); });
document.getElementById('heroCalClose').addEventListener('click', heroCalClose);
document.getElementById('heroCalClear').addEventListener('click', () => {
  sharedCI = null; sharedCO = null;
  if (mainCal)     { mainCal.ci = null;     mainCal.co = null;     mainCal.renderDays(); }
  if (heroCalInst) { heroCalInst.ci = null; heroCalInst.co = null; heroCalInst.renderDays(); }
  onDateChange(null, null);
});
document.getElementById('heroCalDone').addEventListener('click', heroCalClose);
document.getElementById('btnCheck').addEventListener('click', () => {
  if (!sharedCI || !sharedCO) { heroCalOpen(); return; }
  const nights = Math.round((new Date(sharedCO) - new Date(sharedCI)) / 86400000);
  const minN   = getMinNights(sharedCI);
  if (nights < minN) {
    alert('Minimum stay is ' + minN + ' nights for these dates.');
    return;
  }
  const g = document.getElementById('hg').value;
  window.location.href = 'booking.html?ci=' + sharedCI + '&co=' + sharedCO + '&g=' + g;
});
document.getElementById('hg').addEventListener('change', updateStickyCard);

// Close floating panel on outside click
document.addEventListener('click', (e) => {
  const panel  = document.getElementById('heroCal');
  const search = document.getElementById('heroSearch');
  const path = e.composedPath ? e.composedPath() : [];
  const inside = path.includes(panel) || path.includes(search);
  if (heroCalIsOpen && !inside) heroCalClose();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && heroCalIsOpen) heroCalClose(); });

// Set date minimums
document.getElementById('s-ci').min = todayISO();
document.getElementById('s-co').min = todayISO();

// Load config then update displays
loadSiteConfig().then(() => {
  const fp = document.getElementById('stickyFromPrice');
  if (fp) fp.textContent = CONFIG.BASE_RATE;
  const mfp = document.getElementById('mobFromPrice');
  if (mfp) mfp.textContent = CONFIG.BASE_RATE;

  ['hg', 's-g'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = '';
    for (let i = 1; i <= CONFIG.MAX_GUESTS; i++) {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = i + (i === 1 ? ' guest' : ' guests');
      if (i == cur) opt.selected = true;
      sel.appendChild(opt);
    }
  });

  if (mainCal)     mainCal.renderDays();
  if (heroCalInst) heroCalInst.renderDays();
  updateStickyCard();
});

// Load availability then init calendar
loadAvailability().then(() => {
  mainCal = new MiniCal('homeCalContainer', {
    onSelect({ checkIn, checkOut }) {
      sharedCI = checkIn  ? checkIn  : sharedCI;
      sharedCO = checkOut ? checkOut : null;
      if (checkIn && checkOut) { sharedCI = checkIn; sharedCO = checkOut; }
      if (heroCalInst) heroCalInst.setRange(sharedCI, sharedCO);
      onDateChange(checkIn, checkOut);
    }
  });

  // Pre-fill from URL params
  const pci = getParam('ci'), pco = getParam('co'), pg = getParam('g');
  if (pci) { sharedCI = pci; mainCal.ci = pci; mainCal.renderDays(); document.getElementById('s-ci').value = pci; }
  if (pco) { sharedCO = pco; mainCal.co = pco; mainCal.renderDays(); document.getElementById('s-co').value = pco; }
  if (pg)  { document.getElementById('s-g').value = pg; document.getElementById('hg').value = pg; }
  if (pci || pco) updateStickyCard();
});
