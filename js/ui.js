/* ── ui.js — shared UI helpers ── */

import { CONFIG } from './config.js';
import { getPeakSeason, getDayType } from './pricing.js';
import { saveBooking } from './availability.js';

// ── Nav burger (was duplicated in 6+ pages) ──────────────────
export function initNavBurger() {
  const burger = document.querySelector('.nav-burger');
  const links  = document.querySelector('.nav-links');
  if (!burger || !links) return;

  burger.addEventListener('click', (e) => {
    e.stopPropagation();
    links.classList.toggle('open');
  });
  links.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => links.classList.remove('open'));
  });
  document.addEventListener('click', (e) => {
    if (!burger.contains(e.target) && !links.contains(e.target)) {
      links.classList.remove('open');
    }
  });
}

// ── Scroll reveal ────────────────────────────────────────────
export function initScrollReveal() {
  const revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(entries => entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    }), { threshold: 0, rootMargin: '0px 0px -50px 0px' });
    revealEls.forEach(el => io.observe(el));
    setTimeout(() => revealEls.forEach(el => el.classList.add('in')), 1500);
  } else {
    revealEls.forEach(el => el.classList.add('in'));
  }
}

// ── Review carousel ──────────────────────────────────────────
export function initCarousel(trackId, dotContainerId, arrowPrev, arrowNext) {
  const track  = document.getElementById(trackId);
  const dotBox = document.getElementById(dotContainerId);
  if (!track) return;
  const slides = track.querySelectorAll('.review-slide');
  let cur = 0;

  function go(i) {
    cur = (i + slides.length) % slides.length;
    track.style.transform = `translateX(-${cur * 100}%)`;
    if (dotBox) dotBox.querySelectorAll('.car-dot').forEach((d, idx) => d.classList.toggle('on', idx === cur));
  }

  slides.forEach((_, i) => {
    const dot = document.createElement('div');
    dot.className = 'car-dot' + (i === 0 ? ' on' : '');
    dot.onclick = () => go(i);
    if (dotBox) dotBox.appendChild(dot);
  });

  const prev = document.getElementById(arrowPrev);
  const next = document.getElementById(arrowNext);
  if (prev) prev.onclick = () => go(cur - 1);
  if (next) next.onclick = () => go(cur + 1);

  setInterval(() => go(cur + 1), 6000);
}

// ── Photo strip drag ─────────────────────────────────────────
export function initStrip(id) {
  const el = document.getElementById(id);
  if (!el) return;
  let isDown = false, startX, scrollLeft;
  el.addEventListener('mousedown', e => { isDown = true; startX = e.pageX - el.offsetLeft; scrollLeft = el.scrollLeft; });
  el.addEventListener('mouseleave', () => isDown = false);
  el.addEventListener('mouseup', () => isDown = false);
  el.addEventListener('mousemove', e => { if (!isDown) return; e.preventDefault(); const x = e.pageX - el.offsetLeft; el.scrollLeft = scrollLeft - (x - startX); });
}

// ── Urgency messages ─────────────────────────────────────────
export function getUrgencyMsg(checkIn, checkOut) {
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

// ── Send booking to Netlify function ─────────────────────────
export async function sendBooking(payload) {
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

// ── Store pending booking before Stripe redirect ─────────────
export function storePendingBooking(payload, total) {
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
  saveBooking({
    id, checkIn: payload.checkIn, checkOut: payload.checkOut,
    guestName: payload.guestName, email: payload.email,
    guests: payload.guests, total, status: 'PENDING', platform: 'Direct',
  });
  return id;
}
