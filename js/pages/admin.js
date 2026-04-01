/* ── pages/admin.js — admin.html entry module ── */

import { todayISO, fmtDate, fmtAUD, shadeColor, hexToRgba } from '../utils.js';
import { loadAvailability, deleteBooking, getBookings, getBlocks, saveBlock, deleteBlock, isDateBlocked } from '../availability.js';
import { applySiteConfig } from '../site-config.js';
import { MiniCal } from '../calendar.js';
import { getNightlyRate } from '../pricing.js';

'use strict';

const ADMIN_PWD_KEY = 'gh_admin_pwd';
let adminPassword   = sessionStorage.getItem(ADMIN_PWD_KEY) || '';

// ── CONFIG STATE ─────────────────────────────────────────────
let serverConfig = null;
let isDirty = false;

const DEFAULT_CONFIG = {
  property: { name:'Glenhaven', tagline:'A Quintessential Katoomba Cottage', description:'A peaceful 2-storey timber retreat minutes from the Three Sisters. Fireplace, conservatory, private garden.', bedrooms:4, bathrooms:2.5, guests:8 },
  hero: { headline:'Blue Mountains\nCottage Escape', subheadline:'📍 Katoomba · Blue Mountains · NSW Australia' },
  pricing: { baseRate:320, baseGuests:2, extraGuest:40, cleaningFee:150, maxGuests:8, friSurcharge:60, satSurcharge:80, peakPct:25, lowPct:-10, minNights:{weekday:2,weekend:3,peak:4}, losDiscounts:{nights3:5,nights5:10,nights7:15}, holidayPrices:{'12-25':550,'12-26':550,'01-01':650,'12-31':650,'04-18':480,'04-20':480} },
  colors: { primary:'#1a6640', accent:'#b45309' },
  photos: [
    'https://a0.muscache.com/im/pictures/hosting/Hosting-1615699566549279350/original/b23b9d94-f89b-4e33-8c48-7c955fb81de4.jpeg',
    'https://a0.muscache.com/im/pictures/hosting/Hosting-1615699566549279350/original/ad8fb841-e3b8-4e56-a607-7643edf4f0f2.jpeg',
    'https://a0.muscache.com/im/pictures/hosting/Hosting-1615699566549279350/original/a0769fd7-6ef6-4f85-a370-96ccaf0b05fc.jpeg',
    'https://a0.muscache.com/im/pictures/hosting/Hosting-1615699566549279350/original/6b2084ae-8865-422c-be93-2d5fa06042e6.jpeg',
    'https://a0.muscache.com/im/pictures/hosting/Hosting-1615699566549279350/original/3e22052f-39b3-4bd4-8541-7651b393f8d0.jpeg',
    'https://a0.muscache.com/im/pictures/hosting/Hosting-1615699566549279350/original/ad8fb841-e3b8-4e56-a607-7643edf4f0f2.jpeg',
    'https://a0.muscache.com/im/pictures/hosting/Hosting-1615699566549279350/original/a0769fd7-6ef6-4f85-a370-96ccaf0b05fc.jpeg',
    'https://a0.muscache.com/im/pictures/hosting/Hosting-1615699566549279350/original/b23b9d94-f89b-4e33-8c48-7c955fb81de4.jpeg',
    'https://a0.muscache.com/im/pictures/hosting/Hosting-1615699566549279350/original/6b2084ae-8865-422c-be93-2d5fa06042e6.jpeg',
    'https://a0.muscache.com/im/pictures/hosting/Hosting-1615699566549279350/original/3e22052f-39b3-4bd4-8541-7651b393f8d0.jpeg',
  ],
  houseRules: {
    checkin: '3:00 PM', checkout: '10:00 AM',
    general: ['Maximum 8 guests at any time','Self check-in via key lockbox','Please treat the property as your own home','Report any damage or breakages promptly','Leave the property in a clean and tidy condition'],
    noise: ['Quiet hours: 10pm – 8am','No parties or large gatherings','Music and outdoor entertaining welcome until 10pm'],
    smoking: ['No smoking inside the property','Smoking permitted in the garden only','Please dispose of cigarette butts responsibly'],
    pets: ['Well-behaved pets welcome — please advise in advance','Pets must not be left alone in the property','Please keep pets off the furniture'],
  },
  amenities:['Wood fireplace','Glass conservatory','Private garden','Full kitchen','Washer & dryer','Fast WiFi','Smart TV','BBQ grill','Free parking','Self check-in','Pet friendly','Air conditioning'],
};

function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

// ── BOOKINGS FROM SERVER ─────────────────────────────────────
let allBK = [], fText = '', fStat = '';

async function loadAdminBookings() {
  try {
    const res  = await fetch('/api/bookings');
    const data = await res.json();
    if (data.success && Array.isArray(data.bookings)) {
      allBK = data.bookings;
    } else {
      console.warn('loadAdminBookings:', data.error || 'No bookings returned');
      allBK = [];
    }
  } catch (err) {
    console.warn('Could not load bookings from server:', err.message);
    allBK = [];
  }
}

function setStatus(state, text) {
  document.getElementById('statusDot').className = 'dot ' + state;
  document.getElementById('statusText').textContent = text;
}
function markDirty() {
  if (!isDirty) {
    isDirty = true;
    document.getElementById('discardBtn').style.display = 'inline-flex';
    setStatus('unsaved', 'Unsaved changes — click Publish to go live');
  }
}

// ── LOGIN ────────────────────────────────────────────────────
window.doLogin = function () {
  const pwd = document.getElementById('loginPwd').value.trim();
  if (!pwd) return;
  adminPassword = pwd;
  sessionStorage.setItem(ADMIN_PWD_KEY, pwd);
  document.getElementById('loginOverlay').style.display = 'none';
  init();
};

// ── INIT ─────────────────────────────────────────────────────
async function init() {
  const now = new Date();
  document.getElementById('admDate').textContent    = now.toLocaleDateString('en-AU', { weekday:'short', day:'numeric', month:'short' });
  document.getElementById('admDateSub').textContent = now.toLocaleDateString('en-AU', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
  document.getElementById('blkFrom').min = todayISO();
  document.getElementById('blkTo').min   = todayISO();
  await fetchServerConfig();
  await loadAvailability();
  await loadAdminBookings();
  renderStats();
  renderTable();
  renderBlockList();
}

document.addEventListener('DOMContentLoaded', () => {
  if (adminPassword) { init(); }
  else { document.getElementById('loginPwd').focus(); }
});

// ── FETCH CONFIG ─────────────────────────────────────────────
async function fetchServerConfig() {
  let envelope;
  try {
    const res = await fetch('/api/config');
    envelope  = await res.json();
  } catch (err) {
    showConfigBanner('error', '⚠️ Could not reach /api/config: ' + err.message + '. Check that APPS_SCRIPT_URL is set in Netlify environment variables.');
    serverConfig = deepClone(DEFAULT_CONFIG);
    setStatus('unsaved', 'Config load failed — check Netlify env vars');
    populateForm(serverConfig);
    return;
  }

  const status = envelope.status || (envelope.config ? 'ok' : 'empty');

  if (status === 'error') {
    showConfigBanner('error', '⚠️ Config failed to load: ' + (envelope.error || 'unknown error') + '. The form is showing default values. Resolve the error before publishing.');
    serverConfig = deepClone(DEFAULT_CONFIG);
    setStatus('unsaved', 'Config load failed');
  } else if (status === 'empty' || !envelope.config) {
    showConfigBanner('info', 'ℹ️ No published config yet — this is your first time here. Fill in the form and click Publish Changes to go live.');
    serverConfig = deepClone(DEFAULT_CONFIG);
    setStatus('unsaved', 'No saved config yet — publish to go live');
  } else {
    serverConfig = deepClone(envelope.config);
    if (envelope.config.savedAt) {
      const d = new Date(envelope.config.savedAt);
      setStatus('saved', 'Published · saved ' + d.toLocaleString('en-AU', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }));
    } else {
      setStatus('saved', 'All changes published');
    }
  }

  populateForm(serverConfig);
}

function showConfigBanner(type, msg) {
  let banner = document.getElementById('configBanner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'configBanner';
    banner.style.cssText = 'margin-bottom:1rem;padding:.85rem 1.1rem;border-radius:var(--r);font-size:.84rem;display:flex;align-items:flex-start;gap:.6rem;';
    const main = document.querySelector('.adm-main');
    if (main) main.insertBefore(banner, main.firstChild);
  }
  if (type === 'error') {
    banner.style.background = 'var(--red-p)'; banner.style.color = '#7f1d1d'; banner.style.border = '1px solid #fca5a5';
  } else {
    banner.style.background = 'var(--warm-p)'; banner.style.color = '#92400e'; banner.style.border = '1px solid #fde68a';
  }
  banner.textContent = msg;
}

// ── FORM ─────────────────────────────────────────────────────
function setVal(id, v) { const el = document.getElementById(id); if (el && v != null) el.value = v; }
function gVal(id) { const el = document.getElementById(id); return el ? el.value.trim() : ''; }
function nVal(id) { const v = parseFloat(gVal(id)); return isNaN(v) ? null : v; }

function populateForm(cfg) {
  if (!cfg) return;
  const p = cfg.property || {}, h = cfg.hero || {}, pr = cfg.pricing || {}, c = cfg.colors || {};
  setVal('eName', p.name); setVal('eTagline', p.tagline); setVal('eHeroHeadline', h.headline); setVal('eHeroSub', h.subheadline);
  setVal('eDescription', p.description); setVal('eBedrooms', p.bedrooms); setVal('eBathrooms', p.bathrooms); setVal('eMaxGuests', p.guests);
  const hr = cfg.houseRules || {};
  setVal('eCheckin', hr.checkin || ''); setVal('eCheckout', hr.checkout || '');
  setVal('eRulesGeneral', (hr.general || []).join('\n'));
  setVal('eRulesNoise',   (hr.noise   || []).join('\n'));
  setVal('eRulesSmoking', (hr.smoking || []).join('\n'));
  setVal('eRulesPets',    (hr.pets    || []).join('\n'));
  setVal('pBaseRate', pr.baseRate); setVal('pFriSurcharge', pr.friSurcharge); setVal('pSatSurcharge', pr.satSurcharge);
  setVal('pCleaningFee', pr.cleaningFee); setVal('pExtraGuest', pr.extraGuest); setVal('pBaseGuests', pr.baseGuests);
  setVal('pPeakPct', pr.peakPct); setVal('pLowPct', pr.lowPct);
  const hp = pr.holidayPrices || {};
  setVal('pXmas', hp['12-25']); setVal('pBoxing', hp['12-26']); setVal('pNYE', hp['12-31']); setVal('pNYD', hp['01-01']); setVal('pGoodFri', hp['04-18']); setVal('pEasterSun', hp['04-20']);
  const mn = pr.minNights || {};
  setVal('pMinWeekday', mn.weekday); setVal('pMinWeekend', mn.weekend); setVal('pMinPeak', mn.peak);
  if (c.primary) { document.getElementById('cPrimary').value = c.primary; document.getElementById('cPrimaryHex').value = c.primary; }
  if (c.accent)  { document.getElementById('cAccent').value = c.accent;   document.getElementById('cAccentHex').value = c.accent; }
  renderPhotos(cfg.photos || []);
  renderAmenities(cfg.amenities || []);
  // Attach change listeners
  ['eName','eTagline','eHeroHeadline','eHeroSub','eDescription','eBedrooms','eBathrooms','eMaxGuests',
   'pBaseRate','pFriSurcharge','pSatSurcharge','pCleaningFee','pExtraGuest','pBaseGuests','pPeakPct','pLowPct',
   'pXmas','pBoxing','pNYE','pNYD','pGoodFri','pEasterSun','pMinWeekday','pMinWeekend','pMinPeak'].forEach(id => {
    const el = document.getElementById(id);
    if (el && !el._gl) { el.addEventListener('input', markDirty); el._gl = true; }
  });
}

function readForm() {
  return {
    property: { name: gVal('eName') || 'Glenhaven', tagline: gVal('eTagline'), description: gVal('eDescription'), bedrooms: nVal('eBedrooms'), bathrooms: nVal('eBathrooms'), guests: nVal('eMaxGuests') },
    houseRules: {
      checkin: gVal('eCheckin'), checkout: gVal('eCheckout'),
      general: gVal('eRulesGeneral').split('\n').map(s => s.trim()).filter(Boolean),
      noise:   gVal('eRulesNoise').split('\n').map(s => s.trim()).filter(Boolean),
      smoking: gVal('eRulesSmoking').split('\n').map(s => s.trim()).filter(Boolean),
      pets:    gVal('eRulesPets').split('\n').map(s => s.trim()).filter(Boolean),
    },
    hero: { headline: gVal('eHeroHeadline'), subheadline: gVal('eHeroSub') },
    pricing: {
      baseRate: nVal('pBaseRate'), friSurcharge: nVal('pFriSurcharge'), satSurcharge: nVal('pSatSurcharge'),
      cleaningFee: nVal('pCleaningFee'), extraGuest: nVal('pExtraGuest'), baseGuests: nVal('pBaseGuests'),
      maxGuests: nVal('eMaxGuests'), peakPct: nVal('pPeakPct'), lowPct: nVal('pLowPct'),
      minNights: { weekday: nVal('pMinWeekday'), weekend: nVal('pMinWeekend'), peak: nVal('pMinPeak') },
      losDiscounts: { nights3: nVal('pLos3'), nights5: nVal('pLos5'), nights7: nVal('pLos7') },
      holidayPrices: { '12-25': nVal('pXmas'), '12-26': nVal('pBoxing'), '12-31': nVal('pNYE'), '01-01': nVal('pNYD'), '04-18': nVal('pGoodFri'), '04-20': nVal('pEasterSun') },
    },
    colors: { primary: document.getElementById('cPrimary').value, accent: document.getElementById('cAccent').value },
    photos: currentPhotos(),
    amenities: currentAmenities(),
  };
}

// ── PHOTOS ───────────────────────────────────────────────────
let _photos = [];
function currentPhotos() { return [..._photos]; }
function renderPhotos(photos) {
  _photos = [...photos];
  document.getElementById('photoGrid').innerHTML = _photos.map((url, i) =>
    `<div class="photo-item"><img src="${url}" onerror="this.parentElement.style.background='var(--g200)'"/><button class="photo-del" onclick="removePhoto(${i})">×</button><div class="photo-idx">${i === 0 ? 'Hero' : '#' + (i + 1)}</div></div>`
  ).join('');
}
window.addPhoto = function () {
  const url = document.getElementById('photoUrlInput').value.trim();
  if (!url) return;
  _photos.push(url); renderPhotos(_photos);
  document.getElementById('photoUrlInput').value = '';
  markDirty();
};
window.removePhoto = function (i) { _photos.splice(i, 1); renderPhotos(_photos); markDirty(); };

// ── AMENITIES ────────────────────────────────────────────────
let _amenities = [];
function currentAmenities() { return [..._amenities]; }
function renderAmenities(list) {
  _amenities = [...list];
  document.getElementById('amenityList').innerHTML = _amenities.map((a, i) =>
    `<span class="amenity-tag">${a}<button onclick="removeAmenity(${i})">×</button></span>`
  ).join('');
}
window.addAmenity = function () {
  const v = document.getElementById('amenityInput').value.trim();
  if (!v) return;
  _amenities.push(v); renderAmenities(_amenities);
  document.getElementById('amenityInput').value = '';
  markDirty();
};
window.removeAmenity = function (i) { _amenities.splice(i, 1); renderAmenities(_amenities); markDirty(); };

// ── COLORS ───────────────────────────────────────────────────
window.onColorInput = function (type, hex) {
  document.getElementById(type === 'primary' ? 'cPrimaryHex' : 'cAccentHex').value = hex;
  applySiteConfig({ colors: { primary: document.getElementById('cPrimary').value, accent: document.getElementById('cAccent').value } });
  markDirty();
};
window.onHexInput = function (type, hex) {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return;
  document.getElementById(type === 'primary' ? 'cPrimary' : 'cAccent').value = hex;
  applySiteConfig({ colors: { primary: document.getElementById('cPrimary').value, accent: document.getElementById('cAccent').value } });
  markDirty();
};
window.applyPreset = function (primary, accent) {
  document.getElementById('cPrimary').value = primary; document.getElementById('cPrimaryHex').value = primary;
  document.getElementById('cAccent').value = accent;   document.getElementById('cAccentHex').value = accent;
  applySiteConfig({ colors: { primary, accent } });
  markDirty();
};

// ── PREVIEW / PUBLISH ────────────────────────────────────────
window.previewChanges = function () {
  const cfg = readForm();
  if (cfg.colors) {
    const root = document.documentElement;
    if (cfg.colors.primary) {
      const p = cfg.colors.primary;
      root.style.setProperty('--green', p);
      root.style.setProperty('--green-d', shadeColor(p, -20));
      root.style.setProperty('--green-l', shadeColor(p, 20));
      root.style.setProperty('--green-p', hexToRgba(p, 0.1));
    }
    if (cfg.colors.accent) root.style.setProperty('--warm', cfg.colors.accent);
  }
  window.open('index.html?preview=1', '_blank');
  document.getElementById('previewBadge').style.display = 'inline-block';
  setStatus('unsaved', 'Preview opened in new tab — click Publish to go live');
};

window.discardChanges = function () {
  if (!confirm('Discard all unsaved changes?')) return;
  populateForm(serverConfig);
  applySiteConfig(serverConfig);
  isDirty = false;
  document.getElementById('discardBtn').style.display = 'none';
  document.getElementById('previewBadge').style.display = 'none';
  setStatus('saved', 'All changes published');
};

window.publishChanges = async function () {
  const btn = document.getElementById('publishBtn');
  btn.textContent = 'Publishing…'; btn.disabled = true;
  setStatus('saving', 'Saving…');
  try {
    const config = readForm();
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-password': adminPassword },
      body: JSON.stringify(config),
    });
    if (res.status === 401) { alert('Incorrect password — please log out and try again.'); sessionStorage.removeItem(ADMIN_PWD_KEY); location.reload(); return; }
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Unknown error');
    serverConfig = deepClone(config);
    isDirty = false;
    document.getElementById('discardBtn').style.display = 'none';
    document.getElementById('previewBadge').style.display = 'none';
    applySiteConfig(config);
    try { localStorage.removeItem('gh_site_config'); } catch (e) { /* ignore */ }
    setStatus('saved', 'Published · ' + new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' }));
  } catch (err) {
    alert('Publish failed: ' + err.message);
    setStatus('unsaved', 'Publish failed — try again');
  } finally {
    btn.textContent = 'Publish Changes'; btn.disabled = false;
  }
};

// ── TABS ─────────────────────────────────────────────────────
let admCal;
window.showTab = function (name, el) {
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('on'));
  document.querySelectorAll('.tab-btn,.adm-nav a').forEach(b => b.classList.remove('on'));
  const pane = document.getElementById('tab-' + name);
  if (!pane) { console.warn('No tab pane found for:', name); return; }
  pane.classList.add('on');
  if (el) el.classList.add('on');
  if (name === 'calendar' && !admCal) setTimeout(() => { admCal = new MiniCal('admCalContainer', { onSelect() {}, showPrice: false }); }, 50);
  if (name === 'block') renderBlockList();
  if (name === 'checklist') renderChecklist();
  if (name === 'reviews') loadReviews();
  if (name === 'edit-pricing') renderPricingCal();
};

// ── BOOKINGS TABLE ───────────────────────────────────────────
function renderStats() {
  const n90 = new Date(); n90.setDate(n90.getDate() + 90);
  const now = new Date(); let up = 0, nights = 0, rev = 0;
  allBK.forEach(b => { const ci = new Date(b.checkIn); if (ci >= now && ci <= n90) up++; nights += Math.round((new Date(b.checkOut) - new Date(b.checkIn)) / 86400000) || 0; rev += b.total || 0; });
  document.getElementById('stTotal').textContent = allBK.length;
  document.getElementById('stUpcoming').textContent = up;
  document.getElementById('stNights').textContent = nights;
  document.getElementById('stRevenue').textContent = fmtAUD(rev);
}
function renderTable() {
  const tbody = document.getElementById('bkTable'), empty = document.getElementById('bkEmpty');
  const rows = allBK.filter(b => { const mt = !fText || (b.guestName || '').toLowerCase().includes(fText); const ms = !fStat || (b.status || 'CONFIRMED').toUpperCase() === fStat; return mt && ms; });
  if (!rows.length) { tbody.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';
  tbody.innerHTML = rows.map(b => {
    const n = Math.round((new Date(b.checkOut) - new Date(b.checkIn)) / 86400000) || '?';
    const st = (b.status || 'CONFIRMED').toUpperCase();
    return `<tr><td><strong>${b.guestName || '—'}</strong><br><span style="font-size:.74rem;color:var(--g400);">${b.email || ''}</span></td><td>${fmtDate(b.checkIn)}</td><td>${fmtDate(b.checkOut)}</td><td>${n}</td><td>${b.guests || '—'}</td><td style="font-weight:600;">${fmtAUD(b.total || 0)}</td><td><span class="badge badge-green" style="font-size:.7rem;">${b.platform || 'Direct'}</span></td><td><span class="spill ${st === 'CONFIRMED' ? 's-cfm' : st === 'CANCELLED' ? 's-can' : 's-pen'}">${st}</span></td><td><button class="t-act" onclick="delBooking('${b.id}')">Delete</button></td></tr>`;
  }).join('');
}
window.filterTable = function (v) { fText = v.toLowerCase(); renderTable(); };
window.filterStatus = function (v) { fStat = v; renderTable(); };
window.delBooking = function (id) { if (!confirm('Delete this booking?')) return; deleteBooking(id); allBK = getBookings(); renderStats(); renderTable(); };

// ── BLOCK DATES ──────────────────────────────────────────────
function renderBlockList() {
  const bl = getBlocks(), el = document.getElementById('blockList'), em = document.getElementById('blockEmpty');
  if (!bl.length) { el.innerHTML = ''; em.style.display = 'block'; return; }
  em.style.display = 'none';
  el.innerHTML = bl.map(b => `<div style="display:flex;align-items:center;justify-content:space-between;padding:.85rem 1.2rem;border-bottom:1px solid var(--g100);font-size:.875rem;"><div><strong>${fmtDate(b.start)} → ${fmtDate(b.end)}</strong><div style="font-size:.75rem;color:var(--g400);margin-top:.15rem;">${b.reason || 'Blocked'}</div></div><button class="t-act" onclick="removeBlock('${b.id}')">Remove</button></div>`).join('');
}
window.addBlock = function () {
  const from = document.getElementById('blkFrom').value, to = document.getElementById('blkTo').value, reason = document.getElementById('blkReason').value.trim();
  if (!from || !to) { alert('Please select both dates.'); return; }
  if (to <= from) { alert('End date must be after start date.'); return; }
  saveBlock({ id: 'blk-' + Date.now(), start: from, end: to, reason: reason || 'Blocked' });
  renderBlockList();
  document.getElementById('blkFrom').value = ''; document.getElementById('blkTo').value = ''; document.getElementById('blkReason').value = '';
};
window.removeBlock = function (id) { deleteBlock(id); renderBlockList(); };

// ── ICAL ─────────────────────────────────────────────────────
window.copyIcal = function () { navigator.clipboard.writeText('https://glenhaven-book.netlify.app/calendar.ics').then(() => alert('Copied!')); };

// ── EXPORT ───────────────────────────────────────────────────
window.exportCSV = function () {
  const rows = [['Guest', 'Check-in', 'Check-out', 'Nights', 'Guests', 'Total', 'Platform', 'Status']];
  allBK.forEach(b => { const n = Math.round((new Date(b.checkOut) - new Date(b.checkIn)) / 86400000); rows.push([b.guestName, b.checkIn, b.checkOut, n, b.guests, b.total, b.platform || 'Direct', b.status || 'CONFIRMED']); });
  const csv = rows.map(r => r.map(c => `"${c || ''}"`).join(',')).join('\n');
  const a = document.createElement('a'); a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv); a.download = 'glenhaven-bookings-' + todayISO() + '.csv'; a.click();
};

// ── DEPLOY CHECKLIST ─────────────────────────────────────────
const CHECKLIST = [
  { id: 'c1', label: 'Netlify env vars set',        detail: 'APPS_SCRIPT_URL and ADMIN_PASSWORD both present in Netlify → Site settings → Environment variables', test: checkEnvVars },
  { id: 'c2', label: 'Config loads without error',  detail: 'Open this page and check the banner above — should show no error', test: checkConfigLoad },
  { id: 'c3', label: 'Edit &amp; publish hero text',detail: 'Change hero headline → Publish → open index.html in a new tab, confirm it updated', test: null },
  { id: 'c4', label: 'Reload test (incognito)',      detail: 'After publish, open site in a private/incognito window — confirm visitors see the updated content', test: null },
  { id: 'c5', label: 'Pricing test',                detail: 'Change Friday surcharge → Publish → go to booking.html, pick dates including a Friday and verify total', test: null },
  { id: 'c6', label: 'Color change test',           detail: 'Change primary color → Preview → confirm buttons/links update → Publish → check live site', test: null },
  { id: 'c7', label: 'Config missing/first-run safe', detail: 'Site should work with hardcoded defaults if no config file exists in Drive yet — confirmed by fresh deploy', test: null },
  { id: 'c8', label: 'Apps Script redeployed',       detail: 'After updating Code.gs, did you click Deploy → Manage Deployments → New version in Apps Script?', test: null },
  { id: 'c9', label: 'Stripe webhook live',          detail: 'In Stripe Dashboard → Webhooks → confirm endpoint is https://glenhaven-book.netlify.app/api/webhook', test: null },
];

let checkState = JSON.parse(localStorage.getItem('gh_checklist') || '{}');

function renderChecklist() {
  const el = document.getElementById('checklistItems');
  el.innerHTML = CHECKLIST.map(c => {
    const done = !!checkState[c.id];
    return `<div style="display:flex;align-items:flex-start;gap:.75rem;padding:.85rem 0;border-bottom:1px solid var(--g100);cursor:pointer;" onclick="toggleCheck('${c.id}')">
      <div style="width:20px;height:20px;border-radius:50%;flex-shrink:0;margin-top:.1rem;display:flex;align-items:center;justify-content:center;font-size:.8rem;font-weight:700;border:2px solid ${done ? 'var(--green)' : 'var(--g300)'};background:${done ? 'var(--green)' : 'transparent'};color:${done ? '#fff' : 'transparent'};">✓</div>
      <div style="flex:1;">
        <div style="font-size:.875rem;font-weight:600;color:${done ? 'var(--g400)' : 'var(--black)'};text-decoration:${done ? 'line-through' : 'none'};">${c.label}</div>
        <div style="font-size:.75rem;color:var(--g400);margin-top:.2rem;">${c.detail}</div>
        ${c.test ? `<button class="btn btn-sm btn-white" style="margin-top:.4rem;font-size:.75rem;" onclick="event.stopPropagation();runTest('${c.id}')">Run test</button>` : ''}
      </div>
    </div>`;
  }).join('');
  const done = Object.values(checkState).filter(Boolean).length;
  document.getElementById('checklistScore').textContent = done + ' / ' + CHECKLIST.length + ' complete';
}

window.toggleCheck = function (id) {
  checkState[id] = !checkState[id];
  localStorage.setItem('gh_checklist', JSON.stringify(checkState));
  renderChecklist();
};
window.resetChecklist = function () {
  checkState = {};
  localStorage.setItem('gh_checklist', JSON.stringify(checkState));
  renderChecklist();
};

window.runTest = async function (id) {
  const item = CHECKLIST.find(c => c.id === id);
  if (!item || !item.test) return;
  const result = await item.test();
  if (result.pass) {
    checkState[id] = true;
    localStorage.setItem('gh_checklist', JSON.stringify(checkState));
  }
  renderChecklist();
  alert(result.pass ? '✅ ' + result.msg : '❌ ' + result.msg);
};

async function checkEnvVars() {
  try {
    const res  = await fetch('/api/config');
    const body = await res.json();
    if (res.status === 500 && body.error && body.error.includes('APPS_SCRIPT_URL')) {
      return { pass: false, msg: 'APPS_SCRIPT_URL is not set in Netlify.' };
    }
    if (res.ok || res.status !== 500) {
      return { pass: true, msg: 'APPS_SCRIPT_URL is set. (ADMIN_PASSWORD is only checked on publish.)' };
    }
    return { pass: false, msg: body.error || 'Unknown server error.' };
  } catch (err) {
    return { pass: false, msg: 'Could not reach /api/config: ' + err.message };
  }
}

async function checkConfigLoad() {
  try {
    const res  = await fetch('/api/config');
    const body = await res.json();
    const status = body.status || (body.config ? 'ok' : 'empty');
    if (status === 'error') return { pass: false, msg: 'Config load error: ' + (body.error || 'unknown') };
    if (status === 'empty') return { pass: true,  msg: 'No config saved yet — defaults will be used. Publish to create one.' };
    return { pass: true, msg: 'Config loaded successfully. Last saved: ' + (body.config && body.config.savedAt ? new Date(body.config.savedAt).toLocaleString('en-AU') : 'unknown') };
  } catch (err) {
    return { pass: false, msg: 'Network error: ' + err.message };
  }
}

// ── REVIEWS MANAGEMENT ───────────────────────────────────────
let allReviews = [];
let reviewFilter = 'all';

async function loadReviews() {
  try {
    const res = await fetch('/api/reviews?status=all', {
      headers: { 'x-admin-password': adminPassword },
    });
    const data = await res.json();
    allReviews = data.reviews || [];
    renderReviews();
  } catch (err) {
    console.warn('Failed to load reviews:', err.message);
    allReviews = [];
    renderReviews();
  }
}

function renderReviews() {
  const el = document.getElementById('reviewsList');
  const empty = document.getElementById('reviewsEmpty');
  const filtered = reviewFilter === 'all' ? allReviews : allReviews.filter(r => r.status === reviewFilter);

  if (!filtered.length) {
    el.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  el.innerHTML = filtered.map(r => {
    const stars = '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating);
    const statusColor = r.status === 'approved' ? 'var(--green)' : r.status === 'rejected' ? '#dc2626' : '#d97706';
    const statusBg = r.status === 'approved' ? 'var(--green-p)' : r.status === 'rejected' ? '#fef2f2' : '#fef9ec';
    const initials = (r.guest_name || '??').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const date = r.created_at ? new Date(r.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

    return `<div style="border:1px solid var(--g100);border-radius:var(--r);padding:1.25rem;margin-bottom:.75rem;">
      <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:.75rem;">
        <div style="width:38px;height:38px;border-radius:50%;background:var(--green);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:.78rem;flex-shrink:0;">${initials}</div>
        <div style="flex:1;">
          <div style="font-weight:700;font-size:.88rem;">${r.guest_name || '—'}</div>
          <div style="font-size:.75rem;color:var(--g400);">${r.stay_date || ''} · ${date}</div>
        </div>
        <div style="color:var(--green);font-size:.85rem;">${stars}</div>
        <span style="font-size:.7rem;font-weight:700;padding:3px 8px;border-radius:var(--r-full);background:${statusBg};color:${statusColor};text-transform:uppercase;letter-spacing:.04em;">${r.status}</span>
      </div>
      <p style="font-size:.85rem;color:var(--g600);line-height:1.6;margin:0 0 .75rem;">"${r.review_text}"</p>
      ${r.status === 'pending' ? `
        <div style="display:flex;gap:.5rem;">
          <button class="btn btn-sm" style="background:var(--green);color:#fff;border-color:var(--green);" onclick="approveReview('${r.id}')">Approve</button>
          <button class="btn btn-sm btn-white" onclick="rejectReview('${r.id}')">Reject</button>
        </div>` : r.status === 'rejected' ? `
        <button class="btn btn-sm btn-white" onclick="approveReview('${r.id}')">Approve</button>` : `
        <button class="btn btn-sm btn-white" onclick="rejectReview('${r.id}')">Reject</button>`}
    </div>`;
  }).join('');
}

window.filterReviews = function (status, el) {
  reviewFilter = status;
  // Update filter button styles
  if (el) {
    el.closest('.edit-card').querySelectorAll('.tab-btn').forEach(b => b.classList.remove('on'));
    el.classList.add('on');
  }
  renderReviews();
};

window.approveReview = async function (id) {
  try {
    await fetch('/api/reviews', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-password': adminPassword },
      body: JSON.stringify({ id, status: 'approved' }),
    });
    await loadReviews();
  } catch (err) {
    alert('Failed to approve: ' + err.message);
  }
};

window.rejectReview = async function (id) {
  try {
    await fetch('/api/reviews', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-password': adminPassword },
      body: JSON.stringify({ id, status: 'rejected' }),
    });
    await loadReviews();
  } catch (err) {
    alert('Failed to reject: ' + err.message);
  }
};

// ── PRICING CALENDAR ─────────────────────────────────────────
let pcMonth = new Date();
pcMonth.setDate(1);
let pcOverrides = {};
let pcBookedDates = {};
let pcSelectedDate = null;
let pcOverridesLoaded = false;

window.pricingCalPrev = function () { pcMonth.setMonth(pcMonth.getMonth() - 1); renderPricingCal(); };
window.pricingCalNext = function () { pcMonth.setMonth(pcMonth.getMonth() + 1); renderPricingCal(); };

async function loadPriceOverrides() {
  try {
    const res = await fetch('/api/price-overrides');
    const data = await res.json();
    pcOverrides = {};
    if (data.overrides) {
      data.overrides.forEach(o => { pcOverrides[o.date] = parseFloat(o.price); });
    }
    pcOverridesLoaded = true;
  } catch (err) {
    console.warn('Failed to load price overrides:', err.message);
  }
}

function buildBookedDatesMap() {
  pcBookedDates = {};
  allBK.forEach(bk => {
    if (bk.status === 'cancelled') return;
    const ci = bk.checkIn || bk.checkin;
    const co = bk.checkOut || bk.checkout;
    if (!ci || !co) return;
    const start = new Date(ci + 'T00:00:00');
    const end = new Date(co + 'T00:00:00');
    for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
      const iso = d.toISOString().split('T')[0];
      pcBookedDates[iso] = true;
    }
  });
}

async function renderPricingCal() {
  if (!pcOverridesLoaded) await loadPriceOverrides();
  buildBookedDatesMap();

  const titleEl = document.getElementById('pcMonthTitle');
  const gridEl = document.getElementById('pcGrid');
  if (!titleEl || !gridEl) return;

  const y = pcMonth.getFullYear();
  const m = pcMonth.getMonth();
  titleEl.textContent = pcMonth.toLocaleString('default', { month: 'long', year: 'numeric' });

  const firstDay = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();

  let html = '';
  for (let i = 0; i < firstDay; i++) {
    html += '<div class="pc-day empty"></div>';
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dt = new Date(y, m, d);
    const iso = dt.toISOString().split('T')[0];
    const isBooked = !!pcBookedDates[iso];
    const hasOverride = pcOverrides[iso] !== undefined;
    const price = hasOverride ? pcOverrides[iso] : getNightlyRate(dt, 0);
    const isSelected = pcSelectedDate === iso;

    let cls = 'pc-day';
    if (isBooked) cls += ' pc-booked';
    else if (hasOverride) cls += ' pc-override';
    if (isSelected) cls += ' pc-selected';

    const onclick = isBooked ? '' : `onclick="pcSelectDate('${iso}', ${getNightlyRate(dt, 0)})"`;

    html += `<div class="${cls}" ${onclick}>
      <div class="pc-d">${d}</div>
      <div class="pc-p">$${Math.round(price)}</div>
    </div>`;
  }

  gridEl.innerHTML = html;
}

window.pcSelectDate = function (iso, calculatedPrice) {
  pcSelectedDate = iso;
  const panel = document.getElementById('pcEditPanel');
  const titleEl = document.getElementById('pcEditTitle');
  const calcEl = document.getElementById('pcCalcPrice');
  const inputEl = document.getElementById('pcOverrideInput');

  const dt = new Date(iso + 'T00:00:00');
  const dayName = dt.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  titleEl.textContent = dayName;
  calcEl.textContent = '$' + Math.round(calculatedPrice);
  inputEl.value = pcOverrides[iso] !== undefined ? Math.round(pcOverrides[iso]) : '';
  panel.style.display = 'block';

  renderPricingCal();
};

window.pcClearSelection = function () {
  pcSelectedDate = null;
  document.getElementById('pcEditPanel').style.display = 'none';
  renderPricingCal();
};

window.pcSaveOverride = async function () {
  if (!pcSelectedDate) return;
  const input = document.getElementById('pcOverrideInput');
  const price = parseFloat(input.value);
  if (isNaN(price) || price < 0) { alert('Please enter a valid price.'); return; }

  try {
    const res = await fetch('/api/price-overrides', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-password': adminPassword },
      body: JSON.stringify({ overrides: [{ date: pcSelectedDate, price }] }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed');
    pcOverrides[pcSelectedDate] = price;
    renderPricingCal();
  } catch (err) {
    alert('Failed to save: ' + err.message);
  }
};

window.pcClearOverride = async function () {
  if (!pcSelectedDate) return;

  try {
    const res = await fetch('/api/price-overrides', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-password': adminPassword },
      body: JSON.stringify({ overrides: [{ date: pcSelectedDate, price: null }] }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed');
    delete pcOverrides[pcSelectedDate];
    document.getElementById('pcOverrideInput').value = '';
    renderPricingCal();
  } catch (err) {
    alert('Failed to clear: ' + err.message);
  }
};
