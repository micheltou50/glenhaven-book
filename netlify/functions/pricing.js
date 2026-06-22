// ── pricing.js — server-side price calculation ───────────────
// Mirrors js/pricing.js (the front-end engine) EXACTLY so the server can
// compute the authoritative charge amount. Never trust a price sent by the
// browser — a tampered request must not be able to set its own total.
//
// Dates are parsed as UTC midnight and read with getUTC* so the result does
// not drift with the server's timezone (Netlify runs in UTC; guests are in AEST).

const DEFAULTS = {
  baseRate: 320, baseGuests: 2, extraGuest: 40, cleaningFee: 150, maxGuests: 8,
  friSurcharge: 60, satSurcharge: 80, peakPct: 25, lowPct: -10,
};
const DEFAULT_HOLIDAY_PRICES = {
  '12-25': 550, '12-26': 550, '01-01': 650, '12-31': 650, '04-18': 480, '04-20': 480,
};
const DEFAULT_LOS = { nights3: 5, nights5: 10, nights7: 15 };

function num(v, d) { const n = parseFloat(v); return Number.isFinite(n) ? n : d; }

function resolvePricing(cfg) {
  const p = (cfg && cfg.pricing) || {};
  const maxFromProp = cfg && cfg.property ? cfg.property.guests : undefined;
  return {
    baseRate:     num(p.baseRate, DEFAULTS.baseRate),
    baseGuests:   num(p.baseGuests, DEFAULTS.baseGuests),
    extraGuest:   num(p.extraGuest, DEFAULTS.extraGuest),
    cleaningFee:  num(p.cleaningFee, DEFAULTS.cleaningFee),
    maxGuests:    num(p.maxGuests != null ? p.maxGuests : maxFromProp, DEFAULTS.maxGuests),
    friSurcharge: num(p.friSurcharge, DEFAULTS.friSurcharge),
    satSurcharge: num(p.satSurcharge, DEFAULTS.satSurcharge),
    peakPct:      num(p.peakPct, DEFAULTS.peakPct),
    lowPct:       num(p.lowPct, DEFAULTS.lowPct),
    holidayPrices: { ...DEFAULT_HOLIDAY_PRICES, ...(p.holidayPrices || {}) },
    losDiscounts:  { ...DEFAULT_LOS, ...(p.losDiscounts || {}) },
  };
}

function parseISO(iso) { return new Date(iso + 'T00:00:00Z'); }
function toISO(d)      { return d.toISOString().slice(0, 10); }

function peakSeason(monthIndex0) {
  const m = monthIndex0 + 1;
  if (m === 12 || m === 1) return 'peak';
  if (m >= 5 && m <= 8) return 'low';
  return 'standard';
}

function nightlyRate(dateUTC, extraGuests, P, overrides) {
  const iso = toISO(dateUTC);
  // 1. Per-date override (admin pricing calendar)
  if (overrides && overrides[iso] != null) {
    return overrides[iso] + extraGuests * P.extraGuest;
  }
  // 2. Holiday price (MM-DD)
  const key = iso.slice(5);
  if (P.holidayPrices[key] != null) {
    return P.holidayPrices[key] + extraGuests * P.extraGuest;
  }
  // 3. Base rate + weekend surcharge + season multiplier
  let base = P.baseRate;
  const day = dateUTC.getUTCDay();
  if (day === 5) base += P.friSurcharge;   // Friday
  if (day === 6) base += P.satSurcharge;   // Saturday
  const season = peakSeason(dateUTC.getUTCMonth());
  if (season === 'peak') base *= (1 + P.peakPct / 100);
  if (season === 'low')  base *= (1 + P.lowPct / 100);
  return Math.round(base) + extraGuests * P.extraGuest;
}

function losDiscountRate(nights, los) {
  if (nights >= 7) return (los.nights7 || 0) / 100;
  if (nights >= 5) return (los.nights5 || 0) / 100;
  if (nights >= 3) return (los.nights3 || 0) / 100;
  return 0;
}

// Returns { nights, nightlyTotal, discountAmt, subtotal, cleaningFee, total,
//           extraGuests, maxGuests } or null for invalid input.
function calcServerPrice({ checkIn, checkOut, guests, cfg, overrides }) {
  if (!checkIn || !checkOut) return null;
  const start = parseISO(checkIn);
  const end   = parseISO(checkOut);
  if (isNaN(start) || isNaN(end)) return null;
  const nights = Math.round((end - start) / 86400000);
  if (!Number.isFinite(nights) || nights < 1) return null;

  const P = resolvePricing(cfg);
  const g = parseInt(guests) || 1;
  const extraGuests = Math.max(0, g - P.baseGuests);

  let nightlyTotal = 0;
  for (let i = 0; i < nights; i++) {
    const d = new Date(start.getTime() + i * 86400000);
    nightlyTotal += nightlyRate(d, extraGuests, P, overrides);
  }

  const discountAmt = Math.round(nightlyTotal * losDiscountRate(nights, P.losDiscounts));
  const subtotal    = nightlyTotal - discountAmt;
  const total       = subtotal + P.cleaningFee;

  return {
    nights, nightlyTotal, discountAmt, subtotal,
    cleaningFee: P.cleaningFee, total, extraGuests, maxGuests: P.maxGuests,
  };
}

module.exports = { calcServerPrice, resolvePricing };
