/**
 * search.js — Item search and autocomplete
 */

import { getState } from './main.js';

let allItems   = [];
let onSelect   = null;   // callback(item)
let activeIdx  = -1;
let suggestions = [];

// ─── Init ────────────────────────────────────────────────────────────────────

export function initSearch(items, selectCallback) {
  allItems = items;
  onSelect = selectCallback;

  const input = document.getElementById('item-search');
  const list  = document.getElementById('search-suggestions');

  input.addEventListener('input',   () => renderSuggestions(input, list));
  input.addEventListener('keydown', e  => handleKeydown(e, input, list));
  input.addEventListener('blur',    ()  => setTimeout(() => hideSuggestions(list), 150));
  input.addEventListener('focus',   ()  => renderSuggestions(input, list));
}

export function updateItems(items) {
  allItems = items;
}

// ─── Filtering ───────────────────────────────────────────────────────────────

function getPrice(item) {
  const { activeTab, config } = getState();
  if (activeTab === 'fta') return item.currentPrice;
  // Tax tab uses specialisation price
  const specKey = config.specialisation;
  if (!specKey || specKey === 'none') return item.currentPrice;
  return item[specKey] ?? item.currentPrice;
}

function filterItems(query) {
  if (!query || query.length < 1) return [];
  const q = query.toLowerCase();
  return allItems
    .filter(i => i.name.toLowerCase().includes(q) || i.id.toLowerCase().includes(q))
    .slice(0, 10);
}

// ─── Rendering ───────────────────────────────────────────────────────────────

function renderSuggestions(input, list) {
  const q = input.value.trim();
  suggestions = filterItems(q);
  activeIdx = -1;

  if (!suggestions.length) { hideSuggestions(list); return; }

  list.innerHTML = '';
  suggestions.forEach((item, idx) => {
    const price = getPrice(item);
    const priceStr = price != null ? `${price.toFixed(3)}` : '—';

    const li = document.createElement('li');
    li.className = 'suggestion-item' + (!item.buying ? ' not-accepted' : '');
    li.dataset.idx = idx;
    li.innerHTML = `
      <span class="sug-name">${escHtml(item.name)}</span>
      <span class="sug-meta">
        <span class="sug-cat">${escHtml(item.category)}</span>
        <span class="sug-price">${priceStr}¢</span>
        ${item.limit != null ? `<span class="sug-limit">Limit: ${item.limit}</span>` : ''}
        ${!item.buying ? '<span class="badge-not-accepted">Not Accepted</span>' : ''}
      </span>`;
    li.addEventListener('mousedown', () => selectItem(idx, input, list));
    list.appendChild(li);
  });

  list.classList.remove('hidden');
}

function hideSuggestions(list) {
  list.classList.add('hidden');
  activeIdx = -1;
}

function handleKeydown(e, input, list) {
  if (!suggestions.length) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    activeIdx = Math.min(activeIdx + 1, suggestions.length - 1);
    highlightItem(list);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    activeIdx = Math.max(activeIdx - 1, 0);
    highlightItem(list);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (activeIdx >= 0) selectItem(activeIdx, input, list);
    else if (suggestions.length > 0) selectItem(0, input, list);
  } else if (e.key === 'Escape') {
    hideSuggestions(list);
  }
}

function highlightItem(list) {
  list.querySelectorAll('.suggestion-item').forEach((li, i) => {
    li.classList.toggle('active', i === activeIdx);
  });
}

function selectItem(idx, input, list) {
  const item = suggestions[idx];
  if (!item) return;
  input.value = '';
  hideSuggestions(list);
  if (onSelect) onSelect(item);
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
