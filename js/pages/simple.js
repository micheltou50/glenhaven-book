/* ── pages/simple.js — shared entry for amenities, location, cancellation-policy ── */

import { initNavBurger } from '../ui.js';
import { loadSiteConfig } from '../site-config.js';

document.addEventListener('DOMContentLoaded', async () => {
  initNavBurger();
  await loadSiteConfig();
});
