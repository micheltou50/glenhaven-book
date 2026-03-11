/* ============================================================
   GLENHAVEN — script.js  v2
   Full pricing engine + calendar + booking storage
   ============================================================ */

'use strict';

// ── CONFIG ────────────────────────────────────────────────────
const CONFIG = {
  WEBHOOK_URL  : '/api/book',         // Netlify Function
  AVAIL_URL    : '/api/availability',  // Netlify Function
  BASE_RATE    : 320,
  BASE_GUESTS  : 2,
  EXTRA_GUEST  : 40,
  CLEANING_FEE : 150,
  MAX_GUESTS   : 8,
  MIN_NIGHTS   : {
    weekday: 2,
    weekend: 3,
    peak   : 4,
  },
};

// ── PRICING RULES ─────────────────────────────────────────────
const HOLIDAY_PRICES = {
  '12-25': 550,   // Christmas Day nightly rate
  '12-26': 550,   // Boxing Day
  '01-01': 650,   // New Year's Day
  '12-31': 650,   // New Year's Eve
  '04-18': 480,   // Good Friday (approx — fixed for demo)
  '04-20': 480,   // Easter Sunday
};

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

  // Weekend surcharge
  const day = date.getDay();
  if (day === 5) base += 60; // Friday
  if (day === 6) base += 80; // Saturday

  // Seasonal
  const season = getPeakSeason(date);
  if (season === 'peak') base *= 1.25;
  if (season === 'low')  base *= 0.90;

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
// No localStorage caching — always fetched fresh from server.
// This ensures deletions from the Sheet are reflected immediately.

let _blockedRanges = [];

function rebuildBlockedRanges() {
  // _blockedRanges is populated entirely from server — no local state
}

// Kept for admin.html compatibility — returns empty, admin reads from server
function getBookings() { return []; }
function getBlocks()   { return []; }
function saveBooking(b) {}
function deleteBooking(id) {}
function saveBlock(b) {}
function deleteBlock(id) {}

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
      let cls = 'cal-day';
      if (isPast)         cls += ' past';
      else if (isBlocked) cls += ' blocked';
      else                cls += ' avail';
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
      let cls = 'cal-day';
      if (isPast)         cls += ' past';
      else if (isBlocked) cls += ' blocked';
      else                cls += ' avail';
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
    if (!this.ci || (this.ci && this.co)) {
      this.ci = iso; this.co = null;
      this.onSelect({ checkIn: this.ci, checkOut: null });
    } else if (iso <= this.ci) {
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

  setRange(ci, co) { this.ci = ci; this.co = co; this.refreshClasses(); }
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
// Fetches blocked ranges fresh from server every page load — no caching.
// Deletions from the Sheet are reflected immediately on next page load.
async function loadAvailability() {
  try {
    const res  = await fetch(CONFIG.AVAIL_URL);
    const data = await res.json();
    if (data.success && Array.isArray(data.ranges)) {
      _blockedRanges = data.ranges.map(r => ({ start: r.start, end: r.end }));
    }
  } catch (err) {
    console.error('Availability API failed:', err.message);
    _blockedRanges = []; // fail open — show all dates as available
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
