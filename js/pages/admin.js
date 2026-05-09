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
  hero: { headline:'Blue Mountains\nCottage Escape', subheadline:'📍 Katoomba · Blue Mountains · NSW Australia', description:'A peaceful 2-storey timber retreat minutes from the Three Sisters. Fireplace, conservatory, private garden — the perfect mountain getaway.' },
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
  amenities:[
    { category:'🏡 Living Spaces', items:['🔥 Wood fireplace','🌿 Glass conservatory','📺 Smart TV (55")','📻 Bluetooth speaker','🎲 Board games','📚 Book library','🪑 Dining table (seats 10)','🛋️ Large sofa'] },
    { category:'🍳 Kitchen & Dining', items:['🍳 Full kitchen','☕ Coffee maker (espresso)','🍵 Kettle','🥂 Wine glasses','🍽️ Full crockery set','🔪 Chef\'s knife set','🧊 Large fridge/freezer','♨️ Oven & stovetop','🍞 Toaster'] },
    { category:'🛏️ Bedrooms (4)', items:['🛏️ Master: Queen bed','🛏️ Bedroom 2: Queen bed','🛏️ Bedroom 3: Queen bed','🛏️ Bedroom 4: 2x Single beds','🪴 Bedside tables & lamps','🧺 Wardrobe in each room','🪟 Block-out curtains','🌡️ Heating in all rooms'] },
    { category:'🚿 Bathrooms (2.5)', items:['🛁 Freestanding bath','🚿 Rainfall shower','🚿 Second shower (ensuite)','🪥 Hairdryer','🧴 Shampoo & conditioner','🧼 Body wash & soap','🧻 Towels provided'] },
    { category:'🌳 Outdoor', items:['🏡 Private garden','🪑 Outdoor dining table','🔥 BBQ / grill','🌿 Lawn area','🚗 Free off-street parking (2 cars)','🌳 Mature trees & shade','💡 Outdoor lighting'] },
    { category:'⚙️ Essentials & Technology', items:['📶 Fast WiFi (100+ Mbps)','🔐 Smart lock / self check-in','🌡️ Central heating','🫧 Washer & dryer','🔌 EV charger (7kW)','🧯 Fire extinguisher','🔋 Smoke & CO detectors','🩹 First aid kit'] },
  ],
  story: {
    eyebrow: 'Our Story',
    heading: 'A cottage that feels like home',
    blockquote: '"Tucked away on a quiet Katoomba street, Glenhaven was lovingly restored to preserve the warmth and character of its original timber bones — while adding every modern comfort a family could wish for."',
    nearby: 'Everything you need is within reach — the Three Sisters, Echo Point, Katoomba\'s cafés and galleries, the Scenic Railway — all just minutes away.',
    badges: ['Self check-in', 'Smart lock', 'PID-STRA-82540'],
  },
  highlights: [
    { icon: '🔥', title: 'Wood Fireplace', description: 'Cosy up beside a crackling real wood fire after a day in the mountains.' },
    { icon: '🌿', title: 'Conservatory', description: 'Sun-drenched glass room perfect for morning coffee surrounded by greenery.' },
    { icon: '🌲', title: 'Quiet Location', description: 'Peaceful street away from traffic — just birdsong and mountain air.' },
    { icon: '🏡', title: 'Private Garden', description: 'Expansive outdoor space and entertaining area for the whole group.' },
    { icon: '🏔️', title: 'Iconic Views', description: '10 minutes from the Three Sisters, Echo Point and all the best lookouts.' },
    { icon: '🔐', title: 'Smart Lock', description: 'Self check-in any time — a door code is sent before your arrival.' },
  ],
  policy: {
    heading: 'Book with confidence',
    subtitle: 'We understand plans change. Our policy is designed to be fair to both guests and hosts.',
    cards: [
      { icon: '✅', title: 'Full refund', description: 'Cancel within 48 hours of booking (if check-in is 14+ days away)' },
      { icon: '🔒', title: 'No refund', description: 'All other cancellations are non-refundable, including no-shows' },
      { icon: '🛡️', title: 'Host cancellation', description: 'If the host cancels, you receive a 100% full refund automatically' },
    ],
    timeline: [
      { color: 'green', tag: 'Full refund', title: 'Within 48 hours of booking', description: 'Cancel within 48 hours of making your reservation for a 100% refund, as long as check-in is at least 14 days away. Refund processed within 5–10 business days to your original payment method.' },
      { color: 'red', tag: 'No refund', title: 'All other cancellations', description: 'Cancellations made after the 48-hour window, or when check-in is less than 14 days away, are non-refundable. This includes no-shows and early departures.' },
    ],
    faq: [
      { question: 'How do I cancel my booking?', answer: 'Email us with your booking reference and we\'ll process the cancellation promptly. You can also use the cancel link in your booking confirmation email.' },
      { question: 'How long does a refund take?', answer: 'Refunds are processed within 2 business days of your cancellation request. Depending on your bank, funds typically appear within 5–10 business days.' },
      { question: 'What if I need to change my dates instead of cancelling?', answer: 'Date changes are treated as a cancellation of the original booking and a new booking. If your original booking qualifies for a full refund, we\'ll apply the full amount to your new booking.' },
      { question: 'What if the host needs to cancel my booking?', answer: 'In the rare event that we need to cancel, you will receive a 100% full refund regardless of how close to your check-in date. We will also do our best to find alternative accommodation.' },
      { question: 'Is travel insurance recommended?', answer: 'Yes — we always recommend travel insurance for unexpected situations like illness, flight cancellations, or family emergencies. Our cancellation policy is fixed, but travel insurance can cover circumstances outside our policy window.' },
    ],
  },
  footer: {
    tagline: 'A peaceful timber cottage in Katoomba, Blue Mountains. Book direct and save on platform fees.',
    copyright: '© 2025 Glenhaven · Katoomba, NSW, Australia · PID-STRA-82540',
  },
  contact: {
    heading: "We'd love to hear from you",
    subtitle: 'Questions about the property, a booking, or just want to say hello — we usually respond within a few hours.',
    email: 'info@stayops.com.au',
    location: 'Katoomba, NSW 2780\nBlue Mountains, Australia',
    responseTime: 'We typically respond within 2–4 hours during business hours (9am–8pm AEST).',
  },
  location: {
    heading: 'Heart of the Blue Mountains',
    subtitle: 'Katoomba, NSW 2780 · ~1.5 hrs from Sydney CBD',
    description: 'Glenhaven sits in a quiet residential pocket of Katoomba — peaceful enough to fully unwind, close enough to access everything on your list.',
    mapUrl: 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3317.8!2d150.3124!3d-33.7142!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x6b0ce94dc8fc7bab%3A0xc46c02a87bb4a9b7!2sKatoomba%20NSW%202780!5e0!3m2!1sen!2sau&markers=color:red%7C-33.7142,150.3124',
    mapCaption: '📍 Katoomba, NSW 2780 · Exact address provided after booking is confirmed.',
    places: [
      { icon: '🏔️', name: 'Three Sisters Lookout', distance: '8 min drive' },
      { icon: '🌅', name: 'Echo Point', distance: '10 min drive' },
      { icon: '☕', name: 'Katoomba Town Centre', distance: '5 min drive' },
      { icon: '🌲', name: 'Blue Mountains National Park', distance: '10 min drive' },
      { icon: '🚂', name: 'Katoomba Train Station', distance: '6 min drive' },
      { icon: '🎢', name: 'Scenic World', distance: '12 min drive' },
      { icon: '🍷', name: 'Leura Village', distance: '8 min drive' },
      { icon: '🌊', name: 'Wentworth Falls', distance: '15 min drive' },
      { icon: '🌆', name: 'Sydney CBD', distance: '~1.5 hr drive' },
    ],
    transport: [
      { icon: '🚗', title: 'By car', description: 'Take the Western Motorway (M4) from Sydney. Journey time ~90 minutes. Free off-street parking for 2 cars.' },
      { icon: '🚂', title: 'By train', description: 'Blue Mountains Line from Central Station to Katoomba. Trains run hourly. Journey ~2 hours.' },
      { icon: '🚌', title: 'Local bus', description: 'Blue Mountains Bus Company connects Katoomba to major sights. Bus stop 3 min walk from property.' },
      { icon: '✈️', title: 'By air', description: 'Sydney Airport (SYD) is ~2 hrs away by car. Hire car recommended for exploring the mountains.' },
    ],
    thingsToDo: [
      { category: 'Walks and hikes', icon: '🥾', bgColor: '#ecf5e0', labelColor: 'var(--green-d)', items: [
        { name: 'Three Sisters walk', description: 'The iconic lookout and walk — start at Echo Point, descend the Giant Stairway (800+ steps) through rainforest. Stunning.', meta: ['⏱ 2-3 hrs','▲ Moderate','8 min drive'] },
        { name: 'Prince Henry Cliff Walk', description: 'Spectacular clifftop trail connecting Echo Point to Gordon Falls Lookout. Multiple lookouts along the way.', meta: ['⏱ 1.5 hrs','▲ Easy-moderate','10 min drive'] },
        { name: 'Wentworth Falls circuit', description: 'Valley of the Waters — lush fern gullies, waterfalls, and a swimming hole at the base. Best after rain.', meta: ['⏱ 3-4 hrs','▲ Moderate-hard','15 min drive'] },
        { name: 'Grand Canyon track', description: 'Loop trail through a mossy slot canyon near Blackheath. Feels like another world. Family-friendly pace possible.', meta: ['⏱ 3 hrs','▲ Moderate','20 min drive'] },
      ], tip: { label: 'Host tip', text: 'Start walks early — carparks at Echo Point fill by 10 AM on weekends. Pack layers; it\'s always a few degrees cooler on the cliff edge.' } },
      { category: 'Eat and drink', icon: '☕', bgColor: '#fef3e2', labelColor: '#7c4a0b', items: [
        { name: 'The Yellow Deli', description: 'Rustic cafe with handmade bread, hearty soups and incredible mate lattes. Unlike anywhere else. Worth the queue.', meta: ['Katoomba','5 min drive'] },
        { name: 'Leura Garage', description: 'Wood-fired pizzas and cocktails in a converted mechanic\'s garage. Great vibe for dinner.', meta: ['Leura','8 min drive'] },
        { name: 'Silk\'s Brasserie', description: 'Fine dining in Leura. Modern Australian with local produce. Book ahead on weekends.', meta: ['Leura','8 min drive'] },
        { name: 'Anonymous Cafe', description: 'Katoomba local favourite for breakfast. Great coffee, big portions, relaxed atmosphere.', meta: ['Katoomba','5 min drive'] },
      ] },
      { category: 'Family activities', icon: '🎪', bgColor: '#e8effe', labelColor: '#1e3a6e', items: [
        { name: 'Scenic World', description: 'Scenic Railway (steepest in the world), Skyway, Cableway, and Walkway. Kids love it. Half-day easy.', meta: ['⏱ Half day','12 min drive'] },
        { name: 'Everglades Gardens', description: 'Stunning 1930s heritage garden in Leura. Peaceful, beautiful any season. Picnic-friendly.', meta: ['⏱ 1-2 hrs','8 min drive'] },
        { name: 'Blue Mountains Cultural Centre', description: 'Gallery and exhibitions about the World Heritage area. Free entry. Rainy day winner.', meta: ['⏱ 1 hr','5 min drive'] },
        { name: 'Leuralla Toy Museum', description: 'Huge private collection of vintage toys, trains, and dolls in a gorgeous garden setting. Kids and nostalgic adults alike.', meta: ['⏱ 1-2 hrs','10 min drive'] },
      ], tip: { label: 'Rainy day?', text: 'Light the fireplace, play the board games in the living room, and cook something warm in the kitchen. Some of our best reviews mention doing absolutely nothing.' } },
      { category: 'Day trips', icon: '🍷', bgColor: '#f0edfe', labelColor: '#3C3489', items: [
        { name: 'Jenolan Caves', description: 'Ancient limestone caves with guided tours. The drive there through the mountains is spectacular in itself.', meta: ['⏱ Full day','1 hr drive'] },
        { name: 'Megalong Valley', description: 'Horse riding, farm stays, and wide-open valley views. A completely different side of the mountains.', meta: ['⏱ Half day','25 min drive'] },
      ] },
    ],
  },
};

function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

// ── BOOKINGS FROM SERVER ─────────────────────────────────────
let allBK = [], fText = '', fStat = '';
let sortCol = 'checkIn', sortAsc = false;

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
window.doLogin = async function () {
  const pwd = document.getElementById('loginPwd').value.trim();
  if (!pwd) return;
  const btn = document.getElementById('loginBtn');
  btn.disabled = true; btn.textContent = 'Checking…';
  try {
    const res = await fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-password': pwd }, body: '{"_ping":true}' });
    if (res.status === 401) {
      alert('Incorrect password');
      btn.disabled = false; btn.textContent = 'Login';
      return;
    }
  } catch (e) {
    // Network error — allow offline access, password will be checked on publish
  }
  adminPassword = pwd;
  sessionStorage.setItem(ADMIN_PWD_KEY, pwd);
  document.getElementById('loginOverlay').style.display = 'none';
  btn.disabled = false; btn.textContent = 'Login';
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
  setVal('eName', p.name); setVal('eTagline', p.tagline); setVal('eHeroHeadline', h.headline); setVal('eHeroSub', h.subheadline); setVal('eHeroDesc', h.description);
  setVal('eDescription', p.description); setVal('eBedrooms', p.bedrooms); setVal('eBathrooms', p.bathrooms); setVal('eMaxGuests', p.guests); setVal('eRating', p.rating);
  // Hero photo
  if (h.photoUrl) setVal('eHeroPhoto', h.photoUrl);
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
  const ld = pr.losDiscounts || {};
  setVal('pLos3', ld.nights3); setVal('pLos5', ld.nights5); setVal('pLos7', ld.nights7);
  if (c.primary) { document.getElementById('cPrimary').value = c.primary; document.getElementById('cPrimaryHex').value = c.primary; }
  if (c.accent)  { document.getElementById('cAccent').value = c.accent;   document.getElementById('cAccentHex').value = c.accent; }
  renderPhotos(cfg.photos || []);
  renderAmenities(cfg.amenities || []);
  // Story
  const st = cfg.story || {};
  setVal('eStoryEyebrow', st.eyebrow); setVal('eStoryHeading', st.heading);
  setVal('eStoryQuote', st.blockquote); setVal('eStoryNearby', st.nearby);
  setVal('eStoryBadges', (st.badges || []).join('\n'));
  if (st.photoUrl) setVal('eStoryPhoto', st.photoUrl);
  // Highlights
  renderHighlights(cfg.highlights || []);
  // Footer
  const ft = cfg.footer || {};
  setVal('eFooterTagline', ft.tagline); setVal('eFooterCopyright', ft.copyright);
  // Contact
  const ct = cfg.contact || {};
  setVal('eContactHeading', ct.heading); setVal('eContactSub', ct.subtitle);
  setVal('eContactEmail', ct.email); setVal('eContactLocation', ct.location);
  setVal('eContactResponse', ct.responseTime);
  // Location
  const loc = cfg.location || {};
  setVal('eLocHeading', loc.heading); setVal('eLocSub', loc.subtitle);
  setVal('eLocDesc', loc.description); setVal('eLocMapUrl', loc.mapUrl);
  setVal('eLocMapCaption', loc.mapCaption);
  renderLocPlaces(loc.places || []);
  renderLocTransport(loc.transport || []);
  renderLocThingsToDo(loc.thingsToDo || []);
  // Policy
  _policy = cfg.policy || deepClone(DEFAULT_CONFIG.policy);
  setVal('ePolicyHeading', _policy.heading);
  setVal('ePolicySub', _policy.subtitle);
  // iCal feeds
  renderIcalFeeds(cfg.icalFeeds || []);
  // Design
  const ds = cfg.design || {};
  setVal('dFontHeading', ds.fontHeading || '');
  setVal('dFontBody', ds.fontBody || '');
  setVal('dRadius', ds.radius || '');
  setVal('dBtnStyle', ds.btnStyle || '');
  setVal('dNavStyle', ds.navStyle || '');
  setTimeout(updateDesignPreview, 100);
  // Attach change listeners
  ['eName','eTagline','eHeroHeadline','eHeroSub','eDescription','eBedrooms','eBathrooms','eMaxGuests',
   'pBaseRate','pFriSurcharge','pSatSurcharge','pCleaningFee','pExtraGuest','pBaseGuests','pPeakPct','pLowPct',
   'pXmas','pBoxing','pNYE','pNYD','pGoodFri','pEasterSun','pMinWeekday','pMinWeekend','pMinPeak',
   'eHeroDesc','eStoryEyebrow','eStoryHeading','eStoryQuote','eStoryNearby','eStoryBadges',
   'eFooterTagline','eFooterCopyright',
   'eContactHeading','eContactSub','eContactEmail','eContactLocation','eContactResponse',
   'eLocHeading','eLocSub','eLocDesc','eLocMapUrl','eLocMapCaption'].forEach(id => {
    const el = document.getElementById(id);
    if (el && !el._gl) { el.addEventListener('input', markDirty); el._gl = true; }
  });
}

function readForm() {
  return {
    property: { name: gVal('eName') || 'Property', tagline: gVal('eTagline'), description: gVal('eDescription'), bedrooms: nVal('eBedrooms'), bathrooms: nVal('eBathrooms'), guests: nVal('eMaxGuests'), rating: nVal('eRating') },
    houseRules: {
      checkin: gVal('eCheckin'), checkout: gVal('eCheckout'),
      general: gVal('eRulesGeneral').split('\n').map(s => s.trim()).filter(Boolean),
      noise:   gVal('eRulesNoise').split('\n').map(s => s.trim()).filter(Boolean),
      smoking: gVal('eRulesSmoking').split('\n').map(s => s.trim()).filter(Boolean),
      pets:    gVal('eRulesPets').split('\n').map(s => s.trim()).filter(Boolean),
    },
    hero: { headline: gVal('eHeroHeadline'), subheadline: gVal('eHeroSub'), description: gVal('eHeroDesc'), photoUrl: gVal('eHeroPhoto') || null },
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
    story: {
      eyebrow: gVal('eStoryEyebrow'), heading: gVal('eStoryHeading'),
      blockquote: gVal('eStoryQuote'), nearby: gVal('eStoryNearby'),
      badges: gVal('eStoryBadges').split('\n').map(s => s.trim()).filter(Boolean),
      photoUrl: gVal('eStoryPhoto') || null,
    },
    highlights: currentHighlights(),
    footer: { tagline: gVal('eFooterTagline'), copyright: gVal('eFooterCopyright') },
    contact: {
      heading: gVal('eContactHeading'), subtitle: gVal('eContactSub'),
      email: gVal('eContactEmail'), location: gVal('eContactLocation'),
      responseTime: gVal('eContactResponse'),
    },
    location: {
      heading: gVal('eLocHeading'), subtitle: gVal('eLocSub'),
      description: gVal('eLocDesc'), mapUrl: gVal('eLocMapUrl'),
      mapCaption: gVal('eLocMapCaption'),
      places: currentLocPlaces(),
      transport: currentLocTransport(),
      thingsToDo: currentLocThingsToDo(),
    },
    icalFeeds: currentIcalFeeds(),
    policy: currentPolicy(),
    design: {
      fontHeading: gVal('dFontHeading'),
      fontBody: gVal('dFontBody'),
      radius: gVal('dRadius'),
      btnStyle: gVal('dBtnStyle'),
      navStyle: gVal('dNavStyle'),
    },
  };
}

// ── POLICY ──────────────────────────────────────────────────
let _policy = null;
function currentPolicy() {
  if (!_policy) _policy = deepClone(DEFAULT_CONFIG.policy);
  // Update heading/subtitle from form if fields exist
  const h = document.getElementById('ePolicyHeading');
  const s = document.getElementById('ePolicySub');
  if (h) _policy.heading = h.value;
  if (s) _policy.subtitle = s.value;
  return _policy;
}

// ── PHOTOS ───────────────────────────────────────────────────
let _photos = [];
let _dragIdx = null;
function currentPhotos() { return [..._photos]; }
function renderPhotos(photos) {
  _photos = [...photos];
  const grid = document.getElementById('photoGrid');
  grid.innerHTML = _photos.map((url, i) =>
    `<div class="photo-item" draggable="true" data-idx="${i}"><img src="${url}" draggable="false" onerror="this.parentElement.style.background='var(--g200)'"/><button class="photo-del" onclick="event.stopPropagation();removePhoto(${i})">×</button><div class="photo-idx">${i === 0 ? 'Hero' : '#' + (i + 1)}</div></div>`
  ).join('');
  // attach drag listeners
  grid.querySelectorAll('.photo-item').forEach(el => {
    el.addEventListener('dragstart', (e) => {
      _dragIdx = +el.dataset.idx;
      el.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', _dragIdx);
    });
    el.addEventListener('dragend', () => {
      el.classList.remove('dragging');
      grid.querySelectorAll('.photo-item').forEach(c => c.classList.remove('drag-over'));
      _dragIdx = null;
    });
    el.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (+el.dataset.idx !== _dragIdx) el.classList.add('drag-over');
    });
    el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      el.classList.remove('drag-over');
      const toIdx = +el.dataset.idx;
      if (_dragIdx == null || _dragIdx === toIdx) return;
      const moved = _photos.splice(_dragIdx, 1)[0];
      _photos.splice(toIdx, 0, moved);
      renderPhotos(_photos);
      markDirty();
    });
  });
  // Update photo picker grids for hero and story
  renderPhotoPickerGrid('heroPhotoGrid', 'eHeroPhoto', 'heroPhotoPreview');
  renderPhotoPickerGrid('storyPhotoGrid', 'eStoryPhoto', 'storyPhotoPreview');
}

function renderPhotoPickerGrid(gridId, inputId, previewId) {
  const grid = document.getElementById(gridId);
  const input = document.getElementById(inputId);
  const preview = document.getElementById(previewId);
  if (!grid || !input) return;
  const selected = input.value;
  grid.innerHTML = _photos.map((url, i) => {
    const isSelected = url === selected;
    return `<div style="cursor:pointer;border:3px solid ${isSelected ? 'var(--green)' : 'transparent'};border-radius:var(--r);overflow:hidden;aspect-ratio:4/3;position:relative;" onclick="selectPickerPhoto('${gridId}','${inputId}','${previewId}',${i})">
      <img src="${url}" style="width:100%;height:100%;object-fit:cover;display:block;" />
      ${isSelected ? '<div style="position:absolute;top:4px;right:4px;background:var(--green);color:#fff;width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:.7rem;font-weight:700;">✓</div>' : ''}
    </div>`;
  }).join('');
  // Show preview if a URL is set
  if (preview) {
    if (selected) {
      preview.innerHTML = `<img src="${selected}" style="width:120px;height:80px;object-fit:cover;border-radius:var(--r);border:1px solid var(--g200);" />`;
    } else {
      preview.innerHTML = '<span style="font-size:.8rem;color:var(--g400);">No photo selected — will use default from gallery</span>';
    }
  }
  // Listen for manual URL input changes
  if (!input._pickerBound) {
    input.addEventListener('input', () => {
      renderPhotoPickerGrid(gridId, inputId, previewId);
      markDirty();
    });
    input._pickerBound = true;
  }
}

window.selectPickerPhoto = function(gridId, inputId, previewId, idx) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.value = _photos[idx] || '';
  renderPhotoPickerGrid(gridId, inputId, previewId);
  markDirty();
};

async function uploadFile(file) {
  const signRes = await fetch('/api/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-password': adminPassword },
    body: JSON.stringify({ fileName: file.name }),
  });
  if (!signRes.ok) {
    const err = await signRes.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to get upload URL');
  }
  const { uploadUrl, publicUrl } = await signRes.json();

  const upRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type, 'x-upsert': 'true' },
    body: file,
  });
  if (!upRes.ok) {
    const text = await upRes.text();
    throw new Error('Upload to storage failed: ' + text);
  }
  return publicUrl;
}

async function handlePhotoFiles(files) {
  const valid = [...files].filter(f => ['image/jpeg','image/png','image/webp'].includes(f.type));
  if (!valid.length) return;

  const prog = document.getElementById('photoUploadProgress');
  const bar = document.getElementById('photoProgressBar');
  const status = document.getElementById('photoUploadStatus');
  prog.style.display = 'block';
  bar.style.width = '0%';

  for (let i = 0; i < valid.length; i++) {
    status.textContent = `Uploading ${i + 1} of ${valid.length}…`;
    bar.style.width = `${((i) / valid.length) * 100}%`;
    try {
      const url = await uploadFile(valid[i]);
      _photos.push(url);
      renderPhotos(_photos);
    } catch (e) {
      status.textContent = `Failed: ${valid[i].name}`;
      console.error(e);
    }
  }
  bar.style.width = '100%';
  status.textContent = `${valid.length} photo${valid.length > 1 ? 's' : ''} uploaded`;
  markDirty();
  setTimeout(() => { prog.style.display = 'none'; }, 2000);
}

(function initPhotoDrop() {
  const zone = document.getElementById('photoDropZone');
  const input = document.getElementById('photoFileInput');
  if (!zone || !input) return;

  zone.addEventListener('click', () => input.click());
  input.addEventListener('change', () => { if (input.files.length) handlePhotoFiles(input.files); input.value = ''; });

  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.style.borderColor = 'var(--green)'; zone.style.background = '#ecf5e0'; });
  zone.addEventListener('dragleave', () => { zone.style.borderColor = ''; zone.style.background = ''; });
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.style.borderColor = ''; zone.style.background = '';
    if (e.dataTransfer.files.length) handlePhotoFiles(e.dataTransfer.files);
  });
})();

window.removePhoto = function (i) { _photos.splice(i, 1); renderPhotos(_photos); markDirty(); };

// ── AMENITIES ────────────────────────────────────────────────
let _amenities = [];
function currentAmenities() { return _amenities.map(c => ({ category: c.category, items: [...c.items] })); }
function renderAmenities(list) {
  // Handle legacy flat array format
  if (list.length && typeof list[0] === 'string') {
    _amenities = [{ category: '✅ General', items: [...list] }];
  } else {
    _amenities = list.map(c => ({ category: c.category, items: [...(c.items || [])] }));
  }
  const el = document.getElementById('amenityList');
  const total = _amenities.reduce((s, c) => s + c.items.length, 0);
  el.innerHTML = _amenities.map((cat, ci) =>
    `<div style="border:1px solid var(--g200);border-radius:var(--r);padding:1rem;margin-bottom:.75rem;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.6rem;">
        <input type="text" value="${cat.category}" onchange="renameAmenityCategory(${ci},this.value)" style="font-weight:700;font-size:.9rem;border:none;background:transparent;padding:0;outline:none;flex:1;"/>
        <button class="btn btn-sm btn-white" style="color:#dc2626;border-color:#fca5a5;font-size:.72rem;padding:.2rem .5rem;" onclick="removeAmenityCategory(${ci})">Remove category</button>
      </div>
      <div class="amenity-list">${cat.items.map((a, ai) =>
        `<span class="amenity-tag">${a}<button onclick="removeAmenityItem(${ci},${ai})">×</button></span>`
      ).join('')}</div>
      <div class="amenity-add">
        <input type="text" id="amInput_${ci}" placeholder="e.g. 🔥 Wood fireplace" onkeydown="if(event.key==='Enter')addAmenityItem(${ci})"/>
        <button class="btn btn-sm btn-black" onclick="addAmenityItem(${ci})">Add</button>
      </div>
    </div>`
  ).join('') + `<div style="display:flex;justify-content:space-between;align-items:center;margin-top:.5rem;">
    <button class="btn btn-sm btn-white" onclick="addAmenityCategory()">+ Add Category</button>
    <span style="font-size:.78rem;color:var(--g400);">${total} amenities total</span>
  </div>`;
}
window.addAmenityItem = function (ci) {
  const input = document.getElementById('amInput_' + ci);
  const v = input.value.trim();
  if (!v) return;
  _amenities[ci].items.push(v);
  renderAmenities(_amenities);
  markDirty();
};
window.removeAmenityItem = function (ci, ai) { _amenities[ci].items.splice(ai, 1); renderAmenities(_amenities); markDirty(); };
window.renameAmenityCategory = function (ci, name) { _amenities[ci].category = name; markDirty(); };
window.removeAmenityCategory = function (ci) {
  if (!confirm('Remove this category and all its amenities?')) return;
  _amenities.splice(ci, 1); renderAmenities(_amenities); markDirty();
};
window.addAmenityCategory = function () {
  _amenities.push({ category: '🏠 New Category', items: [] });
  renderAmenities(_amenities); markDirty();
};
// Legacy compat
window.addAmenity = function () {
  const v = document.getElementById('amenityInput')?.value?.trim();
  if (!v) return;
  if (!_amenities.length) _amenities.push({ category: '✅ General', items: [] });
  _amenities[0].items.push(v);
  renderAmenities(_amenities);
  if (document.getElementById('amenityInput')) document.getElementById('amenityInput').value = '';
  markDirty();
};
window.removeAmenity = function (i) { /* legacy noop */ };

// ── HIGHLIGHTS ──────────────────────────────────────────────
let _highlights = [];
function currentHighlights() { return _highlights.map(h => ({...h})); }
function renderHighlights(list) {
  _highlights = list.map(h => ({...h}));
  const el = document.getElementById('highlightList');
  if (!el) return;
  el.innerHTML = _highlights.map((h, i) =>
    `<div style="display:flex;align-items:flex-start;gap:.75rem;padding:.85rem;border:1px solid var(--g200);border-radius:var(--r);margin-bottom:.5rem;">
      <span style="font-size:1.5rem;">${h.icon}</span>
      <div style="flex:1;"><strong style="font-size:.88rem;">${h.title}</strong><p style="font-size:.8rem;color:var(--g500);margin:.2rem 0 0;">${h.description}</p></div>
      <button class="t-act" onclick="editHighlight(${i})">Edit</button>
      <button class="t-act" onclick="removeHighlight(${i})">×</button>
    </div>`
  ).join('');
}
window.addHighlight = function () {
  const icon = gVal('hlIcon'), title = gVal('hlTitle'), desc = gVal('hlDesc');
  if (!title) return;
  _highlights.push({ icon: icon || '✨', title, description: desc });
  renderHighlights(_highlights); markDirty();
  ['hlIcon','hlTitle','hlDesc'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
};
window.removeHighlight = function (i) { _highlights.splice(i, 1); renderHighlights(_highlights); markDirty(); };
window.editHighlight = function (i) {
  const h = _highlights[i];
  document.getElementById('hlIcon').value = h.icon;
  document.getElementById('hlTitle').value = h.title;
  document.getElementById('hlDesc').value = h.description;
  _highlights.splice(i, 1); renderHighlights(_highlights); markDirty();
};

// ── LOCATION PLACES ─────────────────────────────────────────
let _locPlaces = [];
function currentLocPlaces() { return _locPlaces.map(p => ({...p})); }
function renderLocPlaces(list) {
  _locPlaces = list.map(p => ({...p}));
  const el = document.getElementById('locPlacesList');
  if (!el) return;
  el.innerHTML = _locPlaces.map((p, i) =>
    `<div style="display:flex;align-items:center;gap:.6rem;padding:.5rem .75rem;border:1px solid var(--g200);border-radius:var(--r);margin-bottom:.35rem;">
      <span>${p.icon}</span><span style="flex:1;font-size:.85rem;font-weight:500;">${p.name}</span><span style="font-size:.8rem;color:var(--g500);">${p.distance}</span>
      <button class="t-act" onclick="removeLocPlace(${i})">×</button>
    </div>`
  ).join('');
}
window.addLocPlace = function () {
  const icon = gVal('lpIcon'), name = gVal('lpName'), dist = gVal('lpDist');
  if (!name) return;
  _locPlaces.push({ icon: icon || '📍', name, distance: dist });
  renderLocPlaces(_locPlaces); markDirty();
  ['lpIcon','lpName','lpDist'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
};
window.removeLocPlace = function (i) { _locPlaces.splice(i, 1); renderLocPlaces(_locPlaces); markDirty(); };

// ── LOCATION TRANSPORT ──────────────────────────────────────
let _locTransport = [];
function currentLocTransport() { return _locTransport.map(t => ({...t})); }
function renderLocTransport(list) {
  _locTransport = list.map(t => ({...t}));
  const el = document.getElementById('locTransportList');
  if (!el) return;
  el.innerHTML = _locTransport.map((t, i) =>
    `<div style="display:flex;align-items:flex-start;gap:.6rem;padding:.65rem .75rem;border:1px solid var(--g200);border-radius:var(--r);margin-bottom:.35rem;">
      <span>${t.icon}</span><div style="flex:1;"><strong style="font-size:.85rem;">${t.title}</strong><p style="font-size:.8rem;color:var(--g500);margin:.15rem 0 0;">${t.description}</p></div>
      <button class="t-act" onclick="removeLocTransport(${i})">×</button>
    </div>`
  ).join('');
}
window.addLocTransport = function () {
  const icon = gVal('ltIcon'), title = gVal('ltTitle'), desc = gVal('ltDesc');
  if (!title) return;
  _locTransport.push({ icon: icon || '🚗', title, description: desc });
  renderLocTransport(_locTransport); markDirty();
  ['ltIcon','ltTitle','ltDesc'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
};
window.removeLocTransport = function (i) { _locTransport.splice(i, 1); renderLocTransport(_locTransport); markDirty(); };

// ── LOCATION THINGS TO DO ───────────────────────────────────
let _locThingsToDo = [];
function currentLocThingsToDo() { return JSON.parse(JSON.stringify(_locThingsToDo)); }
function renderLocThingsToDo(list) {
  _locThingsToDo = JSON.parse(JSON.stringify(list));
  const el = document.getElementById('locTTDList');
  if (!el) return;
  el.innerHTML = _locThingsToDo.map((cat, ci) => {
    let items = (cat.items || []).map((it, ii) =>
      `<div style="display:flex;align-items:flex-start;gap:.5rem;padding:.4rem .6rem;background:var(--g50);border-radius:4px;margin:.25rem 0;">
        <span style="flex:1;font-size:.82rem;"><strong>${it.name}</strong> — ${it.description}</span>
        <button class="t-act" onclick="removeTTDItem(${ci},${ii})">×</button>
      </div>`
    ).join('');
    return `<div style="border:1px solid var(--g200);border-radius:var(--r);padding:1rem;margin-bottom:.75rem;">
      <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.5rem;">
        <span style="font-size:1.2rem;">${cat.icon}</span>
        <strong style="flex:1;">${cat.category}</strong>
        <button class="t-act" onclick="removeTTDCat(${ci})">Remove category</button>
      </div>
      ${items}
      <div style="display:flex;gap:.4rem;margin-top:.5rem;">
        <input type="text" id="ttdName${ci}" placeholder="Place name" style="flex:1;padding:.4rem .6rem;border:1px solid var(--g200);border-radius:4px;font-size:.82rem;">
        <input type="text" id="ttdDesc${ci}" placeholder="Description" style="flex:2;padding:.4rem .6rem;border:1px solid var(--g200);border-radius:4px;font-size:.82rem;">
        <button class="btn btn-sm btn-white" onclick="addTTDItem(${ci})">+ Item</button>
      </div>
      ${cat.tip ? `<div style="margin-top:.5rem;padding:.5rem;background:#ecf5e0;border-radius:4px;font-size:.8rem;"><strong>${cat.tip.label}:</strong> ${cat.tip.text}</div>` : ''}
    </div>`;
  }).join('');
}
window.addTTDCat = function () {
  const cat = gVal('ttdCatName'), icon = gVal('ttdCatIcon');
  if (!cat) return;
  _locThingsToDo.push({ category: cat, icon: icon || '📌', bgColor: '#f0f0f0', labelColor: '#333', items: [] });
  renderLocThingsToDo(_locThingsToDo); markDirty();
  ['ttdCatName','ttdCatIcon'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
};
window.removeTTDCat = function (ci) { _locThingsToDo.splice(ci, 1); renderLocThingsToDo(_locThingsToDo); markDirty(); };
window.addTTDItem = function (ci) {
  const name = gVal('ttdName' + ci), desc = gVal('ttdDesc' + ci);
  if (!name) return;
  _locThingsToDo[ci].items.push({ name, description: desc, meta: [] });
  renderLocThingsToDo(_locThingsToDo); markDirty();
};
window.removeTTDItem = function (ci, ii) { _locThingsToDo[ci].items.splice(ii, 1); renderLocThingsToDo(_locThingsToDo); markDirty(); };

// ── COLORS ───────────────────────────────────────────────────
window.onColorInput = function (type, hex) {
  document.getElementById(type === 'primary' ? 'cPrimaryHex' : 'cAccentHex').value = hex;
  applySiteConfig({ colors: { primary: document.getElementById('cPrimary').value, accent: document.getElementById('cAccent').value } });
  updateDesignPreview();
  markDirty();
};
window.onHexInput = function (type, hex) {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return;
  document.getElementById(type === 'primary' ? 'cPrimary' : 'cAccent').value = hex;
  applySiteConfig({ colors: { primary: document.getElementById('cPrimary').value, accent: document.getElementById('cAccent').value } });
  updateDesignPreview();
  markDirty();
};
window.applyPreset = function (primary, accent) {
  document.getElementById('cPrimary').value = primary; document.getElementById('cPrimaryHex').value = primary;
  document.getElementById('cAccent').value = accent;   document.getElementById('cAccentHex').value = accent;
  applySiteConfig({ colors: { primary, accent } });
  updateDesignPreview();
  markDirty();
};

// ── DESIGN PREVIEW ──────────────────────────────────────────
window.updateDesignPreview = function () {
  const primary = document.getElementById('cPrimary').value;
  const accent = document.getElementById('cAccent').value;
  const fontHeading = document.getElementById('dFontHeading').value;
  const fontBody = document.getElementById('dFontBody').value;
  const radius = document.getElementById('dRadius').value;
  const btnStyle = document.getElementById('dBtnStyle').value;
  const navStyle = document.getElementById('dNavStyle').value;

  const radiusMap = { sharp: '0px', subtle: '4px', rounded: '12px', pill: '20px' };
  const btnRadiusMap = { pill: '9999px', rounded: '8px', square: '2px' };
  const r = radiusMap[radius] || '12px';
  const br = btnRadiusMap[btnStyle] || '9999px';
  const hFont = fontHeading || 'Inter, sans-serif';
  const bFont = fontBody || 'Inter, sans-serif';

  // Load Google Fonts if needed
  const fontsToLoad = [fontHeading, fontBody].filter(f => f && f !== 'Inter');
  fontsToLoad.forEach(f => {
    const id = 'gf-' + f.replace(/\s/g, '-');
    if (!document.getElementById(id)) {
      const link = document.createElement('link');
      link.id = id; link.rel = 'stylesheet';
      link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(f)}:wght@400;600;700;800&display=swap`;
      document.head.appendChild(link);
    }
  });

  // Preview elements
  const nav = document.getElementById('dpNav');
  const logo = document.getElementById('dpLogo');
  const cta = document.getElementById('dpCta');
  const hero = document.getElementById('dpHero');
  const heading = document.getElementById('dpHeading');
  const btnPrimary = document.getElementById('dpBtnPrimary');
  const btnOutline = document.getElementById('dpBtnOutline');
  const card1 = document.getElementById('dpCard1');
  const card2 = document.getElementById('dpCard2');

  if (heading) heading.style.fontFamily = hFont;
  if (btnPrimary) { btnPrimary.style.background = primary; btnPrimary.style.borderRadius = br; btnPrimary.style.fontFamily = bFont; }
  if (btnOutline) { btnOutline.style.color = primary; btnOutline.style.border = `1.5px solid ${primary}`; btnOutline.style.borderRadius = br; btnOutline.style.background = 'transparent'; btnOutline.style.fontFamily = bFont; }
  if (card1) { card1.style.borderRadius = r; card1.style.border = `1px solid var(--g200)`; card1.style.fontFamily = bFont; }
  if (card2) { card2.style.borderRadius = r; card2.style.border = `1px solid var(--g200)`; card2.style.fontFamily = bFont; }
  if (logo) logo.querySelector('em').style.color = primary;
  if (cta) cta.style.borderRadius = br;

  if (nav) {
    if (navStyle === 'dark') { nav.style.background = '#111'; nav.style.color = '#fff'; if (logo) logo.style.color = '#fff'; }
    else if (navStyle === 'transparent') { nav.style.background = 'transparent'; nav.style.border = 'none'; if (logo) logo.style.color = '#111'; }
    else { nav.style.background = '#fff'; nav.style.border = '1px solid var(--g200)'; if (logo) logo.style.color = '#111'; }
  }

  if (hero) hero.style.borderRadius = r;
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
  rows.sort((a, b) => {
    let va, vb;
    if (sortCol === 'nights') {
      va = Math.round((new Date(a.checkOut) - new Date(a.checkIn)) / 86400000) || 0;
      vb = Math.round((new Date(b.checkOut) - new Date(b.checkIn)) / 86400000) || 0;
    } else if (sortCol === 'total') {
      va = a.total || 0; vb = b.total || 0;
    } else if (sortCol === 'guests') {
      va = a.guests || 0; vb = b.guests || 0;
    } else if (sortCol === 'checkIn' || sortCol === 'checkOut') {
      va = a[sortCol] || ''; vb = b[sortCol] || '';
    } else {
      va = (a[sortCol] || '').toString().toLowerCase(); vb = (b[sortCol] || '').toString().toLowerCase();
    }
    if (va < vb) return sortAsc ? -1 : 1;
    if (va > vb) return sortAsc ? 1 : -1;
    return 0;
  });
  tbody.innerHTML = rows.map(b => {
    const n = Math.round((new Date(b.checkOut) - new Date(b.checkIn)) / 86400000) || '?';
    const st = (b.status || 'CONFIRMED').toUpperCase();
    return `<tr><td><strong>${b.guestName || '—'}</strong><br><span style="font-size:.74rem;color:var(--g400);">${b.email || ''}</span></td><td>${fmtDate(b.checkIn)}</td><td>${fmtDate(b.checkOut)}</td><td>${n}</td><td>${b.guests || '—'}</td><td style="font-weight:600;">${fmtAUD(b.total || 0)}</td><td><span class="badge badge-green" style="font-size:.7rem;">${b.platform || 'Direct'}</span></td><td><span class="spill ${st === 'CONFIRMED' ? 's-cfm' : st === 'CANCELLED' ? 's-can' : 's-pen'}">${st}</span></td><td><button class="t-act" onclick="delBooking('${b.id}')">Delete</button></td></tr>`;
  }).join('');
}
window.filterTable = function (v) { fText = v.toLowerCase(); renderTable(); };
window.filterStatus = function (v) { fStat = v; renderTable(); };
window.delBooking = function (id) { if (!confirm('Delete this booking?')) return; deleteBooking(id); allBK = getBookings(); renderStats(); renderTable(); };
window.sortTable = function (col) {
  if (sortCol === col) { sortAsc = !sortAsc; } else { sortCol = col; sortAsc = true; }
  document.querySelectorAll('thead th').forEach(th => { th.classList.remove('sort-active', 'sort-desc'); });
  const ths = document.querySelectorAll('thead th');
  const colMap = ['guestName','checkIn','checkOut','nights','guests','total','platform','status'];
  const idx = colMap.indexOf(col);
  if (idx >= 0 && ths[idx]) { ths[idx].classList.add('sort-active'); if (!sortAsc) ths[idx].classList.add('sort-desc'); }
  renderTable();
};

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
const icalUrl = window.location.origin + '/calendar.ics';
const icalEl = document.getElementById('icalExportUrl');
if (icalEl) icalEl.textContent = icalUrl;
window.copyIcal = function () { navigator.clipboard.writeText(icalUrl).then(() => alert('Copied!')); };

let _icalFeeds = [];
function currentIcalFeeds() { return [..._icalFeeds]; }
function renderIcalFeeds(feeds) {
  _icalFeeds = [...feeds];
  const el = document.getElementById('icalFeedList');
  if (!el) return;
  if (!_icalFeeds.length) { el.innerHTML = '<p style="font-size:.84rem;color:var(--g400);font-style:italic;">No external calendars added yet.</p>'; return; }
  el.innerHTML = _icalFeeds.map((f, i) =>
    `<div style="display:flex;align-items:center;gap:.75rem;background:#fff;border:1px solid var(--g200);border-radius:var(--r);padding:.75rem 1rem;">
      <div style="flex-shrink:0;width:36px;height:36px;border-radius:8px;background:var(--g100);display:flex;align-items:center;justify-content:center;font-size:1rem;">📅</div>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:700;font-size:.88rem;">${f.name}</div>
        <div style="font-size:.75rem;color:var(--g400);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${f.url}</div>
      </div>
      <button class="btn btn-sm" style="color:#ef4444;border:1px solid #fca5a5;background:#fff;" onclick="removeIcalFeed(${i})">Remove</button>
    </div>`
  ).join('');
}
window.addIcalFeed = function () {
  const name = document.getElementById('icalFeedName').value.trim();
  const url = document.getElementById('icalFeedUrl').value.trim();
  if (!name || !url) { alert('Enter both a name and URL'); return; }
  if (!url.startsWith('http')) { alert('URL must start with http:// or https://'); return; }
  _icalFeeds.push({ name, url });
  renderIcalFeeds(_icalFeeds);
  document.getElementById('icalFeedName').value = '';
  document.getElementById('icalFeedUrl').value = '';
  markDirty();
};
window.removeIcalFeed = function (i) { _icalFeeds.splice(i, 1); renderIcalFeeds(_icalFeeds); markDirty(); };

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

const platformMeta = {
  airbnb:  { label: 'Airbnb',      icon: '🏠', color: '#FF5A5F', bg: '#FFF1F2' },
  booking: { label: 'Booking.com', icon: '🅱️', color: '#003580', bg: '#EBF0F9' },
  vrbo:    { label: 'VRBO',        icon: '🏡', color: '#3C67F0', bg: '#EEF2FF' },
  google:  { label: 'Google',      icon: '⭐', color: '#EA4335', bg: '#FEF2F2' },
  direct:  { label: 'Direct',      icon: '✉️', color: 'var(--green)', bg: 'var(--green-p)' },
};

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
    const pm = platformMeta[r.platform] || platformMeta.direct;

    return `<div style="border:1px solid var(--g100);border-radius:var(--r);padding:1.25rem;margin-bottom:.75rem;">
      <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:.75rem;">
        <div style="width:38px;height:38px;border-radius:50%;background:var(--green);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:.78rem;flex-shrink:0;">${initials}</div>
        <div style="flex:1;">
          <div style="font-weight:700;font-size:.88rem;">${r.guest_name || '—'}</div>
          <div style="font-size:.75rem;color:var(--g400);">${r.stay_date || ''} · ${date}</div>
        </div>
        <span style="font-size:.68rem;font-weight:700;padding:3px 8px;border-radius:100px;background:${pm.bg};color:${pm.color};">${pm.icon} ${pm.label}</span>
        <div style="color:var(--green);font-size:.85rem;">${stars}</div>
        <span style="font-size:.7rem;font-weight:700;padding:3px 8px;border-radius:var(--r-full);background:${statusBg};color:${statusColor};text-transform:uppercase;letter-spacing:.04em;">${r.status}</span>
      </div>
      <p style="font-size:.85rem;color:var(--g600);line-height:1.6;margin:0 0 .75rem;">"${r.review_text}"</p>
      <div style="display:flex;gap:.5rem;">
        ${r.status === 'pending' ? `
          <button class="btn btn-sm" style="background:var(--green);color:#fff;border-color:var(--green);" onclick="approveReview('${r.id}')">Approve</button>
          <button class="btn btn-sm btn-white" onclick="rejectReview('${r.id}')">Reject</button>` : r.status === 'rejected' ? `
          <button class="btn btn-sm btn-white" onclick="approveReview('${r.id}')">Approve</button>` : `
          <button class="btn btn-sm btn-white" onclick="rejectReview('${r.id}')">Reject</button>`}
        <button class="btn btn-sm btn-white" style="color:#dc2626;border-color:#fca5a5;" onclick="deleteReview('${r.id}')">Delete</button>
      </div>
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

// ── URL-BASED REVIEW SCRAPER ────────────────────────────────
window.fetchReviewsFromUrl = async function () {
  const url = document.getElementById('scrapeUrl').value.trim();
  const status = document.getElementById('scrapeStatus');
  if (!url) { status.textContent = '⚠️ Paste a listing URL first'; return; }

  status.textContent = '🔄 Fetching reviews…';
  try {
    const res = await fetch('/api/scrape-reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-password': adminPassword },
      body: JSON.stringify({ url }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');

    if (!data.reviews || !data.reviews.length) {
      status.textContent = '⚠️ No reviews found. The platform may be blocking scraping — try the paste method below.';
      return;
    }

    _parsedReviews = data.reviews.map(r => ({ ...r, platform: data.platform, include: true }));
    status.textContent = `✅ Found ${data.count} reviews from ${data.platform}`;
    renderBulkPreview();
  } catch (err) {
    status.textContent = '❌ ' + err.message;
  }
};

// ── BULK REVIEW PARSER ──────────────────────────────────────
let _parsedReviews = [];

window.parseBulkReviews = function () {
  const raw = document.getElementById('bulkText').value.trim();
  const platform = document.getElementById('bulkPlatform').value;
  const defaultRating = +document.getElementById('bulkRating').value;
  const status = document.getElementById('bulkStatus');

  if (!raw) { status.textContent = '⚠️ Paste some reviews first'; return; }

  let reviews = [];
  if (platform === 'airbnb') reviews = parseAirbnbReviews(raw, defaultRating);
  else if (platform === 'booking') reviews = parseBookingReviews(raw, defaultRating);
  else if (platform === 'vrbo') reviews = parseVrboReviews(raw, defaultRating);
  else reviews = parseGenericReviews(raw, defaultRating);

  if (!reviews.length) {
    // Fallback: try generic parser
    reviews = parseGenericReviews(raw, defaultRating);
  }

  if (!reviews.length) {
    status.textContent = '⚠️ Could not parse any reviews. Try the single import below.';
    return;
  }

  _parsedReviews = reviews.map(r => ({ ...r, platform, include: true }));
  status.textContent = `Found ${reviews.length} review${reviews.length > 1 ? 's' : ''}`;
  renderBulkPreview();
};

function parseAirbnbReviews(text, defaultRating) {
  const reviews = [];
  // Airbnb copy pattern: Name\nDate (e.g. "March 2024" or "3 weeks ago")\nReview text
  // Also handles: Name\nLocation\nDate\nRating\nReview text
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);

  const datePattern = /^(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}$/i;
  const relDatePattern = /^\d+\s+(day|week|month|year)s?\s+ago$/i;
  const ratingPattern = /^(\d+(\.\d+)?)\s*\/?\s*5?$/;
  const starsPattern = /^[★☆]{1,5}$/;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    // Skip common noise
    if (/^(show more|read more|report|helpful|response from|translate|show original|verified|hosted by)/i.test(line)) { i++; continue; }
    if (/^\d+$/.test(line)) { i++; continue; } // bare numbers

    // Check if this looks like a name (short, no period at end, not a date)
    const isName = line.length > 1 && line.length < 40 && !datePattern.test(line) && !relDatePattern.test(line) && !ratingPattern.test(line) && !starsPattern.test(line) && !/[.!?]$/.test(line) && !/^\d/.test(line);

    if (isName) {
      const name = line;
      let date = '';
      let rating = defaultRating;
      let reviewText = '';
      let j = i + 1;

      // Scan ahead for date, rating, then review text
      while (j < lines.length && j < i + 5) {
        if (datePattern.test(lines[j]) || relDatePattern.test(lines[j])) {
          date = lines[j]; j++; continue;
        }
        if (ratingPattern.test(lines[j])) {
          rating = Math.round(parseFloat(lines[j])); j++; continue;
        }
        if (starsPattern.test(lines[j])) {
          rating = (lines[j].match(/★/g) || []).length; j++; continue;
        }
        // Skip location-like lines (e.g. "Sydney, Australia")
        if (lines[j].length < 35 && /,/.test(lines[j]) && !lines[j].includes('.')) { j++; continue; }
        break;
      }

      // Collect review text until next name-like line
      const textParts = [];
      while (j < lines.length) {
        const next = lines[j];
        if (/^(show more|read more|report|helpful|response from|translate|show original)/i.test(next)) { j++; continue; }
        // Check if next line starts a new review (short name-like line followed by a date)
        const nextIsName = next.length > 1 && next.length < 40 && !datePattern.test(next) && !relDatePattern.test(next) && !/[.!?]$/.test(next) && !/^\d/.test(next);
        if (nextIsName && j + 1 < lines.length && (datePattern.test(lines[j + 1]) || relDatePattern.test(lines[j + 1]))) break;
        textParts.push(next);
        j++;
      }

      reviewText = textParts.join(' ').trim();
      if (reviewText.length > 10) {
        reviews.push({ guest_name: name, rating, stay_date: date, review_text: reviewText });
      }
      i = j;
    } else {
      i++;
    }
  }
  return reviews;
}

function parseBookingReviews(text, defaultRating) {
  const reviews = [];
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);

  // Booking.com pattern: often has "Scored X.X" or "X.X" ratings, "Reviewed: date", guest name, country
  const scorePattern = /^(?:scored?\s*)?(\d+(?:\.\d+)?)\s*$/i;
  const reviewedPattern = /^reviewed:?\s*(.+)$/i;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Look for a score
    let score = null;
    let scoreMatch = line.match(scorePattern);
    if (scoreMatch && parseFloat(scoreMatch[1]) <= 10) {
      score = Math.round(parseFloat(scoreMatch[1]) / 2); // Convert 10-scale to 5-scale
    }

    // Look for "Reviewed: date" pattern
    let dateMatch = line.match(reviewedPattern);

    if (score !== null || dateMatch) {
      let rating = score || defaultRating;
      let date = dateMatch ? dateMatch[1] : '';
      let name = '';
      let reviewText = '';

      // Look around for name and review text
      let j = i + 1;
      // Scan for remaining fields
      while (j < lines.length && j < i + 8) {
        if (!date && reviewedPattern.test(lines[j])) {
          date = lines[j].match(reviewedPattern)[1]; j++; continue;
        }
        if (score === null && scorePattern.test(lines[j])) {
          rating = Math.round(parseFloat(lines[j].match(scorePattern)[1]) / 2); j++; continue;
        }
        // Skip country names, "Couple", "Solo traveller", etc.
        if (/^(couple|solo|family|group|business|friends)/i.test(lines[j])) { j++; continue; }
        if (!name && lines[j].length < 30 && !/[.!?]$/.test(lines[j]) && !/^\d/.test(lines[j])) {
          name = lines[j]; j++; continue;
        }
        break;
      }

      // Collect review text
      const textParts = [];
      while (j < lines.length) {
        if (scorePattern.test(lines[j]) || reviewedPattern.test(lines[j])) break;
        if (/^(helpful|not helpful|show more|read more)/i.test(lines[j])) { j++; continue; }
        textParts.push(lines[j]);
        j++;
      }
      reviewText = textParts.join(' ').trim();
      if (reviewText.length > 10 && name) {
        reviews.push({ guest_name: name, rating: Math.min(5, Math.max(1, rating)), stay_date: date, review_text: reviewText });
      }
      i = j;
    } else {
      i++;
    }
  }
  return reviews;
}

function parseVrboReviews(text, defaultRating) {
  // VRBO is similar to Airbnb pattern
  return parseAirbnbReviews(text, defaultRating);
}

function parseGenericReviews(text, defaultRating) {
  const reviews = [];
  // Split by double newlines as review separators
  const blocks = text.split(/\n\s*\n/).filter(b => b.trim().length > 20);

  for (const block of blocks) {
    const lines = block.split('\n').map(l => l.trim()).filter(l => l);
    if (!lines.length) continue;

    // First short line is likely the name
    let name = '';
    let date = '';
    let rating = defaultRating;
    let textStart = 0;

    const datePattern = /^(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}$/i;

    if (lines[0].length < 40 && !/[.!?]$/.test(lines[0])) {
      name = lines[0];
      textStart = 1;
      if (lines[1] && datePattern.test(lines[1])) { date = lines[1]; textStart = 2; }
    }

    const reviewText = lines.slice(textStart).join(' ').trim();
    if (reviewText.length > 10) {
      reviews.push({ guest_name: name || 'Guest', rating, stay_date: date, review_text: reviewText });
    }
  }
  return reviews;
}

function renderBulkPreview() {
  const preview = document.getElementById('bulkPreview');
  const list = document.getElementById('bulkList');
  const count = document.getElementById('bulkCount');
  preview.style.display = 'block';
  const included = _parsedReviews.filter(r => r.include);
  count.textContent = `${included.length} of ${_parsedReviews.length} selected`;

  list.innerHTML = _parsedReviews.map((r, i) => {
    const stars = '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating);
    const pm = platformMeta[r.platform] || platformMeta.direct;
    return `<div style="border:1px solid ${r.include ? 'var(--g200)' : '#fca5a5'};border-radius:var(--r);padding:1rem;margin-bottom:.5rem;opacity:${r.include ? 1 : .4};transition:all .15s;">
      <div style="display:flex;align-items:center;gap:.6rem;margin-bottom:.5rem;">
        <input type="checkbox" ${r.include ? 'checked' : ''} onchange="toggleParsedReview(${i},this.checked)" style="accent-color:var(--green);"/>
        <strong style="font-size:.85rem;">${r.guest_name}</strong>
        <span style="font-size:.75rem;color:var(--g400);">${r.stay_date}</span>
        <span style="color:var(--green);font-size:.8rem;margin-left:auto;">${stars}</span>
        <span style="font-size:.65rem;font-weight:700;padding:2px 6px;border-radius:100px;background:${pm.bg};color:${pm.color};">${pm.icon} ${pm.label}</span>
      </div>
      <p style="font-size:.82rem;color:var(--g600);line-height:1.5;margin:0;">"${r.review_text.slice(0, 200)}${r.review_text.length > 200 ? '…' : ''}"</p>
    </div>`;
  }).join('');
}

window.toggleParsedReview = function (i, checked) {
  _parsedReviews[i].include = checked;
  renderBulkPreview();
};

window.importAllParsed = async function () {
  const toImport = _parsedReviews.filter(r => r.include);
  if (!toImport.length) return;
  const progress = document.getElementById('importProgress');

  for (let i = 0; i < toImport.length; i++) {
    progress.textContent = `Importing ${i + 1} of ${toImport.length}…`;
    const r = toImport[i];
    try {
      await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': adminPassword },
        body: JSON.stringify({ guest_name: r.guest_name, rating: r.rating, review_text: r.review_text, stay_date: r.stay_date, platform: r.platform }),
      });
    } catch (e) { console.error('Import failed:', r.guest_name, e); }
  }

  progress.textContent = `✅ ${toImport.length} review${toImport.length > 1 ? 's' : ''} imported!`;
  _parsedReviews = [];
  document.getElementById('bulkText').value = '';
  setTimeout(() => {
    document.getElementById('bulkPreview').style.display = 'none';
    progress.textContent = '';
  }, 2000);
  await loadReviews();
};

window.addReview = async function () {
  const name = document.getElementById('rvName').value.trim();
  const text = document.getElementById('rvText').value.trim();
  const rating = document.getElementById('rvRating').value;
  const platform = document.getElementById('rvPlatform').value;
  const stayDate = document.getElementById('rvStayDate').value.trim();
  const status = document.getElementById('rvStatus');

  if (!name || !text) { status.textContent = '⚠️ Name and review text required'; return; }

  status.textContent = 'Adding…';
  try {
    const res = await fetch('/api/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-password': adminPassword },
      body: JSON.stringify({ guest_name: name, rating: +rating, review_text: text, stay_date: stayDate, platform }),
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || res.status); }
    status.textContent = '✅ Review added!';
    document.getElementById('rvName').value = '';
    document.getElementById('rvText').value = '';
    document.getElementById('rvStayDate').value = '';
    await loadReviews();
    setTimeout(() => { status.textContent = ''; }, 2000);
  } catch (err) {
    status.textContent = '❌ ' + err.message;
  }
};

window.deleteReview = async function (id) {
  if (!confirm('Delete this review permanently?')) return;
  try {
    const res = await fetch(`/api/reviews?id=${id}`, {
      method: 'DELETE',
      headers: { 'x-admin-password': adminPassword },
    });
    if (!res.ok) throw new Error('Failed');
    await loadReviews();
  } catch (err) {
    alert('Failed to delete: ' + err.message);
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
