/**
 * main.js — App init, shared state, tab switching, event wiring
 */

import { loadItems, forceRefresh } from './cache.js';
import { initSearch, updateItems } from './search.js';
import { addItem, renderCart, refreshPrices, clearCart } from './cart.js';
import { renderTaxCalc, initTaxFormButton } from './tax.js';
import { renderFTACalc, initFTAFormButton, initFTAInputs } from './fta.js';
import { initCopyButtons } from './form.js';

// ─── Shared state ─────────────────────────────────────────────────────────────

let state = {
  activeTab: 'tax',
  allItems:  [],
  config: {
    settlementName:       '',
    settlementType:       'Village',
    specialisation:       'none',
    population:           1,
    nonMatchingResidents: 0,
    playerName:           '',
    date:                 today(),
  },
  ftaConfig: {
    ftaClientName:  '',
    perPersonLimit: 150,
  },
};

export function getState() { return state; }

export function onCartChange() { recalcAll(); }

// ─── Recalc ───────────────────────────────────────────────────────────────────

function recalcAll() {
  if (state.activeTab === 'tax') renderTaxCalc();
  else                            renderFTACalc();
}

// ─── Tab switching ────────────────────────────────────────────────────────────

function switchTab(tab) {
  state.activeTab = tab;

  document.querySelectorAll('.tab-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tab));

  document.getElementById('fta-config-section').classList.toggle('hidden', tab !== 'fta');
  document.getElementById('fta-cap-warning').classList.add('hidden');
  document.getElementById('tax-calc-panel').classList.toggle('hidden', tab !== 'tax');
  document.getElementById('fta-calc-panel').classList.toggle('hidden', tab !== 'fta');

  document.getElementById('calc-panel-title').innerHTML =
    tab === 'tax'
      ? '<span class="panel-title-icon">⚖️</span> Tax Calculations'
      : '<span class="panel-title-icon">💰</span> FTA Calculations';

  document.getElementById('btn-generate-tax').classList.toggle('hidden', tab !== 'tax');
  document.getElementById('btn-generate-fta').classList.toggle('hidden', tab !== 'fta');

  const lbl = document.getElementById('cart-total-label');
  if (lbl) lbl.textContent = tab === 'tax' ? 'Total Submitted Value:' : 'Total Base Value:';

  // Hide previous form output
  ['tax-form-output', 'fta-form-output', 'btn-copy-tax', 'btn-copy-fta'].forEach(id =>
    document.getElementById(id)?.classList.add('hidden'));
  document.getElementById('form-output-section')?.classList.add('hidden');

  renderCart();
  recalcAll();
}

// ─── Config wiring ────────────────────────────────────────────────────────────

function wireConfig() {
  function bind(id, key, sub, transform) {
    sub       = sub       || 'config';
    transform = transform || (v => v);
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
      state[sub][key] = transform(el.value);
      if (key === 'specialisation') refreshPrices(state.allItems);
      renderCart();
      recalcAll();
    });
  }

  bind('cfg-settlement-name', 'settlementName');
  bind('cfg-settlement-type', 'settlementType');
  bind('cfg-specialisation',  'specialisation');
  bind('cfg-population',      'population',           'config', v => Math.max(1, parseInt(v) || 1));
  bind('cfg-non-matching',    'nonMatchingResidents', 'config', v => Math.max(0, parseInt(v) || 0));
  bind('cfg-player-name',     'playerName');
  bind('cfg-date',            'date');
  bind('fta-client-name',     'ftaClientName',  'ftaConfig');
  bind('fta-per-person-limit','perPersonLimit',  'ftaConfig', v => snapLimit(parseInt(v) || 150));

  const dateEl = document.getElementById('cfg-date');
  if (dateEl && !dateEl.value) { dateEl.value = today(); state.config.date = today(); }
}

// ─── Cache status ─────────────────────────────────────────────────────────────

function updateCacheStatus(lastFetched, warning) {
  const el = document.getElementById('cache-status');
  if (!el) return;
  if (!lastFetched) {
    el.textContent = 'Data unavailable';
    el.className   = 'cache-status cache-status--error';
    return;
  }
  const mins = Math.floor((Date.now() - lastFetched) / 60000);
  const hrs  = Math.floor(mins / 60);
  const ago  = hrs > 0 ? `${hrs}h ${mins % 60}m ago` : mins > 0 ? `${mins}m ago` : 'just now';
  el.textContent = warning ? `⚠ ${warning} (last: ${ago})` : `Updated ${ago}`;
  el.className   = 'cache-status ' + (warning ? 'cache-status--warn' : 'cache-status--ok');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function snapLimit(v) {
  return Math.round(Math.max(150, Math.min(450, v)) / 50) * 50;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────

async function init() {
  document.querySelectorAll('.tab-btn').forEach(btn =>
    btn.addEventListener('click', () => switchTab(btn.dataset.tab)));

  document.getElementById('btn-clear-cart')?.addEventListener('click', () => {
    if (confirm('Clear all items from the cart?')) clearCart();
  });

  document.getElementById('loyalty-toggle')?.addEventListener('click', () =>
    document.getElementById('loyalty-info')?.classList.toggle('hidden'));

  wireConfig();
  initTaxFormButton();
  initFTAFormButton();
  initFTAInputs();
  initCopyButtons();

  const searchInput = document.getElementById('item-search');
  if (searchInput) searchInput.placeholder = 'Loading items…';

  const result = await loadItems();
  state.allItems = result.items;
  updateCacheStatus(result.lastFetched, result.warning);

  if (searchInput) {
    searchInput.disabled    = result.items.length === 0;
    searchInput.placeholder = result.items.length > 0
      ? `Search ${result.items.length} items by name or ID…`
      : 'Item data unavailable — check connection';
  }

  if (result.items.length > 0) initSearch(result.items, item => addItem(item));

  document.getElementById('btn-refresh')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-refresh');
    if (btn) { btn.disabled = true; btn.textContent = 'Refreshing…'; }
    try {
      const r = await forceRefresh();
      state.allItems = r.items;
      updateItems(r.items);
      refreshPrices(r.items);
      updateCacheStatus(r.lastFetched, null);
      if (searchInput) searchInput.placeholder = `Search ${r.items.length} items by name or ID…`;
    } catch (e) {
      updateCacheStatus(null, 'Refresh failed');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Refresh'; }
    }
  });

  renderCart();
  recalcAll();
}

document.addEventListener('DOMContentLoaded', init);
