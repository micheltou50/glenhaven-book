/* ── pages/gallery.js — gallery.html entry module ── */

import { initNavBurger } from '../ui.js';
import { loadSiteConfig, getSiteConfig } from '../site-config.js';

let galleryPhotos = [];
let lbIdx = 0;

function buildGallery() {
  const cfg = getSiteConfig();
  const photos = (cfg && cfg.photos) || [];
  if (!photos.length) return;

  galleryPhotos = photos;
  const grid = document.getElementById('galleryGrid');
  if (!grid) return;

  grid.innerHTML = photos.map((url, i) => {
    const isBig = i === 0 || (i > 0 && i % 5 === 0);
    return `<div class="photo-card${isBig ? ' big' : ''}" onclick="openLightbox(${i})">
      <img src="${url}" alt="Photo ${i + 1}" loading="lazy"/>
    </div>`;
  }).join('');
}

function openLightbox(i) {
  if (!galleryPhotos.length) return;
  lbIdx = i;
  document.getElementById('lbImg').src = galleryPhotos[i];
  document.getElementById('lightbox').classList.add('open');
}

function closeLightbox() {
  document.getElementById('lightbox').classList.remove('open');
}

function lbShift(d) {
  if (!galleryPhotos.length) return;
  lbIdx = (lbIdx + d + galleryPhotos.length) % galleryPhotos.length;
  document.getElementById('lbImg').src = galleryPhotos[lbIdx];
}

// Expose for inline onclick handlers
window.openLightbox = openLightbox;
window.closeLightbox = closeLightbox;
window.lbShift = lbShift;

document.getElementById('lightbox').addEventListener('click', e => {
  if (e.target === document.getElementById('lightbox')) closeLightbox();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeLightbox();
  if (e.key === 'ArrowLeft') lbShift(-1);
  if (e.key === 'ArrowRight') lbShift(1);
});

document.addEventListener('DOMContentLoaded', async () => {
  initNavBurger();
  await loadSiteConfig();
  buildGallery();
});
