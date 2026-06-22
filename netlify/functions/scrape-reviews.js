// ── /api/scrape-reviews ──────────────────────────────────────
// Takes a listing URL (Airbnb, Booking.com, VRBO)
// Fetches the page, extracts embedded review data, returns parsed reviews.

const { ADMIN_PASSWORD } = process.env;

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-admin-password',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'POST only' }) };

  const pwd = (event.headers['x-admin-password'] || '').trim();
  if (!pwd || pwd !== ADMIN_PASSWORD) {
    return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  let body;
  try { body = JSON.parse(event.body); } catch { return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { url } = body;
  if (!url) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'url required' }) };

  // ── Validate URL & restrict to allow-listed OTA hosts (SSRF guard) ──
  // Match on the parsed hostname, not a substring, so URLs like
  // https://169.254.169.254/?x=airbnb. can't reach internal/metadata endpoints.
  let parsedUrl;
  try { parsedUrl = new URL(url); } catch { return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Invalid URL.' }) }; }
  if (parsedUrl.protocol !== 'https:') {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Only https URLs are allowed.' }) };
  }
  const host = parsedUrl.hostname.toLowerCase();
  // Brand must be the registrable domain (optionally with a 2-level ccTLD like
  // com.au / co.uk), so airbnb.evil.com is rejected.
  let platform = 'unknown';
  if (/(^|\.)airbnb\.((com|co|net|org)\.)?[a-z]{2,}$/.test(host)) platform = 'airbnb';
  else if (/(^|\.)booking\.com$/.test(host)) platform = 'booking';
  else if (/(^|\.)(vrbo|homeaway)\.((com|co|net|org)\.)?[a-z]{2,}$/.test(host)) platform = 'vrbo';
  else return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Only Airbnb, Booking.com or VRBO listing URLs are allowed.' }) };

  try {
    let reviews = [];

    if (platform === 'airbnb') {
      reviews = await scrapeAirbnb(url);
    } else if (platform === 'booking') {
      reviews = await scrapeBooking(url);
    } else if (platform === 'vrbo') {
      reviews = await scrapeVrbo(url);
    } else {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Unsupported platform. Use Airbnb, Booking.com, or VRBO URLs.' }) };
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ success: true, platform, reviews, count: reviews.length }),
    };
  } catch (err) {
    console.error('[scrape-reviews]', err.message);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: err.message }) };
  }
};

// ── Airbnb ───────────────────────────────────────────────────
async function scrapeAirbnb(url) {
  const html = await fetchPage(url);
  const reviews = [];

  // Method 1: Extract from deferred state JSON (most reliable)
  const deferredMatch = html.match(/<script\s+id="data-deferred-state-\d*"\s+type="application\/json">([\s\S]*?)<\/script>/);
  if (deferredMatch) {
    try {
      const data = JSON.parse(deferredMatch[1]);
      const extracted = extractAirbnbReviews(data);
      if (extracted.length) return extracted;
    } catch (e) { console.error('Deferred state parse error:', e.message); }
  }

  // Method 2: Extract from __NEXT_DATA__ or embedded state
  const nextDataMatch = html.match(/<script\s+id="__NEXT_DATA__"\s+type="application\/json">([\s\S]*?)<\/script>/);
  if (nextDataMatch) {
    try {
      const data = JSON.parse(nextDataMatch[1]);
      const extracted = extractAirbnbReviews(data);
      if (extracted.length) return extracted;
    } catch (e) { console.error('Next data parse error:', e.message); }
  }

  // Method 3: Extract listing ID and try the API directly
  const listingId = url.match(/\/rooms\/(\d+)/)?.[1];
  if (listingId) {
    try {
      const apiReviews = await fetchAirbnbAPI(listingId);
      if (apiReviews.length) return apiReviews;
    } catch (e) { console.error('Airbnb API error:', e.message); }
  }

  // Method 4: Regex fallback on HTML
  return extractAirbnbFromHtml(html);
}

function extractAirbnbReviews(obj) {
  const reviews = [];
  const seen = new Set();

  function walk(o) {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o)) { o.forEach(walk); return; }

    // Look for review-shaped objects
    if (o.comments && o.reviewer && typeof o.comments === 'string') {
      const key = (o.reviewer.firstName || o.reviewer.first_name || '') + ':' + o.comments.slice(0, 50);
      if (seen.has(key)) return;
      seen.add(key);
      reviews.push({
        guest_name: o.reviewer.firstName || o.reviewer.first_name || o.reviewer.name || 'Guest',
        rating: o.rating || o.reviewRating || 5,
        review_text: o.comments,
        stay_date: formatAirbnbDate(o.createdAt || o.created_at || o.localizedDate || ''),
      });
      return;
    }

    // Alternative shape
    if (o.reviewText && (o.reviewerName || o.guestName)) {
      const key = (o.reviewerName || o.guestName) + ':' + o.reviewText.slice(0, 50);
      if (seen.has(key)) return;
      seen.add(key);
      reviews.push({
        guest_name: o.reviewerName || o.guestName || 'Guest',
        rating: o.rating || o.stars || 5,
        review_text: o.reviewText,
        stay_date: formatAirbnbDate(o.date || o.createdAt || ''),
      });
      return;
    }

    // Another shape: comment + author
    if (o.comment && typeof o.comment === 'string' && o.comment.length > 20 && o.author) {
      const name = typeof o.author === 'string' ? o.author : (o.author.firstName || o.author.name || 'Guest');
      const key = name + ':' + o.comment.slice(0, 50);
      if (seen.has(key)) return;
      seen.add(key);
      reviews.push({
        guest_name: name,
        rating: o.rating || o.stars || 5,
        review_text: o.comment,
        stay_date: formatAirbnbDate(o.date || o.createdAt || o.localizedDate || ''),
      });
      return;
    }

    Object.values(o).forEach(walk);
  }

  walk(obj);
  return reviews;
}

async function fetchAirbnbAPI(listingId) {
  const apiUrl = `https://www.airbnb.com/api/v2/reviews?listing_id=${listingId}&role=guest&_format=for_p3&_limit=50&_offset=0&_order=language_country`;
  const res = await fetch(apiUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error('Airbnb API returned ' + res.status);
  const data = await res.json();
  const reviews = data.reviews || [];
  return reviews.map(r => ({
    guest_name: r.reviewer?.first_name || r.reviewer?.name || 'Guest',
    rating: r.rating || 5,
    review_text: r.comments || '',
    stay_date: formatAirbnbDate(r.created_at || r.localized_date || ''),
  })).filter(r => r.review_text.length > 5);
}

function extractAirbnbFromHtml(html) {
  // Last resort: extract any JSON objects that look like reviews
  const reviews = [];
  const pattern = /"comments"\s*:\s*"([^"]{20,})"/g;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    // Try to find the reviewer name nearby
    const context = html.substring(Math.max(0, match.index - 500), match.index + match[0].length + 200);
    const nameMatch = context.match(/"(?:firstName|first_name|name)"\s*:\s*"([^"]+)"/);
    const ratingMatch = context.match(/"rating"\s*:\s*(\d+)/);
    reviews.push({
      guest_name: nameMatch ? nameMatch[1] : 'Guest',
      rating: ratingMatch ? parseInt(ratingMatch[1]) : 5,
      review_text: match[1].replace(/\\n/g, ' ').replace(/\\"/g, '"'),
      stay_date: '',
    });
  }
  return reviews;
}

function formatAirbnbDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;
    return d.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
  } catch { return dateStr; }
}

// ── Booking.com ──────────────────────────────────────────────
async function scrapeBooking(url) {
  const html = await fetchPage(url);
  const reviews = [];

  // Booking.com embeds review data in various script tags
  // Look for review data in embedded JSON
  const scriptPattern = /<script[^>]*>([\s\S]*?)<\/script>/g;
  let match;
  while ((match = scriptPattern.exec(html)) !== null) {
    const script = match[1];
    if (script.includes('review_score') || script.includes('review_text') || script.includes('guest_name')) {
      try {
        // Try to find JSON in the script
        const jsonMatch = script.match(/(\{[\s\S]*"review[\s\S]*\})/);
        if (jsonMatch) {
          const data = JSON.parse(jsonMatch[1]);
          const extracted = extractBookingReviews(data);
          if (extracted.length) return extracted;
        }
      } catch (e) { /* continue */ }
    }
  }

  // Try extracting from structured data (JSON-LD)
  const ldMatch = html.match(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/g);
  if (ldMatch) {
    for (const ld of ldMatch) {
      try {
        const json = JSON.parse(ld.replace(/<\/?script[^>]*>/g, ''));
        if (json.review || json.reviews) {
          const revs = json.review || json.reviews || [];
          (Array.isArray(revs) ? revs : [revs]).forEach(r => {
            reviews.push({
              guest_name: r.author?.name || r.author || 'Guest',
              rating: r.reviewRating?.ratingValue ? Math.round(r.reviewRating.ratingValue / 2) : 5,
              review_text: r.reviewBody || r.description || '',
              stay_date: r.datePublished || '',
            });
          });
          if (reviews.length) return reviews;
        }
      } catch (e) { /* continue */ }
    }
  }

  // Regex fallback for Booking.com HTML review blocks
  const blockPattern = /class="[^"]*review_item[^"]*"[\s\S]*?<\/div>\s*<\/li>/g;
  let blockMatch;
  while ((blockMatch = blockPattern.exec(html)) !== null) {
    const block = blockMatch[0];
    const nameM = block.match(/class="[^"]*reviewer_name[^"]*"[^>]*>[\s\S]*?<span[^>]*>([^<]+)/);
    const textM = block.match(/class="[^"]*review_pos[^"]*"[^>]*>[\s\S]*?<span[^>]*>([^<]+)/);
    const scoreM = block.match(/class="[^"]*review-score-badge[^"]*"[^>]*>\s*([\d.]+)/);
    const dateM = block.match(/class="[^"]*review_item_date[^"]*"[^>]*>[\s\S]*?<span[^>]*>([^<]+)/);
    if (nameM && textM) {
      reviews.push({
        guest_name: nameM[1].trim(),
        rating: scoreM ? Math.round(parseFloat(scoreM[1]) / 2) : 5,
        review_text: textM[1].trim(),
        stay_date: dateM ? dateM[1].trim() : '',
      });
    }
  }

  return reviews;
}

function extractBookingReviews(obj) {
  const reviews = [];
  function walk(o) {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o)) { o.forEach(walk); return; }
    if ((o.pros || o.cons || o.text || o.review_text) && (o.author || o.guest_name || o.reviewer_name)) {
      const text = [o.title, o.pros, o.cons, o.text, o.review_text].filter(Boolean).join(' ').trim();
      if (text.length > 10) {
        reviews.push({
          guest_name: o.author?.name || o.guest_name || o.reviewer_name || 'Guest',
          rating: o.score ? Math.round(o.score / 2) : (o.rating || 5),
          review_text: text,
          stay_date: o.date || o.submitted_date || '',
        });
      }
      return;
    }
    Object.values(o).forEach(walk);
  }
  walk(obj);
  return reviews;
}

// ── VRBO ─────────────────────────────────────────────────────
async function scrapeVrbo(url) {
  const html = await fetchPage(url);

  // VRBO/HomeAway embeds data in __NEXT_DATA__ or window.__INITIAL_STATE__
  const nextMatch = html.match(/<script\s+id="__NEXT_DATA__"\s+type="application\/json">([\s\S]*?)<\/script>/);
  if (nextMatch) {
    try {
      const data = JSON.parse(nextMatch[1]);
      const reviews = extractVrboReviews(data);
      if (reviews.length) return reviews;
    } catch (e) { console.error('VRBO parse error:', e.message); }
  }

  // Try window state
  const stateMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});/);
  if (stateMatch) {
    try {
      const data = JSON.parse(stateMatch[1]);
      const reviews = extractVrboReviews(data);
      if (reviews.length) return reviews;
    } catch (e) { /* continue */ }
  }

  // JSON-LD fallback
  const ldMatches = html.match(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/g) || [];
  for (const ld of ldMatches) {
    try {
      const json = JSON.parse(ld.replace(/<\/?script[^>]*>/g, ''));
      if (json.review || json.reviews) {
        const revs = Array.isArray(json.review || json.reviews) ? (json.review || json.reviews) : [json.review || json.reviews];
        return revs.map(r => ({
          guest_name: r.author?.name || r.author || 'Guest',
          rating: r.reviewRating?.ratingValue || 5,
          review_text: r.reviewBody || r.description || '',
          stay_date: r.datePublished || '',
        })).filter(r => r.review_text.length > 5);
      }
    } catch (e) { /* continue */ }
  }

  return [];
}

function extractVrboReviews(obj) {
  const reviews = [];
  const seen = new Set();
  function walk(o) {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o)) { o.forEach(walk); return; }
    // VRBO review shape
    if ((o.body || o.text || o.reviewText) && (o.reviewer || o.reviewerName || o.author)) {
      const text = o.body || o.text || o.reviewText || '';
      const name = o.reviewer?.firstName || o.reviewerName || o.author?.name || o.author || 'Guest';
      const key = name + ':' + text.slice(0, 50);
      if (seen.has(key) || text.length < 10) return;
      seen.add(key);
      reviews.push({
        guest_name: name,
        rating: o.rating || o.overallRating || o.stars || 5,
        review_text: text,
        stay_date: o.submittedAt || o.arrivalDate || o.datePublished || '',
      });
      return;
    }
    Object.values(o).forEach(walk);
  }
  walk(obj);
  return reviews;
}

// ── Shared ───────────────────────────────────────────────────
async function fetchPage(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Failed to fetch page: HTTP ${res.status}`);
  return await res.text();
}
