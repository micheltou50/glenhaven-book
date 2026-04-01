/* ── utils.js — pure utility functions ── */

export function setEl(id, val) {
  if (val == null) return;
  const el = document.getElementById(id);
  if (el) el.textContent = String(val);
}

export function shadeColor(hex, amount) {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.max(0, (n >> 16) + amount));
  const g = Math.min(255, Math.max(0, ((n >> 8) & 0xff) + amount));
  const b = Math.min(255, Math.max(0, (n & 0xff) + amount));
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
}

export function hexToRgba(hex, alpha) {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${n >> 16},${(n >> 8) & 0xff},${n & 0xff},${alpha})`;
}

export function toISO(date) {
  if (!date) return '';
  const d = new Date(date);
  return d.toISOString().split('T')[0];
}

export function todayISO() {
  return toISO(new Date());
}

export function fmtDate(str, opts) {
  if (!str) return '';
  const d = new Date(str);
  return d.toLocaleDateString('en-AU', opts || { day: 'numeric', month: 'short', year: 'numeric' });
}

export function fmtShort(str) {
  return fmtDate(str, { day: 'numeric', month: 'short' });
}

export function fmtAUD(n) {
  return '$' + Number(n).toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export function getParam(k) {
  return new URLSearchParams(window.location.search).get(k);
}
