/**
 * cache.js — Google Sheets CSV fetch + IndexedDB caching
 */

const SHEET_CSV_URL =
  'https://docs.google.com/spreadsheets/d/1oA5z1HACI7vBHWi66Om5IIQ803qqjVlr4yOXJy-pg9M/export?format=csv&gid=0';

const DB_NAME    = 'EmpireEconomyDB';
const DB_VERSION = 1;
const STORE_NAME = 'cache';
const CACHE_KEY  = 'itemData';
const CACHE_TS   = 'lastFetched';
const MAX_AGE_MS = 4 * 60 * 60 * 1000; // 4 hours

let db = null;

// ─── IndexedDB helpers ───────────────────────────────────────────────────────

function openDB() {
  return new Promise((resolve, reject) => {
    if (db) { resolve(db); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      e.target.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = e => { db = e.target.result; resolve(db); };
    req.onerror   = e => reject(e.target.error);
  });
}

async function dbGet(key) {
  const d = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = d.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = e => reject(e.target.error);
  });
}

async function dbSet(key, value) {
  const d = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = d.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).put(value, key);
    req.onsuccess = () => resolve();
    req.onerror   = e => reject(e.target.error);
  });
}

// ─── CSV Parsing ─────────────────────────────────────────────────────────────

function parseCSV(text) {
  const lines = [];
  let cur = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQ && text[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === ',' && !inQ) {
      lines[lines.length - 1].push(cur); cur = '';
    } else if ((ch === '\n' || ch === '\r') && !inQ) {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      if (lines.length === 0 || lines[lines.length - 1].length > 0 || cur !== '') {
        if (lines.length === 0) lines.push([]);
        lines[lines.length - 1].push(cur);
        lines.push([]);
        cur = '';
      }
    } else {
      cur += ch;
    }
  }
  if (cur !== '') { if (lines.length === 0) lines.push([]); lines[lines.length - 1].push(cur); }
  return lines.filter(r => r.length > 1);
}

function rowToItem(row) {
  const num = (v) => {
    if (!v || v.trim() === '' || v.trim() === '-') return null;
    const n = parseFloat(v.replace(/,/g, ''));
    return isNaN(n) ? null : n;
  };
  const limit = (v) => {
    if (!v || v.trim().toUpperCase() === 'NONE' || v.trim() === '') return null;
    const n = parseInt(v);
    return isNaN(n) ? null : n;
  };

  return {
    id:                    (row[0]  || '').trim(),
    name:                  (row[1]  || '').trim(),
    category:              (row[2]  || '').trim(),
    unit:                  (row[3]  || '').trim(),
    lastPrice:             num(row[4]),
    currentPrice:          num(row[5]),
    priceIndustrialTown:   num(row[6]),
    priceIndustrialCity:   num(row[7]),
    priceMarketTown:       num(row[8]),
    priceMarketCity:       num(row[9]),
    priceReligiousTown:    num(row[10]),
    priceTempleCity:       num(row[11]),
    limit:                 limit(row[12]),
    buying:                (row[13] || '').trim().toLowerCase() !== 'no',
  };
}

function parseItems(csvText) {
  const rows = parseCSV(csvText);
  if (rows.length < 2) return [];
  return rows.slice(1)
    .filter(r => r[1] && r[1].trim() !== '')
    .map(rowToItem);
}

// ─── Fetch ───────────────────────────────────────────────────────────────────

async function fetchFromSheet() {
  const resp = await fetch(SHEET_CSV_URL);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.text();
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * loadItems()
 * Returns { items, fromCache, lastFetched, warning }
 */
export async function loadItems() {
  let cachedItems = null;
  let cachedTs    = null;

  try {
    cachedItems = await dbGet(CACHE_KEY);
    cachedTs    = await dbGet(CACHE_TS);
  } catch (_) { /* IDB unavailable */ }

  const now     = Date.now();
  const stale   = !cachedTs || (now - cachedTs) > MAX_AGE_MS;

  if (!stale && cachedItems) {
    return { items: cachedItems, fromCache: true, lastFetched: cachedTs, warning: null };
  }

  try {
    const csv   = await fetchFromSheet();
    const items = parseItems(csv);
    try {
      await dbSet(CACHE_KEY, items);
      await dbSet(CACHE_TS,  now);
    } catch (_) { /* IDB write fail — non-fatal */ }
    return { items, fromCache: false, lastFetched: now, warning: null };
  } catch (err) {
    if (cachedItems) {
      return { items: cachedItems, fromCache: true, lastFetched: cachedTs,
               warning: 'Could not refresh data — using cached version.' };
    }
    return { items: [], fromCache: false, lastFetched: null,
             warning: 'OFFLINE: Could not load item data. Item search is disabled.' };
  }
}

/**
 * forceRefresh() — ignores cache age, always re-fetches
 */
export async function forceRefresh() {
  try {
    const csv   = await fetchFromSheet();
    const items = parseItems(csv);
    const now   = Date.now();
    try {
      await dbSet(CACHE_KEY, items);
      await dbSet(CACHE_TS,  now);
    } catch (_) {}
    return { items, fromCache: false, lastFetched: now, warning: null };
  } catch (err) {
    throw err;
  }
}
