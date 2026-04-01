/* ── availability.js — blocked ranges & booking store ── */

import { CONFIG } from './config.js';

let _blockedRanges = [];

export function rebuildBlockedRanges() {
  _blockedRanges = JSON.parse(localStorage.getItem('gh_blocked') || '[]');
}

export function getBookings() { return JSON.parse(localStorage.getItem('gh_bookings') || '[]'); }
export function getBlocks()   { return JSON.parse(localStorage.getItem('gh_blocks')   || '[]'); }

export function saveBooking(b) {
  const a = getBookings(); a.push(b);
  localStorage.setItem('gh_bookings', JSON.stringify(a));
  rebuildBlockedRanges();
}

export function deleteBooking(id) {
  localStorage.setItem('gh_bookings', JSON.stringify(getBookings().filter(b => b.id !== id)));
  rebuildBlockedRanges();
}

export function saveBlock(b) {
  const a = getBlocks(); a.push(b);
  localStorage.setItem('gh_blocks', JSON.stringify(a));
  rebuildBlockedRanges();
}

export function deleteBlock(id) {
  localStorage.setItem('gh_blocks', JSON.stringify(getBlocks().filter(b => b.id !== id)));
  rebuildBlockedRanges();
}

export function isDateBlocked(iso) {
  const d = new Date(iso); d.setHours(0, 0, 0, 0);
  return _blockedRanges.some(r => {
    const s = new Date(r.start); s.setHours(0, 0, 0, 0);
    const e = new Date(r.end);   e.setHours(0, 0, 0, 0);
    return d >= s && d < e;
  });
}

export function isRangeBlocked(ci, co) {
  const a = new Date(ci), b = new Date(co);
  return _blockedRanges.some(r => {
    const s = new Date(r.start), e = new Date(r.end);
    return a < e && b > s;
  });
}

export function getBookedRanges() { return _blockedRanges; }

export function setBookedRanges(r) {
  _blockedRanges = r.map(b => ({ start: b.checkIn || b.start, end: b.checkOut || b.end }));
}

let _priceOverrides = {};

export function getPriceOverride(iso) {
  return _priceOverrides[iso] !== undefined ? _priceOverrides[iso] : null;
}

export async function loadAvailability() {
  // Paint immediately from cache
  rebuildBlockedRanges();

  try {
    const res  = await fetch(CONFIG.AVAIL_URL);
    const data = await res.json();
    if (data.success && Array.isArray(data.ranges)) {
      _blockedRanges = data.ranges.map(r => ({ start: r.start, end: r.end }));
      localStorage.setItem('gh_blocked', JSON.stringify(_blockedRanges));
      localStorage.setItem('gh_bookings', '[]');
      localStorage.setItem('gh_blocks', '[]');
    }
    if (data.priceOverrides && typeof data.priceOverrides === 'object') {
      _priceOverrides = data.priceOverrides;
    }
  } catch (err) {
    console.error('Availability API failed:', err.message);
  }
}

// Compatibility aliases
export function isRangeAvailable(ci, co) { return !isRangeBlocked(ci, co); }
export function getLocalBookings()       { return []; }
export function addLocalBooking(b)       { saveBooking(b); }
export function deleteLocalBooking(id)   { deleteBooking(id); }
