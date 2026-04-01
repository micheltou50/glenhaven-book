/* ── site-config.js — remote config loader ── */

import { CONFIG, LOS_DISCOUNTS, HOLIDAY_PRICES, setHolidayPrices } from './config.js';
import { setEl, shadeColor, hexToRgba } from './utils.js';

let SITE_CONFIG = null;

const CONFIG_CACHE_KEY = 'gh_site_config';
const CONFIG_CACHE_TTL = 60 * 60 * 1000; // 1 hour

// Apply cached config synchronously on first import
(function applyConfigFromCache() {
  try {
    const raw = localStorage.getItem(CONFIG_CACHE_KEY);
    if (!raw) return;
    const cached = JSON.parse(raw);
    if (cached && cached.config) applySiteConfig(cached.config);
  } catch (e) { /* ignore */ }
})();

export function getSiteConfig() {
  return SITE_CONFIG;
}

export async function loadSiteConfig() {
  try {
    const cached = JSON.parse(localStorage.getItem(CONFIG_CACHE_KEY) || 'null');
    if (cached && cached.ts && (Date.now() - cached.ts) < CONFIG_CACHE_TTL && cached.config) {
      SITE_CONFIG = cached.config;
      applySiteConfig(cached.config);
      _fetchSiteConfig(); // background refresh
      return { loaded: true, status: 'ok', fromCache: true };
    }
  } catch (e) { /* ignore */ }

  return _fetchSiteConfig();
}

async function _fetchSiteConfig() {
  try {
    const res = await fetch(CONFIG.CONFIG_URL);
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

    try {
      localStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify({ config: envelope.config, ts: Date.now() }));
    } catch (e) { /* ignore */ }

    SITE_CONFIG = envelope.config;
    applySiteConfig(envelope.config);
    return { loaded: true, status: 'ok' };

  } catch (err) {
    console.warn('[loadSiteConfig] Network error:', err.message);
    return { loaded: false, status: 'error', error: err.message };
  }
}

export function applySiteConfig(cfg) {
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
    if (cfg.pricing.minNights)            Object.assign(CONFIG.MIN_NIGHTS, cfg.pricing.minNights);
    if (cfg.pricing.holidayPrices)        setHolidayPrices({ ...HOLIDAY_PRICES, ...cfg.pricing.holidayPrices });
    if (cfg.pricing.losDiscounts)         Object.assign(LOS_DISCOUNTS, cfg.pricing.losDiscounts);
  }

  // ── Colors — inject CSS variables ──
  if (cfg.colors) {
    const root = document.documentElement;
    const c = cfg.colors;
    if (c.primary) {
      root.style.setProperty('--green',   c.primary);
      root.style.setProperty('--green-d', shadeColor(c.primary, -20));
      root.style.setProperty('--green-l', shadeColor(c.primary, 20));
      root.style.setProperty('--green-p', hexToRgba(c.primary, 0.1));
    }
    if (c.accent) root.style.setProperty('--warm', c.accent);
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

  // ── Booking page header ──
  if (cfg.property) {
    const bkBed = document.getElementById('bkBedrooms');
    const bkMx  = document.getElementById('bkMaxGuests');
    if (bkBed && cfg.property.bedrooms != null) bkBed.textContent = cfg.property.bedrooms;
    if (bkMx  && cfg.property.guests   != null) bkMx.textContent  = cfg.property.guests;
  }

  // ── Browser tab title ──
  if (cfg.property && cfg.property.name) {
    if (!document.title.startsWith(cfg.property.name)) {
      document.title = cfg.property.name + ' — ' + document.title.split('—').slice(1).join('—').trim();
    }
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
