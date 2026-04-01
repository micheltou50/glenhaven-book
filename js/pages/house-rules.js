/* ── pages/house-rules.js — house-rules.html entry module ── */

import { loadSiteConfig, getSiteConfig } from '../site-config.js';
import { initNavBurger } from '../ui.js';

function renderHouseRules(cfg) {
  const hr = (cfg && cfg.houseRules) || {};
  const ci = document.getElementById('timeCheckin');
  const co = document.getElementById('timeCheckout');
  if (ci && hr.checkin)  ci.textContent = hr.checkin;
  if (co && hr.checkout) co.textContent = hr.checkout;

  const cats = [
    { id: 'rulesGeneral', key: 'general' },
    { id: 'rulesNoise',   key: 'noise' },
    { id: 'rulesSmoking', key: 'smoking' },
    { id: 'rulesPets',    key: 'pets' },
  ];
  cats.forEach(c => {
    const el = document.getElementById(c.id);
    if (!el || !hr[c.key] || !hr[c.key].length) return;
    el.innerHTML = hr[c.key].map(r => '<li><span class="ri">✓</span>' + r + '</li>').join('');
  });
}

loadSiteConfig().then(() => {
  const cfg = getSiteConfig();
  if (cfg) renderHouseRules(cfg);
});

document.addEventListener('DOMContentLoaded', () => initNavBurger());
