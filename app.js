/*
 * Empire Economy Calculator — app.js
 * Single-file bundle. No ES modules, no imports. Works on GitHub Pages.
 */

// ═══════════════════════════════════════════════════════════════════════════
// SHARED STATE
// ═══════════════════════════════════════════════════════════════════════════

var state = {
  activeTab: 'tax',
  allItems:  [],
  config: {
    settlementName:       '',
    settlementType:       'Village',
    specialisation:       'none',
    population:           1,
    taxModifierPercent: 0,
    playerName:           '',
    date:                 todayStr(),
  },
  ftaConfig: {
    ftaClientName:  '',
    perPersonLimit: 150,
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// CACHE / INDEXEDDB
// ═══════════════════════════════════════════════════════════════════════════

var SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/1oA5z1HACI7vBHWi66Om5IIQ803qqjVlr4yOXJy-pg9M/export?format=csv&gid=0';
var DB_NAME    = 'EmpireEconomyDB';
var DB_VERSION = 1;
var STORE_NAME = 'cache';
var CACHE_KEY  = 'itemData';
var CACHE_TS   = 'lastFetched';
var MAX_AGE_MS = 4 * 60 * 60 * 1000;

var _db = null;

function openDB() {
  return new Promise(function(resolve, reject) {
    if (_db) { resolve(_db); return; }
    var req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = function(e) { e.target.result.createObjectStore(STORE_NAME); };
    req.onsuccess = function(e) { _db = e.target.result; resolve(_db); };
    req.onerror   = function(e) { reject(e.target.error); };
  });
}

function dbGet(key) {
  return openDB().then(function(d) {
    return new Promise(function(resolve, reject) {
      var req = d.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key);
      req.onsuccess = function() { resolve(req.result); };
      req.onerror   = function(e) { reject(e.target.error); };
    });
  });
}

function dbSet(key, value) {
  return openDB().then(function(d) {
    return new Promise(function(resolve, reject) {
      var req = d.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(value, key);
      req.onsuccess = function() { resolve(); };
      req.onerror   = function(e) { reject(e.target.error); };
    });
  });
}

function parseCSV(text) {
  var rows = [], row = [], cur = '', inQ = false;
  for (var i = 0; i < text.length; i++) {
    var ch = text[i];
    if (ch === '"') {
      if (inQ && text[i+1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === ',' && !inQ) {
      row.push(cur); cur = '';
    } else if ((ch === '\n' || ch === '\r') && !inQ) {
      if (ch === '\r' && text[i+1] === '\n') i++;
      row.push(cur); cur = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else {
      cur += ch;
    }
  }
  if (cur !== '' || row.length > 0) { row.push(cur); if (row.length > 1 || row[0] !== '') rows.push(row); }
  return rows.filter(function(r) { return r.length > 1; });
}

function numVal(v) {
  if (!v || v.trim() === '' || v.trim() === '-') return null;
  var n = parseFloat(v.replace(/,/g, ''));
  return isNaN(n) ? null : n;
}

function limVal(v) {
  if (!v || v.trim().toUpperCase() === 'NONE' || v.trim() === '') return null;
  var n = parseInt(v, 10);
  return isNaN(n) ? null : n;
}

function rowToItem(row) {
  return {
    id:                  (row[0]  || '').trim(),
    name:                (row[1]  || '').trim(),
    category:            (row[2]  || '').trim(),
    unit:                (row[3]  || '').trim(),
    lastPrice:           numVal(row[5]),
    currentPrice:        numVal(row[6]),
    priceIndustrialTown: numVal(row[7]),
    priceIndustrialCity: numVal(row[8]),
    priceMarketTown:     numVal(row[9]),
    priceMarketCity:     numVal(row[10]),
    priceReligiousTown:  numVal(row[11]),
    priceTempleCity:     numVal(row[12]),
    limit:               limVal(row[13]),
    buying:              (row[14] || '').trim().toLowerCase() !== 'no',
  };
}

function parseItems(csvText) {
  var rows = parseCSV(csvText);
  if (rows.length < 2) return [];
  return rows.slice(1)
    .filter(function(r) { return r[1] && r[1].trim() !== ''; })
    .map(rowToItem);
}

function fetchFromSheet() {
  return fetch(SHEET_CSV_URL).then(function(resp) {
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    return resp.text();
  });
}

function loadItems() {
  var cachedItems = null, cachedTs = null;
  return dbGet(CACHE_KEY).then(function(v) {
    cachedItems = v;
    return dbGet(CACHE_TS);
  }).catch(function() {
    return null;
  }).then(function(ts) {
    cachedTs = ts;
    var now   = Date.now();
    var stale = !cachedTs || (now - cachedTs) > MAX_AGE_MS;

    if (!stale && cachedItems) {
      return { items: cachedItems, fromCache: true, lastFetched: cachedTs, warning: null };
    }

    return fetchFromSheet().then(function(csv) {
      var items = parseItems(csv);
      var now2  = Date.now();
      return dbSet(CACHE_KEY, items).then(function() {
        return dbSet(CACHE_TS, now2);
      }).catch(function() {}).then(function() {
        return { items: items, fromCache: false, lastFetched: now2, warning: null };
      });
    }).catch(function() {
      if (cachedItems) {
        return { items: cachedItems, fromCache: true, lastFetched: cachedTs,
                 warning: 'Could not refresh data — using cached version.' };
      }
      return { items: [], fromCache: false, lastFetched: null,
               warning: 'OFFLINE: Could not load item data. Item search is disabled.' };
    });
  });
}

function forceRefresh() {
  return fetchFromSheet().then(function(csv) {
    var items = parseItems(csv);
    var now   = Date.now();
    return dbSet(CACHE_KEY, items).then(function() {
      return dbSet(CACHE_TS, now);
    }).catch(function() {}).then(function() {
      return { items: items, fromCache: false, lastFetched: now, warning: null };
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// SEARCH
// ═══════════════════════════════════════════════════════════════════════════

var _searchItems    = [];
var _onSelectItem   = null;
var _activeIdx      = -1;
var _suggestions    = [];

function initSearch(items, onSelect) {
  _searchItems  = items;
  _onSelectItem = onSelect;

  var input = document.getElementById('item-search');
  var list  = document.getElementById('search-suggestions');
  if (!input || !list) return;

  input.addEventListener('input',   function() { renderSuggestions(input, list); });
  input.addEventListener('keydown', function(e) { handleSearchKeydown(e, input, list); });
  input.addEventListener('blur',    function() { setTimeout(function() { hideSuggestions(list); }, 150); });
  input.addEventListener('focus',   function() { renderSuggestions(input, list); });
}

function updateSearchItems(items) {
  _searchItems = items;
}

function getItemDisplayPrice(item) {
  if (state.activeTab === 'fta') return item.currentPrice;
  var specKey = state.config.specialisation;
  if (!specKey || specKey === 'none') return item.currentPrice;
  return item[specKey] != null ? item[specKey] : item.currentPrice;
}

function filterSearchItems(query) {
  if (!query || query.length < 1) return [];
  var q = query.toLowerCase();
  return _searchItems.filter(function(i) {
    return i.name.toLowerCase().indexOf(q) !== -1 || i.id.toLowerCase().indexOf(q) !== -1;
  }).slice(0, 10);
}

function renderSuggestions(input, list) {
  var q = input.value.trim();
  _suggestions = filterSearchItems(q);
  _activeIdx   = -1;

  if (!_suggestions.length) { hideSuggestions(list); return; }

  list.innerHTML = '';
  _suggestions.forEach(function(item, idx) {
    var price    = getItemDisplayPrice(item);
    var priceStr = price != null ? price.toFixed(3) : '—';

    var li = document.createElement('li');
    li.className  = 'suggestion-item' + (!item.buying ? ' not-accepted' : '');
    li.dataset.idx = idx;
    li.innerHTML =
      '<span class="sug-name">' + escHtml(item.name) + '</span>' +
      '<span class="sug-meta">' +
        '<span class="sug-cat">' + escHtml(item.category) + '</span>' +
        '<span class="sug-price">' + priceStr + '</span>' +
        (item.limit != null ? '<span class="sug-limit">Limit: ' + item.limit + '</span>' : '') +
        (!item.buying ? '<span class="badge-not-accepted">Not Accepted</span>' : '') +
      '</span>';
    li.addEventListener('mousedown', function() { selectSuggestion(idx, input, list); });
    list.appendChild(li);
  });

  list.classList.remove('hidden');
}

function hideSuggestions(list) {
  list.classList.add('hidden');
  _activeIdx = -1;
}

function handleSearchKeydown(e, input, list) {
  if (!_suggestions.length) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    _activeIdx = Math.min(_activeIdx + 1, _suggestions.length - 1);
    highlightSuggestion(list);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    _activeIdx = Math.max(_activeIdx - 1, 0);
    highlightSuggestion(list);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    selectSuggestion(_activeIdx >= 0 ? _activeIdx : 0, input, list);
  } else if (e.key === 'Escape') {
    hideSuggestions(list);
  }
}

function highlightSuggestion(list) {
  list.querySelectorAll('.suggestion-item').forEach(function(li, i) {
    li.classList.toggle('active', i === _activeIdx);
  });
}

function selectSuggestion(idx, input, list) {
  var item = _suggestions[idx];
  if (!item) return;
  input.value = '';
  hideSuggestions(list);
  if (_onSelectItem) _onSelectItem(item);
}

// ═══════════════════════════════════════════════════════════════════════════
// CART
// ═══════════════════════════════════════════════════════════════════════════

var cart = [];

function resolveUnitPrice(item) {
  var specKey = state.config.specialisation;
  if (!specKey || specKey === 'none') return item.currentPrice != null ? item.currentPrice : 0;
  return item[specKey] != null ? item[specKey] : (item.currentPrice != null ? item.currentPrice : 0);
}

function addItem(item) {
  var existing = null;
  for (var i = 0; i < cart.length; i++) { if (cart[i].id === item.id) { existing = cart[i]; break; } }

  if (existing) {
    existing.quantity = Math.max(existing.quantity, 1);
    renderCart();
    var row = document.querySelector('[data-cart-id="' + item.id + '"]');
    if (row) { var qi = row.querySelector('.qty-input'); if (qi) qi.focus(); }
    return;
  }

  cart.push({
    id:           item.id,
    name:         item.name,
    category:     item.category,
    quantity:     1,
    unitPrice:    resolveUnitPrice(item),
    currentPrice: item.currentPrice != null ? item.currentPrice : 0,
    limit:        item.limit,
    buying:       item.buying,
  });
  renderCart();
  recalcAll();
}

function removeItem(id) {
  cart = cart.filter(function(e) { return e.id !== id; });
  renderCart();
  recalcAll();
}

function clearCart() {
  cart = [];
  renderCart();
  recalcAll();
}

function getCart() { return cart; }

function refreshCartPrices(allItems) {
  cart.forEach(function(entry) {
    for (var i = 0; i < allItems.length; i++) {
      if (allItems[i].id === entry.id) {
        var item = allItems[i];
        entry.unitPrice    = resolveUnitPrice(item);
        entry.currentPrice = item.currentPrice != null ? item.currentPrice : 0;
        entry.buying       = item.buying;
        entry.limit        = item.limit;
        break;
      }
    }
  });
  renderCart();
  recalcAll();
}

function renderCart() {
  var tbody  = document.getElementById('cart-tbody');
  var totEl  = document.getElementById('cart-total');
  var warnEl = document.getElementById('buying-warning');

  if (!tbody) return;

  if (cart.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="cart-empty">No items added yet.</td></tr>';
    if (totEl)  totEl.textContent = '0.000';
    if (warnEl) warnEl.classList.add('hidden');
    return;
  }

  var notAccepted = cart.filter(function(e) { return !e.buying; });
  if (warnEl) {
    if (notAccepted.length > 0) {
      warnEl.textContent = '\u26A0 ' + notAccepted.length + ' item(s) in your cart are not accepted by the Empire and have been excluded from all calculations.';
      warnEl.classList.remove('hidden');
    } else {
      warnEl.classList.add('hidden');
    }
  }

  var runningTotal = 0;
  tbody.innerHTML  = '';

  cart.forEach(function(entry) {
    var isAccepted = entry.buying;
    var price      = state.activeTab === 'fta' ? entry.currentPrice : entry.unitPrice;
    var lineTotal  = isAccepted ? entry.quantity * price : 0;
    if (isAccepted) runningTotal += lineTotal;

    var limitWarn = entry.limit != null && entry.quantity > entry.limit;

    var tr = document.createElement('tr');
    tr.dataset.cartId = entry.id;
    if (!isAccepted) tr.className = 'row-not-accepted';

    tr.innerHTML =
      '<td>' +
        '<span class="item-name">' + escHtml(entry.name) + '</span>' +
        (!isAccepted ? '<span class="badge-not-accepted">Not Accepted</span>' : '') +
        (limitWarn ? '<span class="badge-limit-warn">Over limit (' + entry.limit + ')</span>' : '') +
      '</td>' +
      '<td class="cat-cell">' + escHtml(entry.category) + '</td>' +
      '<td class="price-cell">' +
        (isAccepted ? price.toFixed(3) : '&mdash;') +
        (state.activeTab === 'fta' && isAccepted ? '<span class="price-label">FTA base</span>' : '') +
      '</td>' +
      '<td class="qty-cell">' +
        '<input type="number" class="qty-input" min="0" max="9999" value="' + entry.quantity + '" data-id="' + escHtml(entry.id) + '">' +
        (entry.limit != null ? '<span class="limit-badge">/' + entry.limit + '</span>' : '') +
      '</td>' +
      '<td class="total-cell' + (!isAccepted ? ' struck' : '') + '">' +
        (isAccepted ? lineTotal.toFixed(3) : '&mdash;') +
      '</td>' +
      '<td class="remove-cell">' +
        '<button class="btn-remove" data-id="' + escHtml(entry.id) + '" title="Remove item">\u2715</button>' +
      '</td>';

    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.qty-input').forEach(function(input) {
    input.addEventListener('change', function(e) {
      var id    = e.target.dataset.id;
      var entry = null;
      for (var i = 0; i < cart.length; i++) { if (cart[i].id === id) { entry = cart[i]; break; } }
      if (!entry) return;
      entry.quantity = Math.max(0, parseInt(e.target.value, 10) || 0);
      renderCart();
      recalcAll();
    });
  });

  tbody.querySelectorAll('.btn-remove').forEach(function(btn) {
    btn.addEventListener('click', function(e) { removeItem(e.target.dataset.id); });
  });

  if (totEl) totEl.textContent = runningTotal.toFixed(3);
}

// ═══════════════════════════════════════════════════════════════════════════
// TAX
// ═══════════════════════════════════════════════════════════════════════════

var TAX_RATE = { Hamlet: 0, Village: 100, Town: 125, City: 150, Capital: 150 };
var BUYBACK_CAP = { Village: 2.0, Town: 1.5, City: 1.0, Capital: 1.0 };
var BUYBACK_RATE = { Village: 0.75, Town: 0.65, City: 0.55, Capital: 0.55 };

function calcTax() {
  var type       = state.config.settlementType;
  var population = Math.max(1, parseInt(state.config.population, 10) || 1);
  var taxModPct  = Math.max(0, parseFloat(state.config.taxModifierPercent) || 0);

  var raceModifier = taxModPct / 100;
  var baseTax      = (TAX_RATE[type] || 0) * population;
  var finalTax     = baseTax * (1 + raceModifier);

  var accepted       = cart.filter(function(i) { return i.buying && i.quantity > 0; });
  var submittedValue = accepted.reduce(function(s, i) { return s + i.quantity * i.unitPrice; }, 0);
  var excessValue    = Math.max(0, submittedValue - finalTax);

  var buybackCap = 0, cappedSurplus = 0, empirePayout = 0;
  if (type !== 'Hamlet') {
    buybackCap    = finalTax * (BUYBACK_CAP[type] != null ? BUYBACK_CAP[type] : 1.0);
    cappedSurplus = Math.min(excessValue, buybackCap);
    empirePayout  = cappedSurplus * (BUYBACK_RATE[type] != null ? BUYBACK_RATE[type] : 0.55);
  }

  return {
    type: type, population: population, taxModPct: taxModPct,
    raceModifier: raceModifier,
    baseTax: baseTax, finalTax: finalTax, submittedValue: submittedValue,
    excessValue: excessValue, buybackCap: buybackCap,
    cappedSurplus: cappedSurplus, empirePayout: empirePayout,
    isHamlet: type === 'Hamlet',
    taxCovered: submittedValue >= finalTax,
  };
}

function renderTaxCalc() {
  var panel = document.getElementById('tax-calc-panel');
  if (!panel) return;

  var r   = calcTax();
  var fmt = function(v) { return v.toFixed(2); };
  var pct = function(v) { return (v * 100).toFixed(0); };

  var genBtn = document.getElementById('btn-generate-tax');

  if (r.isHamlet) {
    panel.innerHTML =
      '<div class="calc-notice"><span class="notice-icon">\u2139</span>' +
      'Hamlets have no tax due and no buyback. No form is needed.</div>';
    if (genBtn) genBtn.disabled = true;
    return;
  }

  var hasItems = cart.some(function(i) { return i.buying && i.quantity > 0; });
  if (genBtn) genBtn.disabled = !hasItems;

  var capMultStr = BUYBACK_CAP[r.type] != null ? BUYBACK_CAP[r.type] : '?';
  var buyRateStr = BUYBACK_RATE[r.type] != null ? pct(BUYBACK_RATE[r.type]) : '?';

  panel.innerHTML =
    '<div class="calc-grid">' +
      '<div class="calc-section">' +
        '<h4 class="calc-heading">Tax Calculation</h4>' +
        '<div class="calc-row">' +
          '<span class="calc-label">Base Tax</span>' +
          '<span class="calc-value">' + fmt(r.baseTax) + ' coins</span>' +
          '<span class="calc-note">' + r.population + ' pop \u00D7 ' + (TAX_RATE[r.type] || 0) + '</span>' +
        '</div>' +
        '<div class="calc-row ' + (r.raceModifier > 0 ? '' : 'calc-row--muted') + '">' +
          '<span class="calc-label">Tax Modifier</span>' +
          '<span class="calc-value">+' + r.taxModPct.toFixed(1) + '%</span>' +
        '</div>' +
        '<div class="calc-row calc-row--total">' +
          '<span class="calc-label">Final Tax Due</span>' +
          '<span class="calc-value">' + fmt(r.finalTax) + ' coins</span>' +
        '</div>' +
      '</div>' +

      '<div class="calc-section">' +
        '<h4 class="calc-heading">Submitted Goods</h4>' +
        '<div class="calc-row">' +
          '<span class="calc-label">Submitted Value</span>' +
          '<span class="calc-value">' + fmt(r.submittedValue) + ' coins</span>' +
        '</div>' +
        '<div class="calc-row ' + (r.taxCovered ? 'calc-row--good' : 'calc-row--warn') + '">' +
          '<span class="calc-label">' + (r.taxCovered ? 'Excess Value' : 'Shortfall') + '</span>' +
          '<span class="calc-value">' +
            (r.taxCovered
              ? fmt(r.excessValue) + ' coins'
              : '\u26A0 ' + fmt(r.finalTax - r.submittedValue) + ' coins short') +
          '</span>' +
        '</div>' +
      '</div>' +

      '<div class="calc-section">' +
        '<h4 class="calc-heading">Surplus Buyback</h4>' +
        '<div class="calc-row">' +
          '<span class="calc-label">Excess Value</span>' +
          '<span class="calc-value">' + fmt(r.excessValue) + ' coins</span>' +
          '<span class="calc-note">Submitted \u2212 Tax Due</span>' +
        '</div>' +
        '<div class="calc-row">' +
          '<span class="calc-label">Seasonal Cap</span>' +
          '<span class="calc-value">' + fmt(r.buybackCap) + ' coins</span>' +
          '<span class="calc-note">Tax Due \u00D7 ' + capMultStr + '</span>' +
        '</div>' +
        '<div class="calc-row">' +
          '<span class="calc-label">Empire Purchases</span>' +
          '<span class="calc-value">' + fmt(r.cappedSurplus) + ' coins of goods</span>' +
          '<span class="calc-note">min(Excess, Cap)</span>' +
        '</div>' +
        '<div class="calc-row calc-row--total calc-row--payout">' +
          '<span class="calc-label">Empire Pays You</span>' +
          '<span class="calc-value">' + fmt(r.empirePayout) + ' coins</span>' +
          '<span class="calc-note">@ ' + buyRateStr + '% buy rate</span>' +
        '</div>' +
      '</div>' +
    '</div>';
}

// ═══════════════════════════════════════════════════════════════════════════
// FTA
// ═══════════════════════════════════════════════════════════════════════════

var FTA_MARKUP = 1.25;

function ftaCutRate(ftaPrice) {
  if (ftaPrice <= 3000) return 0.10;
  if (ftaPrice <= 4000) return 0.25;
  return 0.40;
}



function calcFTA() {
  var population   = Math.max(1, parseInt(state.config.population, 10) || 1);
  var perPersonLim = Math.max(0, parseInt(state.ftaConfig.perPersonLimit, 10) || 0);
  var weeklyCap    = perPersonLim * population;

  var accepted  = cart.filter(function(i) { return i.buying && i.quantity > 0; });
  var baseTotal = accepted.reduce(function(s, i) { return s + i.quantity * i.currentPrice; }, 0);

  var ftaPrice  = baseTotal * FTA_MARKUP;
  var cutRate   = ftaCutRate(ftaPrice);
  var yourCut   = ftaPrice * (1 - cutRate);
  var ftaCut    = ftaPrice * cutRate;
  var capExceeded  = yourCut > weeklyCap;

  return {
    population: population, perPersonLim: perPersonLim, weeklyCap: weeklyCap,
    baseTotal: baseTotal, ftaPrice: ftaPrice,
    cutRate: cutRate, yourCut: yourCut, ftaCut: ftaCut,
    capExceeded: capExceeded,
  };
}

function renderFTACalc() {
  var panel = document.getElementById('fta-calc-panel');
  if (!panel) return;

  var r   = calcFTA();
  var fmt = function(v) { return v.toFixed(2); };
  var pct = function(v) { return (v * 100).toFixed(0); };

  var hasItems = cart.some(function(i) { return i.buying && i.quantity > 0; });
  var genBtn   = document.getElementById('btn-generate-fta');
  if (genBtn) genBtn.disabled = !hasItems;

  var capWarn = document.getElementById('fta-cap-warning');
  if (capWarn) {
    if (r.capExceeded) {
      capWarn.textContent = '\u26A0 Weekly settlement cap exceeded! Your cut (' + fmt(r.yourCut) + ' coins) exceeds the cap of ' + fmt(r.weeklyCap) + ' coins (' + r.perPersonLim + ' \u00D7 ' + r.population + ' pop).';
      capWarn.classList.remove('hidden');
    } else {
      capWarn.classList.add('hidden');
    }
  }

  var bracketLabel = r.ftaPrice <= 3000 ? '\u2264 3000' : (r.ftaPrice <= 4000 ? '3001\u20134000' : '4001+');

  panel.innerHTML =
    '<div class="calc-grid">' +
      '<div class="calc-section">' +
        '<h4 class="calc-heading">Settlement Cap</h4>' +
        '<div class="calc-row">' +
          '<span class="calc-label">Per-Person Limit</span>' +
          '<span class="calc-value">' + r.perPersonLim + ' coins</span>' +
        '</div>' +
        '<div class="calc-row">' +
          '<span class="calc-label">Weekly Cap</span>' +
          '<span class="calc-value">' + fmt(r.weeklyCap) + ' coins</span>' +
          '<span class="calc-note">' + r.perPersonLim + ' \u00D7 ' + r.population + ' pop</span>' +
        '</div>' +
        '<div class="calc-row ' + (r.capExceeded ? 'calc-row--warn' : 'calc-row--good') + '">' +
          '<span class="calc-label">Cap Used</span>' +
          '<span class="calc-value">' + fmt(r.yourCut) + ' / ' + fmt(r.weeklyCap) + '</span>' +
          '<span class="calc-note">' + (r.capExceeded ? '\u26A0 Exceeded' : '\u2713 Within limit') + '</span>' +
        '</div>' +
      '</div>' +

      '<div class="calc-section">' +
        '<h4 class="calc-heading">FTA Price</h4>' +
        '<div class="calc-row">' +
          '<span class="calc-label">Base Total</span>' +
          '<span class="calc-value">' + fmt(r.baseTotal) + ' coins</span>' +
        '</div>' +
        '<div class="calc-row calc-row--total">' +
          '<span class="calc-label">FTA Price (\u00D71.25)</span>' +
          '<span class="calc-value">' + fmt(r.ftaPrice) + ' coins</span>' +
        '</div>' +
        '<div class="calc-row">' +
          '<span class="calc-label">Cut Rate Bracket</span>' +
          '<span class="calc-value">' + pct(r.cutRate) + '%</span>' +
          '<span class="calc-note">' + bracketLabel + '</span>' +
        '</div>' +
      '</div>' +

      '<div class="calc-section">' +
        '<h4 class="calc-heading">Your Earnings</h4>' +
        '<div class="calc-row calc-row--total calc-row--payout">' +
          '<span class="calc-label">Your Cut (' + pct(1 - r.cutRate) + '%)</span>' +
          '<span class="calc-value">' + fmt(r.yourCut) + ' coins</span>' +
        '</div>' +
        '<div class="calc-row calc-row--muted">' +
          '<span class="calc-label">FTA Cut (' + pct(r.cutRate) + '%)</span>' +
          '<span class="calc-value">' + fmt(r.ftaCut) + ' coins</span>' +
        '</div>' +
      '</div>' +
    '</div>';
}

// ═══════════════════════════════════════════════════════════════════════════
// FORM GENERATION
// ═══════════════════════════════════════════════════════════════════════════

var FORM_LINE = '\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500';

function padStr(label, value, width) {
  width = width || 26;
  while (label.length < width) label += ' ';
  return label + value;
}

function specLabel(key) {
  var m = {
    'none': 'None (Current Price)',
    'priceIndustrialTown': 'Industrial Town',
    'priceIndustrialCity': 'Industrial City',
    'priceMarketTown':     'Market Town',
    'priceMarketCity':     'Market City',
    'priceReligiousTown':  'Religious Town',
    'priceTempleCity':     'Temple City',
  };
  return m[key] || key || '\u2014';
}

function generateTaxForm(r) {
  var accepted = cart.filter(function(i) { return i.buying && i.quantity > 0; });
  var fmt      = function(v) { return v.toFixed(2); };

  var goodsLines = accepted.length
    ? accepted.map(function(i) { return '  - ' + i.name + ' \u00D7 ' + i.quantity; }).join('\n')
    : '  (none)';

  var valueLines = accepted.length
    ? accepted.map(function(i) {
        return '  - ' + i.name + ': ' + i.quantity + ' \u00D7 ' + i.unitPrice.toFixed(3) + ' = ' + (i.quantity * i.unitPrice).toFixed(3);
      }).join('\n')
    : '  (none)';

  var text = 'TAX FORM\n' + FORM_LINE + '\n' +
    padStr('Settlement Name:', state.config.settlementName || '(unnamed)') + '\n' +
    padStr('Settlement Type:', state.config.settlementType || '\u2014') + '\n' +
    padStr('Specialisation:', specLabel(state.config.specialisation)) + '\n\n' +
    'Goods Submitted:\n' + goodsLines + '\n\n' +
    'Declared Value:\n' + valueLines + '\n\n' +
    padStr('Total Declared Value:', fmt(r.submittedValue) + ' coins') + '\n\n' +
    FORM_LINE + '\n' +
    padStr('Base Tax:', fmt(r.baseTax) + ' coins') + '\n' +
    padStr('Tax Modifier:', '+' + r.taxModPct.toFixed(1) + '%') + '\n' +
    padStr('Final Tax Due:', fmt(r.finalTax) + ' coins') + '\n' +
    padStr('Tax Paid:', fmt(Math.min(r.submittedValue, r.finalTax)) + ' coins') + '\n';

  if (!r.isHamlet) {
    text += '\n' + FORM_LINE + '\n' +
      'Buyback:\n' +
      padStr('  Excess Value:', fmt(r.excessValue) + ' coins') + '\n' +
      padStr('  Seasonal Cap:', fmt(r.buybackCap) + ' coins  (Tax Due \xD7 ' + (BUYBACK_CAP[r.type] || 1) + ')') + '\n' +
      padStr('  Empire Purchases:', fmt(r.cappedSurplus) + ' coins of goods') + '\n' +
      padStr('  Empire Pays You:', fmt(r.empirePayout) + ' coins  (@ ' + (BUYBACK_RATE[r.type] * 100).toFixed(0) + '% buy rate)') + '\n';
  }

  text += '\n' + FORM_LINE + '\n' +
    padStr('Date:', state.config.date || todayStr()) + '\n' +
    padStr('Signature:', state.config.playerName || '(unsigned)') + '\n';

  showFormOutput('tax', text);
}

function generateFTAForm(r) {
  var accepted = cart.filter(function(i) { return i.buying && i.quantity > 0; });
  var fmt      = function(v) { return v.toFixed(2); };
  var pct      = function(v) { return (v * 100).toFixed(0); };

  var goodsLines = accepted.length
    ? accepted.map(function(i) { return '  - ' + i.name + ' \u00D7 ' + i.quantity; }).join('\n')
    : '  (none)';

  var valueLines = accepted.length
    ? accepted.map(function(i) {
        return '  - ' + i.name + ': ' + i.quantity + ' \u00D7 ' + i.currentPrice.toFixed(3) + ' = ' + (i.quantity * i.currentPrice).toFixed(3);
      }).join('\n')
    : '  (none)';

  var text = 'FTA SALES FORM\n' + FORM_LINE + '\n' +
    padStr('Settlement Name:', state.config.settlementName || '(unnamed)') + '\n' +
    padStr('FTA Client / Faction:', state.ftaConfig.ftaClientName || '(unnamed)') + '\n\n' +
    'Goods Submitted:\n' + goodsLines + '\n\n' +
    'Declared Value (Base Empire Price):\n' + valueLines + '\n\n' +
    FORM_LINE + '\n' +
    padStr('Total Base Price:', fmt(r.baseTotal) + ' coins') + '\n' +
    padStr('Total \u00D71.25 (FTA Price):', fmt(r.ftaPrice) + ' coins') + '\n\n' +
    padStr('Cut Rate Bracket:', pct(r.cutRate) + '%') + '\n' +
    padStr('  Your Cut (' + pct(1 - r.cutRate) + '%):', fmt(r.yourCut) + ' coins') + '\n' +
    padStr('  FTA Cut (' + pct(r.cutRate) + '%):', fmt(r.ftaCut) + ' coins') + '\n\n' +
    FORM_LINE + '\n' +
    padStr('Weekly Limit Used:', fmt(r.yourCut) + ' / ' + fmt(r.weeklyCap) + (r.capExceeded ? '  \u26A0 EXCEEDED' : '')) + '\n' +
    padStr('Per-Person Limit:', r.perPersonLim + ' coins') + '\n\n' +
    FORM_LINE + '\n' +
    padStr('Date:', state.config.date || todayStr()) + '\n' +
    padStr('Signature:', state.config.playerName || '(unsigned)') + '\n';

  showFormOutput('fta', text);
}

function showFormOutput(which, text) {
  var section = document.getElementById('form-output-section');
  var titleEl = document.getElementById('form-output-title');

  ['tax-form-output', 'fta-form-output', 'btn-copy-tax', 'btn-copy-fta'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });

  var ta      = document.getElementById(which + '-form-output');
  var copyBtn = document.getElementById('btn-copy-' + which);

  if (ta)      { ta.value = text; ta.classList.remove('hidden'); }
  if (copyBtn) copyBtn.classList.remove('hidden');
  if (section) section.classList.remove('hidden');

  if (titleEl) {
    titleEl.innerHTML = which === 'tax'
      ? '<span class="panel-title-icon">\uD83D\uDCDC</span> Tax Form'
      : '<span class="panel-title-icon">\uD83C\uDFEA</span> FTA Sales Form';
  }

  if (section) section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function initCopyButtons() {
  document.querySelectorAll('.btn-copy').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      var target = e.currentTarget.dataset.target;
      var ta = document.getElementById(target);
      if (!ta) return;
      var flash = function() {
        var orig = e.currentTarget.textContent;
        e.currentTarget.textContent = '\u2713 Copied!';
        e.currentTarget.classList.add('btn-copy--success');
        setTimeout(function() {
          e.currentTarget.textContent = orig;
          e.currentTarget.classList.remove('btn-copy--success');
        }, 1800);
      };
      if (navigator.clipboard) {
        navigator.clipboard.writeText(ta.value).then(flash).catch(function() {
          ta.select(); document.execCommand('copy'); flash();
        });
      } else {
        ta.select(); document.execCommand('copy'); flash();
      }
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function recalcAll() {
  if (state.activeTab === 'tax') renderTaxCalc();
  else renderFTACalc();
}

function updateCacheStatus(lastFetched, warning) {
  var el = document.getElementById('cache-status');
  if (!el) return;
  if (!lastFetched) {
    el.textContent = 'Data unavailable';
    el.className   = 'cache-status cache-status--error';
    return;
  }
  var mins = Math.floor((Date.now() - lastFetched) / 60000);
  var hrs  = Math.floor(mins / 60);
  var ago  = hrs > 0 ? (hrs + 'h ' + (mins % 60) + 'm ago') : (mins > 0 ? (mins + 'm ago') : 'just now');
  el.textContent = warning ? ('\u26A0 ' + warning + ' (last: ' + ago + ')') : ('Updated ' + ago);
  el.className   = 'cache-status ' + (warning ? 'cache-status--warn' : 'cache-status--ok');
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB SWITCHING
// ═══════════════════════════════════════════════════════════════════════════

function switchTab(tab) {
  state.activeTab = tab;

  document.querySelectorAll('.tab-btn').forEach(function(b) {
    b.classList.toggle('active', b.dataset.tab === tab);
  });

  // Market browser visibility
  var marketPanel = document.getElementById('market-browser-panel');
  if (marketPanel) {
    if (tab === 'market') {
      marketPanel.classList.add('active');
      marketPanel.style.display = 'block';
    } else {
      marketPanel.classList.remove('active');
      marketPanel.style.display = 'none';
    }
  }

  // Hide calc/cart/search panels on market tab
  var isMarket = tab === 'market';
  var configSection = document.getElementById('config-panel-section');
  var itemSearchPanel = document.getElementById('item-search-panel');
  var cartPanel = document.getElementById('cart-panel');
  var calcPanel = document.getElementById('calc-panel');
  var buyingWarning = document.getElementById('buying-warning');

  if (configSection)  configSection.style.display  = isMarket ? 'none' : '';
  if (itemSearchPanel) itemSearchPanel.style.display = isMarket ? 'none' : '';
  if (cartPanel)      cartPanel.style.display       = isMarket ? 'none' : '';
  if (calcPanel)      calcPanel.style.display        = isMarket ? 'none' : '';
  if (buyingWarning)  buyingWarning.style.display    = isMarket ? 'none' : '';

  var ftaSec = document.getElementById('fta-config-section');
  if (ftaSec) ftaSec.classList.toggle('hidden', tab !== 'fta');

  var capWarn = document.getElementById('fta-cap-warning');
  if (capWarn) capWarn.classList.add('hidden');

  var taxPanel = document.getElementById('tax-calc-panel');
  var ftaPanel = document.getElementById('fta-calc-panel');
  if (taxPanel) taxPanel.classList.toggle('hidden', tab !== 'tax');
  if (ftaPanel) ftaPanel.classList.toggle('hidden', tab !== 'fta');

  var titleEl = document.getElementById('calc-panel-title');
  if (titleEl) {
    titleEl.innerHTML = tab === 'tax'
      ? '<span class="panel-title-icon">\u2696\uFE0F</span> Tax Calculations'
      : '<span class="panel-title-icon">\uD83D\uDCB0</span> FTA Calculations';
  }

  var btnTax = document.getElementById('btn-generate-tax');
  var btnFTA = document.getElementById('btn-generate-fta');
  if (btnTax) btnTax.classList.toggle('hidden', tab !== 'tax');
  if (btnFTA) btnFTA.classList.toggle('hidden', tab !== 'fta');

  var lbl = document.getElementById('cart-total-label');
  if (lbl) lbl.textContent = tab === 'tax' ? 'Total Submitted Value:' : 'Total Base Value:';

  ['tax-form-output', 'fta-form-output', 'btn-copy-tax', 'btn-copy-fta'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });
  var fos = document.getElementById('form-output-section');
  if (fos) fos.classList.add('hidden');

  if (tab === 'market') renderMarketBrowser();

  renderCart();
  recalcAll();
}

// ═══════════════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════════════

function wireConfig() {
  function bind(id, key, sub, transform) {
    sub       = sub || 'config';
    transform = transform || function(v) { return v; };
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', function() {
      state[sub][key] = transform(el.value);
      if (key === 'specialisation') refreshCartPrices(state.allItems);
      renderCart();
      recalcAll();
    });
  }

  bind('cfg-settlement-name', 'settlementName');
  bind('cfg-settlement-type', 'settlementType');
  bind('cfg-specialisation',  'specialisation');
  bind('cfg-population',      'population',           'config', function(v) { return Math.max(1, parseInt(v, 10) || 1); });
  bind('cfg-non-matching',    'taxModifierPercent', 'config', function(v) { return Math.max(0, parseFloat(v) || 0); });
  bind('cfg-player-name',     'playerName');
  bind('cfg-date',            'date');
  bind('fta-client-name',     'ftaClientName',  'ftaConfig');
  bind('fta-per-person-limit','perPersonLimit',  'ftaConfig', function(v) { return Math.max(0, parseInt(v, 10) || 0); });

  // date is free text — no default needed
}

document.addEventListener('DOMContentLoaded', function() {
  // Tabs
  document.querySelectorAll('.tab-btn').forEach(function(btn) {
    btn.addEventListener('click', function() { switchTab(btn.dataset.tab); });
  });

  // Clear cart
  var clearBtn = document.getElementById('btn-clear-cart');
  if (clearBtn) clearBtn.addEventListener('click', function() {
    if (confirm('Clear all items from the cart?')) clearCart();
  });

  // Snap FTA limit removed — free-entry number box now

  // Generate buttons
  var btnTax = document.getElementById('btn-generate-tax');
  if (btnTax) btnTax.addEventListener('click', function() { generateTaxForm(calcTax()); });

  var btnFTA = document.getElementById('btn-generate-fta');
  if (btnFTA) btnFTA.addEventListener('click', function() { generateFTAForm(calcFTA()); });

  // Copy buttons
  initCopyButtons();

  // Wire config inputs
  wireConfig();

  // Load data
  var searchInput = document.getElementById('item-search');
  if (searchInput) searchInput.placeholder = 'Loading items\u2026';

  loadItems().then(function(result) {
    state.allItems = result.items;
    updateCacheStatus(result.lastFetched, result.warning);

    if (searchInput) {
      searchInput.disabled    = result.items.length === 0;
      searchInput.placeholder = result.items.length > 0
        ? ('Search ' + result.items.length + ' items by name or ID\u2026')
        : 'Item data unavailable \u2014 check connection';
    }

    if (result.items.length > 0) {
      initSearch(result.items, function(item) { addItem(item); });
      initMarketBrowser(result.items);
    }
  });

  // Refresh button
  var refreshBtn = document.getElementById('btn-refresh');
  if (refreshBtn) refreshBtn.addEventListener('click', function() {
    refreshBtn.disabled    = true;
    refreshBtn.textContent = 'Refreshing\u2026';
    forceRefresh().then(function(r) {
      state.allItems = r.items;
      updateSearchItems(r.items);
      refreshCartPrices(r.items);
      updateCacheStatus(r.lastFetched, null);
      if (searchInput) searchInput.placeholder = 'Search ' + r.items.length + ' items by name or ID\u2026';
      marketState.initialized = false;
      initMarketBrowser(r.items);
      if (state.activeTab === 'market') renderMarketBrowser();
    }).catch(function() {
      updateCacheStatus(null, 'Refresh failed');
    }).then(function() {
      refreshBtn.disabled    = false;
      refreshBtn.textContent = 'Refresh';
    });
  });

  // Initial render
  renderCart();
  recalcAll();
});

// ═══════════════════════════════════════════════════════════════════════════
// MARKET BROWSER
// ═══════════════════════════════════════════════════════════════════════════

var marketState = {
  sortCol: 'name',
  sortDir: 'asc',
  searchQuery: '',
  catFilter: '',
  trendFilter: '',
  buyingFilter: '',
  initialized: false,
};

function getTrend(item) {
  var cur  = item.currentPrice;
  var last = item.lastKnownPrice;
  if (cur === null || last === null || last === 0) return 'flat';
  var pct = (cur - last) / last;
  if (pct >  0.001) return 'up';
  if (pct < -0.001) return 'down';
  return 'flat';
}

function getTrendPct(item) {
  var cur  = item.currentPrice;
  var last = item.lastKnownPrice;
  if (cur === null || last === null || last === 0) return 0;
  return ((cur - last) / last) * 100;
}

function makeSparklinesVG(item) {
  var cur  = item.currentPrice;
  var last = item.lastKnownPrice;
  var trend = getTrend(item);

  var w = 72, h = 28;
  var colMap = { up: '#4ab87a', down: '#c94040', flat: '#9a8e68' };
  var col = colMap[trend];

  if (cur === null || last === null) {
    // flat line
    return '<svg class="trend-sparkline" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">' +
      '<line x1="4" y1="' + (h/2) + '" x2="' + (w-4) + '" y2="' + (h/2) + '" stroke="' + col + '" stroke-width="1.5" stroke-dasharray="3,2" opacity="0.4"/>' +
      '</svg>';
  }

  // Build a mini sparkline: 5 synthetic points bridging last -> cur with slight wave
  var pts = [];
  for (var i = 0; i < 5; i++) {
    var t   = i / 4;
    var val = last + (cur - last) * t;
    // add tiny noise for visual interest (deterministic via item id hash)
    var noise = 0;
    if (item.id) {
      var code = 0;
      for (var c = 0; c < item.id.length; c++) code += item.id.charCodeAt(c);
      noise = Math.sin(code * (i + 1) * 2.3) * 0.03 * Math.abs(cur - last);
    }
    pts.push(val + noise);
  }

  var minV = Math.min.apply(null, pts);
  var maxV = Math.max.apply(null, pts);
  var range = maxV - minV || 1;

  var pad = 4;
  var coords = pts.map(function(v, i) {
    var x = pad + (i / (pts.length - 1)) * (w - pad * 2);
    var y = (h - pad) - ((v - minV) / range) * (h - pad * 2);
    return x + ',' + y;
  });

  // Area fill path
  var first = coords[0].split(',');
  var last_  = coords[coords.length - 1].split(',');
  var areaPath = 'M' + coords.join(' L') +
    ' L' + last_[0] + ',' + (h - pad) +
    ' L' + first[0] + ',' + (h - pad) + ' Z';

  // Line path
  var linePath = 'M' + coords.join(' L');

  // Endpoint dot
  var ep = coords[coords.length - 1].split(',');

  return '<svg class="trend-sparkline" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">' +
    '<defs>' +
      '<linearGradient id="sg' + (item.id||'x').replace(/[^a-z0-9]/gi,'') + '" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0%" stop-color="' + col + '" stop-opacity="0.25"/>' +
        '<stop offset="100%" stop-color="' + col + '" stop-opacity="0.02"/>' +
      '</linearGradient>' +
    '</defs>' +
    '<path d="' + areaPath + '" fill="url(#sg' + (item.id||'x').replace(/[^a-z0-9]/gi,'') + ')"/>' +
    '<path d="' + linePath + '" fill="none" stroke="' + col + '" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>' +
    '<circle cx="' + ep[0] + '" cy="' + ep[1] + '" r="2.5" fill="' + col + '"/>' +
    '</svg>';
}

function initMarketBrowser(items) {
  var catSet = {};
  items.forEach(function(it) { if (it.category) catSet[it.category] = 1; });
  var cats = Object.keys(catSet).sort();
  var catSel = document.getElementById('market-cat-filter');
  if (catSel) {
    catSel.innerHTML = '<option value="">All Categories</option>';
    cats.forEach(function(c) {
      var o = document.createElement('option');
      o.value = c; o.textContent = c;
      catSel.appendChild(o);
    });
  }

  // Wire search & filters
  function wire(id, key) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input',  function() { marketState[key] = el.value; renderMarketBrowser(); });
    el.addEventListener('change', function() { marketState[key] = el.value; renderMarketBrowser(); });
  }
  wire('market-search',        'searchQuery');
  wire('market-cat-filter',    'catFilter');
  wire('market-trend-filter',  'trendFilter');
  wire('market-buying-filter', 'buyingFilter');

  // Sortable column headers
  var thead = document.querySelector('#market-table thead');
  if (thead) {
    thead.querySelectorAll('th[data-col]').forEach(function(th) {
      th.addEventListener('click', function() {
        var col = th.dataset.col;
        if (marketState.sortCol === col) {
          marketState.sortDir = marketState.sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          marketState.sortCol = col;
          marketState.sortDir = 'asc';
        }
        renderMarketBrowser();
      });
    });
  }

  marketState.initialized = true;
}

function renderMarketBrowser() {
  var items = state.allItems;
  if (!items || items.length === 0) {
    var tbody = document.getElementById('market-tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="market-empty">No market data available. Try refreshing.</td></tr>';
    return;
  }

  if (!marketState.initialized) initMarketBrowser(items);

  // Filter
  var q = marketState.searchQuery.toLowerCase().trim();
  var filtered = items.filter(function(it) {
    if (q) {
      var match = (it.name && it.name.toLowerCase().indexOf(q) >= 0) ||
                  (it.id   && it.id.toLowerCase().indexOf(q)   >= 0) ||
                  (it.category && it.category.toLowerCase().indexOf(q) >= 0);
      if (!match) return false;
    }
    if (marketState.catFilter && it.category !== marketState.catFilter) return false;
    if (marketState.trendFilter) {
      var t = getTrend(it);
      if (t !== marketState.trendFilter) return false;
    }
    if (marketState.buyingFilter) {
      var accepted = it.buying === true || it.buying === 'Yes' || it.buying === 'yes';
      if (marketState.buyingFilter === 'yes' && !accepted) return false;
      if (marketState.buyingFilter === 'no'  &&  accepted) return false;
    }
    return true;
  });

  // Sort
  var col = marketState.sortCol;
  var dir = marketState.sortDir === 'asc' ? 1 : -1;
  filtered.sort(function(a, b) {
    var av, bv;
    if (col === 'trend') {
      var tmap = { up: 2, flat: 1, down: 0 };
      av = tmap[getTrend(a)] || 0;
      bv = tmap[getTrend(b)] || 0;
    } else if (col === 'currentPrice') {
      av = a.currentPrice || 0;
      bv = b.currentPrice || 0;
    } else if (col === 'lastPrice') {
      av = a.lastPrice || 0;
      bv = b.lastPrice || 0;
    } else if (col === 'limit') {
      av = (a.limit && a.limit !== 'NONE' && a.limit !== '') ? parseFloat(a.limit) || 0 : -1;
      bv = (b.limit && b.limit !== 'NONE' && b.limit !== '') ? parseFloat(b.limit) || 0 : -1;
    } else if (col === 'buying') {
      av = (a.buying === true || a.buying === 'Yes' || a.buying === 'yes') ? 1 : 0;
      bv = (b.buying === true || b.buying === 'Yes' || b.buying === 'yes') ? 1 : 0;
    } else {
      av = (a[col] || '').toString().toLowerCase();
      bv = (b[col] || '').toString().toLowerCase();
    }
    if (av < bv) return -1 * dir;
    if (av > bv) return  1 * dir;
    return 0;
  });

  // Stats
  var rising = 0, falling = 0, stable = 0, priceSum = 0, priceCount = 0;
  filtered.forEach(function(it) {
    var t = getTrend(it);
    if (t === 'up')   rising++;
    if (t === 'down') falling++;
    if (t === 'flat') stable++;
    if (it.currentPrice !== null && it.currentPrice !== undefined) {
      priceSum += it.currentPrice; priceCount++;
    }
  });

  var setEl = function(id, v) { var el = document.getElementById(id); if (el) el.textContent = v; };
  setEl('ms-count',   filtered.length);
  setEl('ms-rising',  rising);
  setEl('ms-falling', falling);
  setEl('ms-stable',  stable);
  setEl('ms-avg',     priceCount > 0 ? (priceSum / priceCount).toFixed(4) : '—');

  // Update sort indicators
  var thead = document.querySelector('#market-table thead');
  if (thead) {
    thead.querySelectorAll('th[data-col]').forEach(function(th) {
      th.classList.remove('sort-asc', 'sort-desc');
      if (th.dataset.col === col) th.classList.add('sort-' + marketState.sortDir);
    });
  }

  // Render rows
  var tbody = document.getElementById('market-tbody');
  if (!tbody) return;

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="market-empty">No items match your search.</td></tr>';
    var cnt = document.getElementById('market-count'); if (cnt) cnt.textContent = '';
    return;
  }

  var html = '';
  filtered.forEach(function(it) {
    var trend    = getTrend(it);
    var trendPct = getTrendPct(it);
    var trendLabel = trend === 'up'   ? '▲ +' + Math.abs(trendPct).toFixed(1) + '%'
                   : trend === 'down' ? '▼ −' + Math.abs(trendPct).toFixed(1) + '%'
                   : '━ 0.0%';
    var spark    = makeSparklinesVG(it);
    var cur      = it.currentPrice !== null && it.currentPrice !== undefined
                   ? it.currentPrice.toFixed(4) : '—';
    var lastP    = it.lastPrice !== null && it.lastPrice !== undefined
                   ? it.lastPrice.toFixed(4) : '—';
    var limitStr = (it.limit && it.limit !== 'NONE' && it.limit !== '') ? it.limit : '—';
    var accepted = it.buying === true || it.buying === 'Yes' || it.buying === 'yes';
    var buyingHtml = accepted
      ? '<span class="buying-dot" title="Accepted"></span>'
      : '<span class="not-buying-dash" title="Not Accepted">✕</span>';

    html += '<tr>' +
      '<td class="mt-id">'  + (it.id || '—') + '</td>' +
      '<td class="mt-name">' + escHtml(it.name || '—') + '</td>' +
      '<td class="mt-cat"><span class="mt-cat-badge">' + escHtml(it.category || '—') + '</span></td>' +
      '<td class="mt-price">' + cur + '</td>' +
      '<td class="mt-last-price">' + lastP + '</td>' +
      '<td class="mt-trend-cell">' +
        '<div class="trend-container">' +
          spark +
          '<span class="trend-badge ' + trend + '">' + trendLabel + '</span>' +
        '</div>' +
      '</td>' +
      '<td class="mt-limit">' + limitStr + '</td>' +
      '<td class="mt-buying">' + buyingHtml + '</td>' +
      '</tr>';
  });

  tbody.innerHTML = html;

  var cnt = document.getElementById('market-count');
  if (cnt) cnt.textContent = 'Showing ' + filtered.length + ' of ' + items.length + ' items';
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}


