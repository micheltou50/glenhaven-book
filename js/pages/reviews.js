/* ── pages/reviews.js — reviews.html entry module ── */

import { initNavBurger } from '../ui.js';

document.addEventListener('DOMContentLoaded', () => {
  initNavBurger();
  loadPublicReviews();
});

async function loadPublicReviews() {
  const grid = document.getElementById('reviewsGrid');
  const summary = document.getElementById('ratingSummary');

  try {
    const res = await fetch('/api/reviews');
    const data = await res.json();
    const reviews = data.reviews || [];

    if (!reviews.length) {
      grid.innerHTML = '<p style="text-align:center;color:var(--g400);padding:2rem;">No reviews yet — be the first to stay and share your experience!</p>';
      return;
    }

    // Calculate average rating
    const avg = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
    const avgEl = document.getElementById('avgRating');
    const countEl = document.getElementById('reviewCount');
    const starsEl = document.getElementById('avgStars');
    if (avgEl) avgEl.textContent = avg.toFixed(1);
    if (countEl) countEl.textContent = reviews.length + ' review' + (reviews.length !== 1 ? 's' : '');
    if (starsEl) starsEl.textContent = '★'.repeat(Math.round(avg)) + '☆'.repeat(5 - Math.round(avg));

    // Render cards
    grid.innerHTML = reviews.map(r => {
      const initials = (r.guest_name || '??').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
      const stars = '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating);
      const date = r.stay_date || '';

      return `<div class="rv-card">
        <div class="rv-top">
          <div class="rv-av">${initials}</div>
          <div>
            <div class="rv-name">${r.guest_name}</div>
            <div class="rv-date">${date}</div>
          </div>
          <div class="rv-stars">${stars}</div>
        </div>
        <p class="rv-text">"${r.review_text}"</p>
        <div class="rv-platform">✓ Verified direct guest</div>
      </div>`;
    }).join('');

    if (summary) summary.style.display = 'flex';
  } catch (err) {
    console.error('Failed to load reviews:', err.message);
    grid.innerHTML = '<p style="text-align:center;color:var(--g400);padding:2rem;">Could not load reviews.</p>';
  }
}
