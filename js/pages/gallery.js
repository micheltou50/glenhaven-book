/* ── pages/gallery.js — gallery.html entry module ── */

import { initNavBurger } from '../ui.js';

const LB_IMGS = [
  'https://a0.muscache.com/im/pictures/hosting/Hosting-1615699566549279350/original/b23b9d94-f89b-4e33-8c48-7c955fb81de4.jpeg',
  'https://a0.muscache.com/im/pictures/hosting/Hosting-1615699566549279350/original/ad8fb841-e3b8-4e56-a607-7643edf4f0f2.jpeg',
  'https://a0.muscache.com/im/pictures/hosting/Hosting-1615699566549279350/original/a0769fd7-6ef6-4f85-a370-96ccaf0b05fc.jpeg',
  'https://a0.muscache.com/im/pictures/hosting/Hosting-1615699566549279350/original/6b2084ae-8865-422c-be93-2d5fa06042e6.jpeg',
  'https://a0.muscache.com/im/pictures/hosting/Hosting-1615699566549279350/original/3e22052f-39b3-4bd4-8541-7651b393f8d0.jpeg',
];

let lbIdx = 0;

function openLightbox(i) {
  lbIdx = i;
  document.getElementById('lbImg').src = LB_IMGS[i];
  document.getElementById('lightbox').classList.add('open');
}

function closeLightbox() {
  document.getElementById('lightbox').classList.remove('open');
}

function lbShift(d) {
  lbIdx = (lbIdx + d + LB_IMGS.length) % LB_IMGS.length;
  document.getElementById('lbImg').src = LB_IMGS[lbIdx];
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

document.addEventListener('DOMContentLoaded', () => initNavBurger());
