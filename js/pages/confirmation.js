/* ── pages/confirmation.js — confirmation.html entry module ── */

import { getParam, fmtDate, fmtAUD } from '../utils.js';
import { saveBooking } from '../availability.js';
import { initNavBurger } from '../ui.js';

document.addEventListener('DOMContentLoaded', () => initNavBurger());

const status = getParam('booking');
let pending = null;
try { pending = JSON.parse(sessionStorage.getItem('gh_pending') || 'null'); } catch (e) { /* ignore */ }

document.getElementById('stateSuccess').style.display   = 'none';
document.getElementById('stateCancelled').style.display = 'none';
document.getElementById('stateDefault').style.display   = 'none';

if (status === 'success') {
  document.getElementById('stateSuccess').style.display = 'block';
  if (pending) {
    document.getElementById('cfmEmail').textContent  = pending.email || '';
    document.getElementById('cfmRef').textContent    = pending.id || ('GH-' + Date.now());
    document.getElementById('cfmName').textContent   = pending.guestName || '—';
    document.getElementById('cfmTotal').textContent  = fmtAUD(pending.total || 0);
    document.getElementById('cfmCI').textContent     = fmtDate(pending.checkIn);
    document.getElementById('cfmCO').textContent     = fmtDate(pending.checkOut);
    document.getElementById('cfmGuests').textContent = (pending.guests || 1) + ' guest(s)';
    saveBooking({
      id: pending.id, guestName: pending.guestName, email: pending.email,
      checkIn: pending.checkIn, checkOut: pending.checkOut,
      guests: pending.guests, total: pending.total,
      platform: 'Direct', status: 'CONFIRMED',
    });
    sessionStorage.removeItem('gh_pending');
  } else {
    document.getElementById('cfmRef').textContent  = 'GH-' + Date.now();
    document.getElementById('cfmName').textContent = 'Guest';
  }
} else if (status === 'cancelled') {
  document.getElementById('stateCancelled').style.display = 'block';
} else {
  document.getElementById('stateDefault').style.display = 'block';
}
