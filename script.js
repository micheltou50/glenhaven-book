/* ============================================================
   GLENHAVEN — script.js  v2
   Full pricing engine + calendar + booking storage
   ============================================================ */

'use strict';

// ── CONFIG ────────────────────────────────────────────────────
const CONFIG = {
  WEBHOOK_URL    : '/api/book',
  AVAIL_URL      : '/api/availability',
  CONFIG_URL     : '/api/config',
  BASE_RATE      : 320,
  BASE_GUESTS    : 2,
  EXTRA_GUEST    : 40,
  CLEANING_FEE   : 150,
  MAX_GUESTS     : 8,
  FRI_SURCHARGE  : 60,
  SAT_SURCHARGE  : 80,
  PEAK_PCT       : 25,   // +25% in peak season
  LOW_PCT        : -10,  // -10% in low season
  MIN_NIGHTS     : { weekday: 2, weekend: 3, peak: 4 },
};

// ── PRICING RULES ─────────────────────────────────────────────
let HOLIDAY_PRICES = {
  '12-25': 550,
  '12-26': 550,
  '01-01': 650,
  '12-31': 650,
  '04-18': 480,
  '04-20': 480,
};

// ── SITE CONFIG (loaded from server) ──────────────────────────
// Default values — overwritten by loadSiteConfig() on page load
let SITE_CONFIG = null;

const CONFIG_CACHE_KEY = 'gh_site_config';

// Apply cached config synchronously right now — before any async calls.
// This means the calendar always renders with the correct prices on the very
// first paint, with zero waiting. The async fetch later just refreshes it.
(function applyConfigFromCache() {
  try {
    const raw = localStorage.getItem(CONFIG_CACHE_KEY);
    if (!raw) return;
    const cached = JSON.parse(raw);
    if (cached && cached.config) applySiteConfig(cached.config);
  } catch(e) {}
})();
const CONFIG_CACHE_TTL  = 60 * 60 * 1000; // 1 hour

async function loadSiteConfig() {
  // 1. Paint instantly from cache (makes page feel immediate on repeat visits)
  try {
    const cached = JSON.parse(localStorage.getItem(CONFIG_CACHE_KEY) || 'null');
    if (cached && cached.ts && (Date.now() - cached.ts) < CONFIG_CACHE_TTL && cached.config) {
      SITE_CONFIG = cached.config;
      applySiteConfig(cached.config);
      // Still refresh in background but don't await it
      _fetchSiteConfig();
      return { loaded: true, status: 'ok', fromCache: true };
    }
  } catch(e) {}

  // 2. No valid cache — fetch fresh (first visit or expired)
  return _fetchSiteConfig();
}

async function _fetchSiteConfig() {
  try {
    const res  = await fetch(CONFIG.CONFIG_URL);
    let envelope;
    try { envelope = await res.json(); }
    catch (parseErr) {
      console.error('[loadSiteConfig] Invalid JSON');
      return { loaded: false, status: 'error', error: 'Invalid JSON' };
    }

    const status = envelope.status || (envelope.config ? 'ok' : 'empty');

    if (status === 'error' || (!res.ok && !envelope.config)) {
      console.error('[loadSiteConfig] Server error:', envelope.error || res.status);
      return { loaded: false, status: 'error', error: envelope.error };
    }

    if (status === 'empty' || !envelope.config) {
      console.info('[loadSiteConfig] No saved config yet');
      return { loaded: false, status: 'empty' };
    }

    // Save to cache with timestamp
    try { localStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify({ config: envelope.config, ts: Date.now() })); } catch(e) {}

    SITE_CONFIG = envelope.config;
    applySiteConfig(envelope.config);
    return { loaded: true, status: 'ok' };

  } catch (err) {
    console.warn('[loadSiteConfig] Network error:', err.message);
    return { loaded: false, status: 'error', error: err.message };
  }
}

function applySiteConfig(cfg) {
  if (!cfg) return;

  // ── Pricing ──
  if (cfg.pricing) {
    if (cfg.pricing.baseRate     != null) CONFIG.BASE_RATE     = cfg.pricing.baseRate;
    if (cfg.pricing.baseGuests   != null) CONFIG.BASE_GUESTS   = cfg.pricing.baseGuests;
    if (cfg.pricing.extraGuest   != null) CONFIG.EXTRA_GUEST   = cfg.pricing.extraGuest;
    if (cfg.pricing.cleaningFee  != null) CONFIG.CLEANING_FEE  = cfg.pricing.cleaningFee;
    if (cfg.pricing.maxGuests    != null) CONFIG.MAX_GUESTS    = cfg.pricing.maxGuests;
    if (cfg.pricing.friSurcharge != null) CONFIG.FRI_SURCHARGE = cfg.pricing.friSurcharge;
    if (cfg.pricing.satSurcharge != null) CONFIG.SAT_SURCHARGE = cfg.pricing.satSurcharge;
    if (cfg.pricing.peakPct      != null) CONFIG.PEAK_PCT      = cfg.pricing.peakPct;
    if (cfg.pricing.lowPct       != null) CONFIG.LOW_PCT       = cfg.pricing.lowPct;
    if (cfg.pricing.minNights)            CONFIG.MIN_NIGHTS    = { ...CONFIG.MIN_NIGHTS, ...cfg.pricing.minNights };
    if (cfg.pricing.holidayPrices)        HOLIDAY_PRICES       = { ...HOLIDAY_PRICES, ...cfg.pricing.holidayPrices };
  }

  // ── Colors — inject CSS variables ──
  if (cfg.colors) {
    const root = document.documentElement;
    const c    = cfg.colors;
    if (c.primary) {
      root.style.setProperty('--green',   c.primary);
      root.style.setProperty('--green-d', shadeColor(c.primary, -20));
      root.style.setProperty('--green-l', shadeColor(c.primary, 20));
      root.style.setProperty('--green-p', hexToRgba(c.primary, 0.1));
    }
    if (c.accent)  root.style.setProperty('--warm', c.accent);
  }

  // ── Text content ──
  if (cfg.property) {
    setEl('sitePropertyName', cfg.property.name);
    setEl('siteTagline',      cfg.property.tagline);
    setEl('siteDescription',  cfg.property.description);
    setEl('siteBeds',         cfg.property.bedrooms  != null ? cfg.property.bedrooms  : null);
    setEl('siteBaths',        cfg.property.bathrooms != null ? cfg.property.bathrooms : null);
    setEl('siteMaxGuests',    cfg.property.guests    != null ? cfg.property.guests    : null);
    if (cfg.property.guests != null) CONFIG.MAX_GUESTS = cfg.property.guests;
  }
  if (cfg.hero) {
    setEl('siteHeroHeadline', cfg.hero.headline);
    setEl('siteHeroSub',      cfg.hero.subheadline);
  }

  // ── From price display ──
  if (cfg.pricing && cfg.pricing.baseRate != null) {
    const fp = document.getElementById('stickyFromPrice');
    if (fp) fp.textContent = cfg.pricing.baseRate;
  }

  // ── Guest fee note (booking.html) ──
  const note = document.getElementById('guestFeeNote');
  if (note) {
    const max  = cfg.pricing && cfg.pricing.maxGuests  != null ? cfg.pricing.maxGuests  : CONFIG.MAX_GUESTS;
    const fee  = cfg.pricing && cfg.pricing.extraGuest != null ? cfg.pricing.extraGuest : CONFIG.EXTRA_GUEST;
    const base = cfg.pricing && cfg.pricing.baseGuests != null ? cfg.pricing.baseGuests : CONFIG.BASE_GUESTS;
    note.textContent = "Maximum " + max + " guests (infants don't count). $" + fee + "/night per guest beyond " + base + ".";
  }

  // ── Booking page header (bedrooms + max guests) ──
  if (cfg.property) {
    const bkBed = document.getElementById('bkBedrooms');
    const bkMx  = document.getElementById('bkMaxGuests');
    if (bkBed && cfg.property.bedrooms  != null) bkBed.textContent = cfg.property.bedrooms;
    if (bkMx  && cfg.property.guests    != null) bkMx.textContent  = cfg.property.guests;
  }

  // ── Browser tab title ──
  if (cfg.property && cfg.property.name) {
    if (!document.title.startsWith(cfg.property.name)) document.title = cfg.property.name + ' — ' + document.title.split('—').slice(1).join('—').trim();
  }

  // ── Nav logo ──
  if (cfg.property && cfg.property.name) {
    document.querySelectorAll('.nav-logo').forEach(el => {
      el.innerHTML = cfg.property.name;
    });
  }

  // ── Photos ──
  if (cfg.photos && cfg.photos.length) {
    document.querySelectorAll('[data-site-photo]').forEach(el => {
      const idx = parseInt(el.dataset.sitePhoto) || 0;
      if (cfg.photos[idx]) el.src = cfg.photos[idx];
    });
  }
}

// Set element text content if element exists and value is non-null
function setEl(id, val) {
  if (val == null) return;
  const el = document.getElementById(id);
  if (el) el.textContent = String(val);
}

// Lighten/darken a hex color by amount (-100 to 100)
function shadeColor(hex, amount) {
  const n = parseInt(hex.replace('#',''), 16);
  const r = Math.min(255, Math.max(0, (n >> 16) + amount));
  const g = Math.min(255, Math.max(0, ((n >> 8) & 0xff) + amount));
  const b = Math.min(255, Math.max(0, (n & 0xff) + amount));
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2,'0')).join('');
}

function hexToRgba(hex, alpha) {
  const n = parseInt(hex.replace('#',''), 16);
  return `rgba(${n >> 16},${(n >> 8) & 0xff},${n & 0xff},${alpha})`;
}

function getPeakSeason(date) {
  const m = date.getMonth() + 1;
  if (m === 12 || m === 1) return 'peak';
  if (m >= 5 && m <= 8)   return 'low';
  return 'standard';
}

function getDayType(date) {
  const d = date.getDay(); // 0=Sun 1=Mon … 6=Sat
  return (d === 5 || d === 6) ? 'weekend' : 'weekday';
}

function getNightlyRate(date, extraGuests = 0) {
  const key = String(date.getMonth()+1).padStart(2,'0') + '-' + String(date.getDate()).padStart(2,'0');
  if (HOLIDAY_PRICES[key]) return HOLIDAY_PRICES[key] + extraGuests * CONFIG.EXTRA_GUEST;

  let base = CONFIG.BASE_RATE;

  // Weekend surcharge — uses dynamic CONFIG values (set from admin panel)
  const day = date.getDay();
  if (day === 5) base += (CONFIG.FRI_SURCHARGE != null ? CONFIG.FRI_SURCHARGE : 60); // Friday
  if (day === 6) base += (CONFIG.SAT_SURCHARGE != null ? CONFIG.SAT_SURCHARGE : 80); // Saturday

  // Seasonal modifier — uses dynamic CONFIG values
  const season = getPeakSeason(date);
  const peakMult = 1 + (CONFIG.PEAK_PCT != null ? CONFIG.PEAK_PCT : 25) / 100;
  const lowMult  = 1 + (CONFIG.LOW_PCT  != null ? CONFIG.LOW_PCT  : -10) / 100;
  if (season === 'peak') base *= peakMult;
  if (season === 'low')  base *= lowMult;

  return Math.round(base) + extraGuests * CONFIG.EXTRA_GUEST;
}

function getMinNights(checkIn) {
  const date = new Date(checkIn);
  if (getPeakSeason(date) === 'peak') return CONFIG.MIN_NIGHTS.peak;
  if (getDayType(date) === 'weekend') return CONFIG.MIN_NIGHTS.weekend;
  return CONFIG.MIN_NIGHTS.weekday;
}

function getLOSDiscount(nights) {
  if (nights >= 7) return .15;
  if (nights >= 5) return .10;
  if (nights >= 3) return .05;
  return 0;
}

function calcPrice(checkIn, checkOut, guests) {
  if (!checkIn || !checkOut) return null;
  const start = new Date(checkIn);
  const end   = new Date(checkOut);
  const nights = Math.round((end - start) / 86400000);
  if (nights < 1) return null;

  const extraGuests = Math.max(0, (parseInt(guests) || 1) - CONFIG.BASE_GUESTS);
  let nightlyTotal = 0;
  const nightlyRates = [];

  for (let i = 0; i < nights; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const rate = getNightlyRate(d, extraGuests);
    nightlyTotal += rate;
    nightlyRates.push(rate);
  }

  const losDiscount = getLOSDiscount(nights);
  const discountAmt = Math.round(nightlyTotal * losDiscount);
  const subtotal    = nightlyTotal - discountAmt;
  const total       = subtotal + CONFIG.CLEANING_FEE;
  const avgNightly  = Math.round(nightlyTotal / nights);

  return {
    nights,
    nightlyTotal,
    discountAmt,
    losDiscount,
    subtotal,
    cleaningFee: CONFIG.CLEANING_FEE,
    total,
    avgNightly,
    extraGuests,
    nightlyRates,
  };
}

// ── DATE HELPERS ──────────────────────────────────────────────
function toISO(date) {
  if (!date) return '';
  const d = new Date(date);
  return d.toISOString().split('T')[0];
}
function todayISO() { return toISO(new Date()); }
function fmtDate(str, opts) {
  if (!str) return '';
  const d = new Date(str);
  return d.toLocaleDateString('en-AU', opts || { day:'numeric', month:'short', year:'numeric' });
}
function fmtShort(str) { return fmtDate(str, { day:'numeric', month:'short' }); }
function fmtAUD(n) { return '$' + Number(n).toLocaleString('en-AU', { minimumFractionDigits:0, maximumFractionDigits:0 }); }
function getParam(k) { return new URLSearchParams(window.location.search).get(k); }

// ── BOOKING STORE ─────────────────────────────────────────────
// Uses localStorage as a render cache for fast initial paint.
// On every page load, server is fetched and cache is overwritten —
// so stale data never persists beyond one page load.

let _blockedRanges = [];

function rebuildBlockedRanges() {
  _blockedRanges = JSON.parse(localStorage.getItem('gh_blocked') || '[]');
}

function getBookings() { return JSON.parse(localStorage.getItem('gh_bookings') || '[]'); }
function getBlocks()   { return JSON.parse(localStorage.getItem('gh_blocks')   || '[]'); }
function saveBooking(b) { const a = getBookings(); a.push(b); localStorage.setItem('gh_bookings', JSON.stringify(a)); rebuildBlockedRanges(); }
function deleteBooking(id) { localStorage.setItem('gh_bookings', JSON.stringify(getBookings().filter(b => b.id !== id))); rebuildBlockedRanges(); }
function saveBlock(b) { const a = getBlocks(); a.push(b); localStorage.setItem('gh_blocks', JSON.stringify(a)); rebuildBlockedRanges(); }
function deleteBlock(id) { localStorage.setItem('gh_blocks', JSON.stringify(getBlocks().filter(b => b.id !== id))); rebuildBlockedRanges(); }

function isDateBlocked(iso) {
  const d = new Date(iso); d.setHours(0,0,0,0);
  return _blockedRanges.some(r => {
    const s = new Date(r.start); s.setHours(0,0,0,0);
    const e = new Date(r.end);   e.setHours(0,0,0,0);
    return d >= s && d < e;
  });
}
function isRangeBlocked(ci, co) {
  const a = new Date(ci), b = new Date(co);
  return _blockedRanges.some(r => {
    const s = new Date(r.start), e = new Date(r.end);
    return a < e && b > s;
  });
}

// ── MINI CALENDAR ─────────────────────────────────────────────
class MiniCal {
  constructor(containerId, opts = {}) {
    this.el        = document.getElementById(containerId);
    this.onSelect  = opts.onSelect || (() => {});
    this.showPrice = opts.showPrice !== false;
    this.adminMode = opts.adminMode || false;
    this.ci  = null; this.co  = null; this.hov = null;
    this.cur = new Date(); this.cur.setDate(1);
    this.render();
  }

  render() {
    if (!this.el) return;
    const dow = ['Su','Mo','Tu','We','Th','Fr','Sa'].map(d=>`<span>${d}</span>`).join('');
    this.el.innerHTML = `
      <div class="cal-widget cal-two-months">
        <div class="cal-month-wrap">
          <div class="cal-month">
            <div class="cal-nav">
              <button class="cal-nb" id="${this.el.id}-prev">&#8249;</button>
              <div class="cal-title" id="${this.el.id}-title0"></div>
              <button class="cal-nb" style="visibility:hidden;">&#8250;</button>
            </div>
            <div class="cal-dow">${dow}</div>
            <div class="cal-grid" id="${this.el.id}-grid0"></div>
          </div>
          <div class="cal-month">
            <div class="cal-nav">
              <button class="cal-nb" style="visibility:hidden;">&#8249;</button>
              <div class="cal-title" id="${this.el.id}-title1"></div>
              <button class="cal-nb" id="${this.el.id}-next">&#8250;</button>
            </div>
            <div class="cal-dow">${dow}</div>
            <div class="cal-grid" id="${this.el.id}-grid1"></div>
          </div>
        </div>
      </div>`;
    this.el.querySelector(`#${this.el.id}-prev`).onclick = () => { this.cur.setMonth(this.cur.getMonth()-1); this.renderDays(); };
    this.el.querySelector(`#${this.el.id}-next`).onclick = () => { this.cur.setMonth(this.cur.getMonth()+1); this.renderDays(); };
    this.renderDays();
  }

  // ── buildMonthHTML: pure HTML string, no listeners ──────────
  buildMonthHTML(monthDate) {
    const y = monthDate.getFullYear(), m = monthDate.getMonth();
    const today = new Date(); today.setHours(0,0,0,0);
    const first = new Date(y, m, 1).getDay();
    const days  = new Date(y, m+1, 0).getDate();
    let html = '';
    for (let i = 0; i < first; i++) html += '<div class="cal-day empty"></div>';
    for (let d = 1; d <= days; d++) {
      const dt        = new Date(y, m, d);
      const iso       = toISO(dt);
      const isPast    = dt < today;
      const isBlocked = isDateBlocked(iso);
      const isStart   = this.ci === iso;
      const isEnd     = this.co === iso;
      const inRange   = this.ci && this.co && iso > this.ci && iso < this.co;
      const inHover   = this.ci && !this.co && this.hov && iso > this.ci && iso <= this.hov;
      const isBeforeCI = this.ci && !this.co && iso < this.ci;
      let cls = 'cal-day';
      if (isPast || isBeforeCI) cls += ' past';
      else if (isBlocked)       cls += ' blocked';
      else                      cls += ' avail';
      if (isStart) cls += ' sel-s';
      if (isEnd)   cls += ' sel-e';
      if (inRange) cls += ' in-r';
      if (inHover) cls += ' in-h';
      let priceHtml = '';
      if (this.showPrice && !isPast && !isBlocked) {
        const rate = getNightlyRate(dt, 0);
        priceHtml = `<div class="cal-day-p">$${rate}</div>`;
      }
      html += `<div class="${cls}" data-iso="${iso}">${d}${priceHtml}</div>`;
    }
    return html;
  }

  // ── updateClasses: hover/selection update WITHOUT rebuilding DOM ──
  // Only updates className on existing cells — click listeners survive.
  updateClasses(gridId) {
    const grid = this.el.querySelector(`#${gridId}`);
    if (!grid) return;
    grid.querySelectorAll('.cal-day[data-iso]').forEach(el => {
      const iso       = el.dataset.iso;
      const isPast    = iso < toISO(new Date());
      const isBlocked = isDateBlocked(iso);
      const isStart   = this.ci === iso;
      const isEnd     = this.co === iso;
      const inRange   = this.ci && this.co && iso > this.ci && iso < this.co;
      const inHover   = this.ci && !this.co && this.hov && iso > this.ci && iso <= this.hov;
      const isBeforeCI = this.ci && !this.co && iso < this.ci;
      let cls = 'cal-day';
      if (isPast || isBeforeCI) cls += ' past';
      else if (isBlocked)       cls += ' blocked';
      else                      cls += ' avail';
      if (isStart) cls += ' sel-s';
      if (isEnd)   cls += ' sel-e';
      if (inRange) cls += ' in-r';
      if (inHover) cls += ' in-h';
      el.className = cls;
    });
  }

  // ── renderMonth: builds HTML + attaches DELEGATED listeners once ──
  renderMonth(monthDate, gridId, titleId) {
    const title = this.el.querySelector(`#${titleId}`);
    const grid  = this.el.querySelector(`#${gridId}`);
    title.textContent = monthDate.toLocaleString('default', { month:'long', year:'numeric' });

    // Rebuild HTML (full render — only called on month change or init)
    grid.innerHTML = this.buildMonthHTML(monthDate);

    // ── Event delegation on grid — survives any future innerHTML changes ──
    // Remove old delegated listeners by replacing with a clone
    const freshGrid = grid.cloneNode(true);
    grid.parentNode.replaceChild(freshGrid, grid);

    // Click delegation — one listener on the container, never on cells
    freshGrid.addEventListener('click', (e) => {
      const day = e.target.closest('.cal-day.avail');
      if (!day) return;
      this.selectDay(day.dataset.iso);
    });

    // Hover delegation — updates classes only, no innerHTML rebuild
    freshGrid.addEventListener('mouseover', (e) => {
      const day = e.target.closest('.cal-day.avail');
      if (!day) return;
      if (this.hov === day.dataset.iso) return; // no change
      this.hov = day.dataset.iso;
      this.updateClasses(`${this.el.id}-grid0`);
      this.updateClasses(`${this.el.id}-grid1`);
    });

    freshGrid.addEventListener('mouseleave', () => {
      if (this.hov === null) return; // no change
      this.hov = null;
      this.updateClasses(`${this.el.id}-grid0`);
      this.updateClasses(`${this.el.id}-grid1`);
    });
  }

  // ── renderDays: full rebuild of both months (init + month nav only) ──
  renderDays() {
    const m0 = new Date(this.cur.getFullYear(), this.cur.getMonth(), 1);
    const m1 = new Date(this.cur.getFullYear(), this.cur.getMonth()+1, 1);
    this.renderMonth(m0, `${this.el.id}-grid0`, `${this.el.id}-title0`);
    this.renderMonth(m1, `${this.el.id}-grid1`, `${this.el.id}-title1`);
  }

  // ── refreshClasses: update selection/hover classes without rebuilding ──
  // Called after selectDay so clicks don't rebuild innerHTML
  refreshClasses() {
    this.updateClasses(`${this.el.id}-grid0`);
    this.updateClasses(`${this.el.id}-grid1`);
  }

  selectDay(iso) {
    const today = new Date(); today.setHours(0,0,0,0);
    const dt    = new Date(iso + 'T00:00:00');

    // Guard 1: never allow past dates
    if (dt < today) return;

    // Guard 2: during checkout selection, block same day or before check-in
    if (this.ci && !this.co && iso <= this.ci) return;

    if (!this.ci || (this.ci && this.co)) {
      this.ci = iso; this.co = null;
      this.onSelect({ checkIn: this.ci, checkOut: null });
    } else {
      if (isRangeBlocked(this.ci, iso)) {
        alert('Some dates in that range are unavailable. Please choose a shorter stay or different dates.');
        return;
      }
      this.co = iso;
      this.onSelect({ checkIn: this.ci, checkOut: this.co });
    }
    // Use refreshClasses instead of renderDays — updates visuals without
    // rebuilding innerHTML, so delegated click listeners are never destroyed
    this.refreshClasses();
  }

  setRange(ci, co) {
    this.ci = ci; this.co = co;
    // Navigate calendar to the check-in month so it opens on the right dates
    if (ci) { this.cur = new Date(ci + 'T00:00:00'); this.cur.setDate(1); this.renderDays(); }
    else { this.refreshClasses(); }
  }
  reset()          { this.ci = null; this.co = null; this.renderDays(); }
}

// ── NAVBAR MOBILE ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const burger = document.querySelector('.nav-burger');
  const links  = document.querySelector('.nav-links');
  if (burger && links) burger.addEventListener('click', () => links.classList.toggle('open'));

  // Scroll reveal
  const revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(entries => entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    }), { threshold: 0, rootMargin: '0px 0px -50px 0px' });
    revealEls.forEach(el => io.observe(el));
    // Fallback: force all visible after 1.5s in case observer doesn't fire
    setTimeout(() => revealEls.forEach(el => el.classList.add('in')), 1500);
  } else {
    // No IntersectionObserver support — just show everything
    revealEls.forEach(el => el.classList.add('in'));
  }
});

// ── SEND BOOKING TO NETLIFY FUNCTION ─────────────────────────
async function sendBooking(payload) {
  const res = await fetch(CONFIG.WEBHOOK_URL, {
    method  : 'POST',
    headers : { 'Content-Type': 'application/json' },
    body    : JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Server error ' + res.status }));
    throw new Error(err.error || 'Booking failed');
  }
  return res.json();
}

// ── REVIEW CAROUSEL ───────────────────────────────────────────
function initCarousel(trackId, dotContainerId, arrowPrev, arrowNext) {
  const track  = document.getElementById(trackId);
  const dotBox = document.getElementById(dotContainerId);
  if (!track) return;
  const slides = track.querySelectorAll('.review-slide');
  let cur = 0;

  function go(i) {
    cur = (i + slides.length) % slides.length;
    track.style.transform = `translateX(-${cur * 100}%)`;
    dotBox && dotBox.querySelectorAll('.car-dot').forEach((d, idx) => d.classList.toggle('on', idx === cur));
  }

  slides.forEach((_, i) => {
    const dot = document.createElement('div');
    dot.className = 'car-dot' + (i === 0 ? ' on' : '');
    dot.onclick = () => go(i);
    dotBox && dotBox.appendChild(dot);
  });

  const prev = document.getElementById(arrowPrev);
  const next = document.getElementById(arrowNext);
  if (prev) prev.onclick = () => go(cur - 1);
  if (next) next.onclick = () => go(cur + 1);

  // Auto-advance
  setInterval(() => go(cur + 1), 6000);
}

// ── PHOTO STRIP DRAG ─────────────────────────────────────────
function initStrip(id) {
  const el = document.getElementById(id);
  if (!el) return;
  let isDown = false, startX, scrollLeft;
  el.addEventListener('mousedown', e => { isDown = true; startX = e.pageX - el.offsetLeft; scrollLeft = el.scrollLeft; });
  el.addEventListener('mouseleave', () => isDown = false);
  el.addEventListener('mouseup', () => isDown = false);
  el.addEventListener('mousemove', e => { if (!isDown) return; e.preventDefault(); const x = e.pageX - el.offsetLeft; el.scrollLeft = scrollLeft - (x - startX); });
}

// ── URGENCY MESSAGES ─────────────────────────────────────────
function getUrgencyMsg(checkIn, checkOut) {
  if (!checkIn) return 'Popular dates are filling fast';
  const ci = new Date(checkIn);
  const season = getPeakSeason(ci);
  const day = getDayType(ci);

  if (season === 'peak') return '🔥 Peak season — only a few dates remaining';
  if (day === 'weekend') {
    const daysAway = Math.round((ci - new Date()) / 86400000);
    if (daysAway < 30) return '⚡ Popular weekend — booking quickly';
  }
  return 'Only a few weekends left this month — book now to secure your stay';
}

// ── AVAILABILITY — fetch real booked dates from Google Sheet ──
// Fetches fresh availability from server and overwrites localStorage cache.
// Fast initial paint uses cached data; server data always wins on load.
async function loadAvailability() {
  // 1. Paint immediately from cache so calendar feels instant
  rebuildBlockedRanges();

  try {
    // 2. Fetch fresh from server — overwrites cache completely
    const res  = await fetch(CONFIG.AVAIL_URL);
    const data = await res.json();
    if (data.success && Array.isArray(data.ranges)) {
      // Overwrite cache with authoritative server data
      _blockedRanges = data.ranges.map(r => ({ start: r.start, end: r.end }));
      localStorage.setItem('gh_blocked', JSON.stringify(_blockedRanges));
      // Clear old booking/block keys — server is now the source of truth
      localStorage.setItem('gh_bookings', '[]');
      localStorage.setItem('gh_blocks',   '[]');
    }
  } catch (err) {
    console.error('Availability API failed:', err.message);
    // Keep cached data on failure — better than showing nothing
  }
}

// ── Store pending booking data before Stripe redirect ─────────
// Called right before window.location.href = paymentLink
// Lets confirmation.html display booking details after Stripe return
function storePendingBooking(payload, total) {
  const id = 'GH-' + Date.now();
  sessionStorage.setItem('gh_pending', JSON.stringify({
    id, total,
    guestName : payload.guestName,
    email     : payload.email,
    checkIn   : payload.checkIn,
    checkOut  : payload.checkOut,
    guests    : payload.guests,
    nights    : payload.nights,
  }));
  // Optimistically block the dates locally so calendar updates immediately
  saveBooking({ id, checkIn: payload.checkIn, checkOut: payload.checkOut,
                guestName: payload.guestName, email: payload.email,
                guests: payload.guests, total, status: 'PENDING', platform: 'Direct' });
  return id;
}


// ── COMPATIBILITY ALIASES ─────────────────────────────────────
// Some HTML pages use older function names — these bridge the gap
function getLocalBookings()            { return []; }
function addLocalBooking(b)            { saveBooking(b); }
function deleteLocalBooking(id)        { deleteBooking(id); }
function isRangeAvailable(ci, co)      { return !isRangeBlocked(ci, co); }
function getBookedRanges()             { return _blockedRanges; }
function setBookedRanges(r)            { _blockedRanges = r.map(b => ({ start: b.checkIn || b.start, end: b.checkOut || b.end })); }
