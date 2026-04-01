/* ── pages/contact.js — contact.html entry module ── */

import { loadSiteConfig } from '../site-config.js';
import { initNavBurger } from '../ui.js';

loadSiteConfig();

window.submitContact = function () {
  const name    = document.getElementById('cfName').value.trim();
  const email   = document.getElementById('cfEmail').value.trim();
  const topic   = document.getElementById('cfTopic').value;
  const message = document.getElementById('cfMessage').value.trim();

  if (!name || !email || !message) {
    alert('Please fill in your name, email, and message.');
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    alert('Please enter a valid email address.');
    return;
  }

  const btn = document.getElementById('cfBtn');
  btn.textContent = 'Sending…';
  btn.disabled = true;

  fetch('/api/contact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, topic: topic || 'General', message }),
  }).then(() => {
    document.getElementById('cfSuccess').style.display = 'block';
    btn.style.display = 'none';
  }).catch(() => {
    document.getElementById('cfSuccess').innerHTML =
      'Thanks! If you do not hear back within 24 hours, please email us directly at ' +
      '<a href="mailto:micheltou50@gmail.com" style="color:var(--green);">micheltou50@gmail.com</a>';
    document.getElementById('cfSuccess').style.display = 'block';
    btn.style.display = 'none';
  });
};

document.addEventListener('DOMContentLoaded', () => initNavBurger());
