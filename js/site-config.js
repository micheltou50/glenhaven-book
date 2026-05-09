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

  // ── Design — fonts, radius, buttons, navbar ──
  if (cfg.design) {
    const d = cfg.design, root = document.documentElement;

    if (d.fontHeading) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(d.fontHeading)}:wght@400;600;700;800&display=swap`;
      document.head.appendChild(link);
      root.style.setProperty('--font-heading', `'${d.fontHeading}', serif`);
      document.querySelectorAll('h1,h2,h3').forEach(el => el.style.fontFamily = `'${d.fontHeading}', serif`);
    }

    if (d.fontBody) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(d.fontBody)}:wght@400;500;600;700&display=swap`;
      document.head.appendChild(link);
      document.body.style.fontFamily = `'${d.fontBody}', sans-serif`;
    }

    if (d.radius) {
      const radiusMap = { sharp: '0px', subtle: '4px', rounded: '12px', pill: '20px' };
      const r = radiusMap[d.radius];
      if (r) { root.style.setProperty('--r-sm', r === '0px' ? '0px' : `${Math.max(parseInt(r) - 6, 0)}px`); root.style.setProperty('--r', r); root.style.setProperty('--r-lg', `${parseInt(r) + 4}px`); root.style.setProperty('--r-xl', `${parseInt(r) + 12}px`); }
    }

    if (d.btnStyle) {
      const btnRadiusMap = { pill: '9999px', rounded: '8px', square: '2px' };
      const br = btnRadiusMap[d.btnStyle];
      if (br) root.style.setProperty('--r-full', br);
    }

    if (d.navStyle) {
      const nav = document.querySelector('.navbar');
      if (nav) {
        if (d.navStyle === 'dark') { nav.style.background = '#111'; nav.style.borderBottom = 'none'; nav.querySelectorAll('.nav-links a:not(.nav-cta)').forEach(a => a.style.color = 'rgba(255,255,255,.7)'); const logo = nav.querySelector('.nav-logo'); if (logo) logo.style.color = '#fff'; }
        else if (d.navStyle === 'transparent') { nav.style.background = 'transparent'; nav.style.borderBottom = 'none'; }
      }
    }
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
    // Meta description
    if (cfg.property.description) {
      const metaEl = document.getElementById('siteMetaDesc') || document.querySelector('meta[name="description"]');
      if (metaEl) metaEl.setAttribute('content', cfg.property.description);
    }
    // Page title updates
    if (cfg.property.name) {
      const bookTitle = document.getElementById('siteBookTitle');
      if (bookTitle) bookTitle.textContent = 'Book — ' + cfg.property.name;
      const thumbAlt = document.getElementById('siteThumbAlt');
      if (thumbAlt) thumbAlt.alt = cfg.property.name;
    }
    // Rating
    if (cfg.property.rating != null) {
      const r = parseFloat(cfg.property.rating);
      const full = Math.floor(r);
      const stars = '★'.repeat(full) + (r % 1 >= 0.5 ? '★' : '') + '☆'.repeat(5 - Math.ceil(r));
      setEl('siteRating', r.toFixed(1) + '★');
      const starsEl = document.getElementById('siteStarsDisplay');
      if (starsEl) starsEl.innerHTML = stars.slice(0,5) + ` <span style="font-size:.8rem;font-weight:500;color:var(--g500);">${r.toFixed(1)}</span>`;
      // Booking sidebar rating
      const bookRating = document.getElementById('siteBookRating');
      if (bookRating) bookRating.textContent = stars.slice(0,5);
    }
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
    const parts = document.title.split('—').map(s => s.trim());
    const isHomepage = window.location.pathname === '/' || window.location.pathname.endsWith('/index.html') || window.location.pathname.endsWith('/index');
    if (isHomepage) {
      // Homepage: "PropertyName — Tagline"
      const tagline = cfg.property.tagline || parts.slice(1).join(' — ');
      document.title = cfg.property.name + (tagline ? ' — ' + tagline : '');
    } else if (parts.length >= 2) {
      // Subpages: "Page — PropertyName"
      document.title = parts[0] + ' — ' + cfg.property.name;
    } else if (!document.title.includes(cfg.property.name)) {
      document.title = cfg.property.name;
    }
  }

  // ── Nav logo ──
  if (cfg.property && cfg.property.name) {
    document.querySelectorAll('.nav-logo').forEach(el => {
      el.innerHTML = cfg.property.name;
    });
  }

  // ── Hero description ──
  setEl('siteHeroDesc', cfg.hero && cfg.hero.description);

  // ── Story section ──
  if (cfg.story) {
    setEl('siteStoryEyebrow', cfg.story.eyebrow);
    setEl('siteStoryHeading', cfg.story.heading);
    setEl('siteStoryQuote', cfg.story.blockquote);
    setEl('siteStoryNearby', cfg.story.nearby);
    const badgeEl = document.getElementById('siteStoryBadges');
    if (badgeEl && cfg.story.badges && cfg.story.badges.length) {
      badgeEl.innerHTML = cfg.story.badges.map(b => `<span class="badge badge-green">${b}</span>`).join('');
    }
  }

  // ── Highlights ──
  if (cfg.highlights && cfg.highlights.length) {
    const hlEl = document.getElementById('siteHighlights');
    if (hlEl) {
      hlEl.innerHTML = cfg.highlights.map(h =>
        `<div class="hl-card reveal"><span class="hl-icon">${h.icon}</span><h3>${h.title}</h3><p>${h.description}</p></div>`
      ).join('');
    }
  }

  // ── Amenities page ──
  if (cfg.amenities && cfg.amenities.length) {
    const amEl = document.getElementById('siteAmenities');
    if (amEl) {
      // Support both categorized array and legacy flat array
      if (typeof cfg.amenities[0] === 'string') {
        amEl.innerHTML = `<div class="am-cat"><h3>✅ Amenities</h3><div class="am-grid-full">${cfg.amenities.map(a => `<div class="am-item"><span class="am-icon">✓</span>${a}</div>`).join('')}</div></div>`;
      } else {
        amEl.innerHTML = cfg.amenities.map(cat => {
          const catIcon = cat.category.match(/^\p{Emoji}/u)?.[0] || '';
          const catName = cat.category.replace(/^\p{Emoji}\s*/u, '');
          return `<div class="am-cat"><h3>${catIcon ? catIcon + ' ' : ''}${catName}</h3><div class="am-grid-full">${(cat.items || []).map(item => {
            const icon = item.match(/^\p{Emoji}/u)?.[0] || '✓';
            const name = item.replace(/^\p{Emoji}\s*/u, '');
            return `<div class="am-item"><span class="am-icon">${icon}</span>${name}</div>`;
          }).join('')}</div></div>`;
        }).join('');
      }
      // Update amenity count
      const total = typeof cfg.amenities[0] === 'string' ? cfg.amenities.length : cfg.amenities.reduce((s, c) => s + (c.items || []).length, 0);
      document.querySelectorAll('#siteAmenityCount').forEach(el => el.textContent = total);
    } else {
      // No amenities grid on this page, just update count
      const total = typeof cfg.amenities[0] === 'string' ? cfg.amenities.length : cfg.amenities.reduce((s, c) => s + (c.items || []).length, 0);
      document.querySelectorAll('#siteAmenityCount').forEach(el => el.textContent = total);
    }
  }

  // ── Footer ──
  if (cfg.footer) {
    setEl('siteFooterTagline', cfg.footer.tagline);
    setEl('siteFooterCopyright', cfg.footer.copyright);
  }

  // ── Contact page ──
  if (cfg.contact) {
    setEl('siteContactHeading', cfg.contact.heading);
    setEl('siteContactSub', cfg.contact.subtitle);
    setEl('siteContactLocation', cfg.contact.location);
    setEl('siteContactResponse', cfg.contact.responseTime);
    const emailEl = document.getElementById('siteContactEmail');
    if (emailEl && cfg.contact.email) {
      emailEl.textContent = cfg.contact.email;
      emailEl.href = 'mailto:' + cfg.contact.email;
    }
  }

  // ── Location page ──
  if (cfg.location) {
    setEl('siteLocHeading', cfg.location.heading);
    setEl('siteLocSub', cfg.location.subtitle);
    setEl('siteLocDesc', cfg.location.description);
    setEl('siteLocMapCaption', cfg.location.mapCaption);
    const mapEl = document.getElementById('siteLocMap');
    if (mapEl && cfg.location.mapUrl) mapEl.src = cfg.location.mapUrl;

    const placesEl = document.getElementById('siteLocPlaces');
    if (placesEl && cfg.location.places && cfg.location.places.length) {
      placesEl.innerHTML = cfg.location.places.map(p =>
        `<div class="loc-place"><span class="loc-name">${p.icon} ${p.name}</span><span class="loc-dist">${p.distance}</span></div>`
      ).join('');
    }

    const transEl = document.getElementById('siteLocTransport');
    if (transEl && cfg.location.transport && cfg.location.transport.length) {
      transEl.innerHTML = cfg.location.transport.map(t =>
        `<div class="transport-card"><h4>${t.icon} ${t.title}</h4><p>${t.description}</p></div>`
      ).join('');
    }

    const tdEl = document.getElementById('siteLocThingsToDo');
    if (tdEl && cfg.location.thingsToDo && cfg.location.thingsToDo.length) {
      tdEl.innerHTML = cfg.location.thingsToDo.map(cat => {
        let html = `<div class="td-section"><div class="td-cat"><div class="td-cat-icon" style="background:${cat.bgColor}">${cat.icon}</div><div class="td-cat-label" style="color:${cat.labelColor}">${cat.category}</div></div><div class="td-grid">`;
        html += (cat.items || []).map(it =>
          `<div class="td-card"><div class="td-name">${it.name}</div><p class="td-desc">${it.description}</p><div class="td-meta">${(it.meta || []).map(m => `<span>${m}</span>`).join('')}</div></div>`
        ).join('');
        html += '</div>';
        if (cat.tip) html += `<div class="td-tip"><div class="td-tip-label">${cat.tip.label}</div><p class="td-tip-text">${cat.tip.text}</p></div>`;
        html += '</div>';
        return html;
      }).join('');
    }
  }

  // ── Photos ──
  if (cfg.photos && cfg.photos.length) {
    const propName = cfg.property?.name || '';
    document.querySelectorAll('[data-site-photo]').forEach(el => {
      const idx = parseInt(el.dataset.sitePhoto) || 0;
      if (cfg.photos[idx]) {
        el.src = cfg.photos[idx];
        if (propName && el.alt) el.alt = el.alt.replace(/Glenhaven/gi, propName);
      }
    });
  }
}
