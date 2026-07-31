// ── Shared auth for machine-to-machine API endpoints ─────────
// Accepts EITHER:
//   • the existing human admin password  (header: x-admin-password)
//       → backward-compatible: the Glenhaven admin panel keeps working
//   • a dedicated StayOps API key         (header: Authorization: Bearer <key>
//                                                   or  x-api-key: <key>)
//
// Comparison is constant-time so a wrong secret can't be guessed by timing.
//
// Fails CLOSED: if NEITHER ADMIN_PASSWORD nor STAYOPS_API_KEY is configured in
// the environment, every request is rejected — a refund/reservation endpoint
// must never run wide open.

const crypto = require('crypto');

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  // Hash both sides to a fixed 32-byte digest before comparing. This keeps the
  // comparison constant-time REGARDLESS of input length, so response timing can't
  // leak whether a header was empty, short, or the wrong length.
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// Returns null when authorised, or { statusCode, error } describing the refusal.
function checkAuth(event) {
  const { ADMIN_PASSWORD, STAYOPS_API_KEY } = process.env;

  if (!ADMIN_PASSWORD && !STAYOPS_API_KEY) {
    return { statusCode: 500, error: 'Server auth not configured (set STAYOPS_API_KEY).' };
  }

  const headers = event.headers || {};                // Netlify lower-cases header names
  const adminPwd = (headers['x-admin-password'] || '').trim();
  const bearer = (headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim();
  const apiKey = (headers['x-api-key'] || bearer || '').trim();

  if (STAYOPS_API_KEY && safeEqual(apiKey, STAYOPS_API_KEY)) return null;
  if (ADMIN_PASSWORD && safeEqual(adminPwd, ADMIN_PASSWORD)) return null;

  return { statusCode: 401, error: 'Unauthorized' };
}

module.exports = { checkAuth, safeEqual };
