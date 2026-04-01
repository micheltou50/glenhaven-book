/* ── pricing.js — pricing engine ── */

import { CONFIG, LOS_DISCOUNTS, HOLIDAY_PRICES } from './config.js';
import { getPriceOverride } from './availability.js';

export function getPeakSeason(date) {
  const m = date.getMonth() + 1;
  if (m === 12 || m === 1) return 'peak';
  if (m >= 5 && m <= 8) return 'low';
  return 'standard';
}

export function getDayType(date) {
  const d = date.getDay();
  return (d === 5 || d === 6) ? 'weekend' : 'weekday';
}

export function getNightlyRate(date, extraGuests = 0) {
  // Check per-date override first (set from admin pricing calendar)
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const iso = `${y}-${m}-${d}`;
  const override = getPriceOverride(iso);
  if (override !== null) return override + extraGuests * CONFIG.EXTRA_GUEST;

  const key = m + '-' + d;
  if (HOLIDAY_PRICES[key]) return HOLIDAY_PRICES[key] + extraGuests * CONFIG.EXTRA_GUEST;

  let base = CONFIG.BASE_RATE;

  const day = date.getDay();
  if (day === 5) base += (CONFIG.FRI_SURCHARGE != null ? CONFIG.FRI_SURCHARGE : 60);
  if (day === 6) base += (CONFIG.SAT_SURCHARGE != null ? CONFIG.SAT_SURCHARGE : 80);

  const season = getPeakSeason(date);
  const peakMult = 1 + (CONFIG.PEAK_PCT != null ? CONFIG.PEAK_PCT : 25) / 100;
  const lowMult  = 1 + (CONFIG.LOW_PCT  != null ? CONFIG.LOW_PCT  : -10) / 100;
  if (season === 'peak') base *= peakMult;
  if (season === 'low')  base *= lowMult;

  return Math.round(base) + extraGuests * CONFIG.EXTRA_GUEST;
}

export function getMinNights(checkIn) {
  const date = new Date(checkIn);
  if (getPeakSeason(date) === 'peak') return CONFIG.MIN_NIGHTS.peak;
  if (getDayType(date) === 'weekend') return CONFIG.MIN_NIGHTS.weekend;
  return CONFIG.MIN_NIGHTS.weekday;
}

export function getLOSDiscount(nights) {
  if (nights >= 7) return (LOS_DISCOUNTS.nights7 || 0) / 100;
  if (nights >= 5) return (LOS_DISCOUNTS.nights5 || 0) / 100;
  if (nights >= 3) return (LOS_DISCOUNTS.nights3 || 0) / 100;
  return 0;
}

export function calcPrice(checkIn, checkOut, guests) {
  if (!checkIn || !checkOut) return null;
  const start  = new Date(checkIn);
  const end    = new Date(checkOut);
  const nights = Math.round((end - start) / 86400000);
  if (nights < 1) return null;

  const extraGuests = Math.max(0, (parseInt(guests) || 1) - CONFIG.BASE_GUESTS);
  let nightlyTotal = 0;
  const nightlyRates = [];

  for (let i = 0; i < nights; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const rate = getNightlyRate(d, extraGuests);
    nightlyTotal += rate;
    nightlyRates.push(rate);
  }

  const losDiscount = getLOSDiscount(nights);
  const discountAmt = Math.round(nightlyTotal * losDiscount);
  const subtotal    = nightlyTotal - discountAmt;
  const total       = subtotal + CONFIG.CLEANING_FEE;
  const avgNightly  = Math.round(nightlyTotal / nights);

  return {
    nights, nightlyTotal, discountAmt, losDiscount,
    subtotal, cleaningFee: CONFIG.CLEANING_FEE, total,
    avgNightly, extraGuests, nightlyRates,
  };
}
