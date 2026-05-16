// ── site-config-loader.js — shared backend config fetcher ────
// Fetches site config from Supabase site_config table.
// Caches in-memory for the lifetime of the function instance.

const { SUPABASE_URL, SUPABASE_SERVICE_KEY, PROPERTY_ID } = process.env;

let _cached = null;
let _cachedAt = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function loadSiteConfig() {
  if (_cached && (Date.now() - _cachedAt) < CACHE_TTL) return _cached;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !PROPERTY_ID) return null;

  try {
    const url = `${SUPABASE_URL}/rest/v1/site_config?property_id=eq.${PROPERTY_ID}&select=config&limit=1`;
    const res = await fetch(url, {
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
    });
    const rows = await res.json();
    if (Array.isArray(rows) && rows[0]?.config) {
      _cached = rows[0].config;
      _cachedAt = Date.now();
      return _cached;
    }
  } catch (err) {
    console.warn('[site-config-loader] Failed to fetch config:', err.message);
  }
  return null;
}

function getPropertyName(cfg) {
  return (cfg?.property?.name) || 'Glenhaven';
}

function getPropertyLocation(cfg) {
  return (cfg?.contact?.location) || 'Katoomba, NSW · Blue Mountains';
}

function getLocationTag(cfg) {
  const loc = getPropertyLocation(cfg);
  return loc.replace(/[,·]/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase().replace(/ /g, ' \\u00b7 ');
}

function getCheckinTime(cfg) {
  return (cfg?.houseRules?.checkin) || '3:00 PM';
}

function getCheckoutTime(cfg) {
  return (cfg?.houseRules?.checkout) || '10:00 AM';
}

function getBedrooms(cfg) {
  return (cfg?.property?.bedrooms != null) ? cfg.property.bedrooms : 4;
}

function getBathrooms(cfg) {
  return (cfg?.property?.bathrooms != null) ? cfg.property.bathrooms : 2.5;
}

function getMaxGuests(cfg) {
  return (cfg?.property?.guests != null) ? cfg.property.guests : 8;
}

function getCleaningFee(cfg) {
  return (cfg?.pricing?.cleaningFee != null) ? cfg.pricing.cleaningFee : 150;
}

function getEmailFrom(cfg) {
  const name = getPropertyName(cfg);
  return process.env.RESEND_FROM || `${name} Bookings <noreply@resend.dev>`;
}

function getRefPrefix(cfg) {
  const name = getPropertyName(cfg);
  const letters = name.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 2);
  return letters.length >= 2 ? letters + '-' : 'GH-';
}

module.exports = {
  loadSiteConfig,
  getPropertyName,
  getPropertyLocation,
  getLocationTag,
  getCheckinTime,
  getCheckoutTime,
  getBedrooms,
  getBathrooms,
  getMaxGuests,
  getCleaningFee,
  getEmailFrom,
  getRefPrefix,
};
