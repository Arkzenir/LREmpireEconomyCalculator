/*
 * Empire Economy Calculator — config.js
 * ═══════════════════════════════════════════════════════════════════════════
 * Edit this file to adjust tax rates, buyback values, FTA settings, and
 * remote data source URLs. No other files need to be touched for these.
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ─── Remote Data Sources ────────────────────────────────────────────────────
// Main Empire price sheet (Market Browser, Tax, FTA tabs)
var SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/1oA5z1HACI7vBHWi66Om5IIQ803qqjVlr4yOXJy-pg9M/export?format=csv&gid=0';

// Empire Imports manifest (Empire Imports tab)
// Only items where "FTA Buying?" is "Yes" will be displayed.
var IMPORTS_CSV_URL = 'https://docs.google.com/spreadsheets/d/1hGKGd9jKlCuRZ46WjvSK5vaAAIIXIJ-kIK6BO0kLnP8/export?format=csv&gid=0';

// ─── IndexedDB / Client-Side Cache ──────────────────────────────────────────
var DB_NAME    = 'EmpireEconomyDB';
var DB_VERSION = 1;
var STORE_NAME = 'cache';

// Cache keys for the main price sheet data
var CACHE_KEY = 'itemData';
var CACHE_TS  = 'lastFetched';

// Cache keys for the imports sheet data
var IMPORTS_CACHE_KEY = 'importData';
var IMPORTS_CACHE_TS  = 'importLastFetched';

// How long cached data stays fresh before a background refresh is attempted
var MAX_AGE_MS = 4 * 60 * 60 * 1000;  // 4 hours

// ─── Tax Rates ────────────────────────────────────────────────────────────────
// Base tax per active population unit, keyed by settlement type.
// Hamlet is always 0 — no tax form is generated for it.
var TAX_RATE = {
  Hamlet:  0,
  Village: 100,
  Town:    125,
  City:    150,
  Capital: 150,
};

// Buyback cap multiplier applied to the final tax due.
// The Empire will purchase surplus goods up to (taxDue × cap).
var BUYBACK_CAP = {
  Village: 2.0,
  Town:    1.5,
  City:    1.0,
  Capital: 1.0,
};

// Buyback rate — the fraction of capped surplus the Empire pays out in coin.
// e.g. 0.75 means the Empire pays 75 coins per 100 coins of goods submitted.
var BUYBACK_RATE = {
  Village: 0.75,
  Town:    0.65,
  City:    0.55,
  Capital: 0.55,
};

// ─── FTA Settings ─────────────────────────────────────────────────────────────
// Markup multiplier applied to the base Empire price to get the FTA sale price.
var FTA_MARKUP = 1.25;

// Tiered cut rates based on total FTA sale price.
// Format: { upTo: <maxFtaPrice>, rate: <fractionTakenByFTA> }
// The last bracket's upTo value is ignored — it always catches the remainder.
var FTA_CUT_BRACKETS = [
  { upTo: 3000,      rate: 0.10 },   // 10% FTA cut on sales up to 3000 coins
  { upTo: 4000,      rate: 0.25 },   // 25% FTA cut on sales 3001–4000 coins
  { upTo: Infinity,  rate: 0.40 },   // 40% FTA cut on sales above 4000 coins
];
