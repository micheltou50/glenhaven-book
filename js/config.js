/* ── config.js — shared mutable configuration ── */

export const LOS_DISCOUNTS = { nights3: 5, nights5: 10, nights7: 15 };

export const CONFIG = {
  WEBHOOK_URL    : '/api/book',
  AVAIL_URL      : '/api/availability',
  CONFIG_URL     : '/api/config',
  BASE_RATE      : 320,
  BASE_GUESTS    : 2,
  EXTRA_GUEST    : 40,
  CLEANING_FEE   : 150,
  MAX_GUESTS     : 8,
  FRI_SURCHARGE  : 60,
  SAT_SURCHARGE  : 80,
  PEAK_PCT       : 25,
  LOW_PCT        : -10,
  MIN_NIGHTS     : { weekday: 2, weekend: 3, peak: 4 },
};

export let HOLIDAY_PRICES = {
  '12-25': 550,
  '12-26': 550,
  '01-01': 650,
  '12-31': 650,
  '04-18': 480,
  '04-20': 480,
};

// Allow full replacement of HOLIDAY_PRICES from site-config
export function setHolidayPrices(obj) {
  HOLIDAY_PRICES = obj;
}
