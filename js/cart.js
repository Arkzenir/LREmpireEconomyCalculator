/**
 * cart.js — Shared cart state with dual-price model
 */

import { getState, onCartChange } from './main.js';

let cart = []; // Array of cart entries

// ─── Cart Mutations ───────────────────────────────────────────────────────────

export function addItem(item) {
  const existing = cart.find(e => e.id === item.id);
  if (existing) {
    existing.quantity = Math.max(existing.quantity, 1);
    renderCart();
    // Focus qty input for this item
    const row = document.querySelector(`[data-cart-id="${item.id}"]`);
    if (row) row.querySelector('.qty-input')?.focus();
    return;
  }

  const unitPrice = resolveUnitPrice(item);
  cart.push({
    id:           item.id,
    name:         item.name,
    category:     item.category,
    quantity:     1,
    unitPrice:    unitPrice,
    currentPrice: item.currentPrice ?? 0,
    limit:        item.limit,
    buying:       item.buying,
  });
  renderCart();
  onCartChange(cart);
}

export function removeItem(id) {
  cart = cart.filter(e => e.id !== id);
  renderCart();
  onCartChange(cart);
}

export function clearCart() {
  cart = [];
  renderCart();
  onCartChange(cart);
}

export function getCart() {
  return cart;
}

/** Re-resolve unitPrice for all items when specialisation changes */
export function refreshPrices(allItems) {
  cart.forEach(entry => {
    const item = allItems.find(i => i.id === entry.id);
    if (item) {
      entry.unitPrice    = resolveUnitPrice(item);
      entry.currentPrice = item.currentPrice ?? 0;
      entry.buying       = item.buying;
      entry.limit        = item.limit;
    }
  });
  renderCart();
  onCartChange(cart);
}

function resolveUnitPrice(item) {
  const { config } = getState();
  const specKey = config.specialisation;
  if (!specKey || specKey === 'none') return item.currentPrice ?? 0;
  return item[specKey] ?? item.currentPrice ?? 0;
}

// ─── Rendering ───────────────────────────────────────────────────────────────

export function renderCart() {
  const { activeTab } = getState();
  const tbody   = document.getElementById('cart-tbody');
  const totEl   = document.getElementById('cart-total');
  const warnEl  = document.getElementById('buying-warning');

  if (!tbody) return;

  if (cart.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="cart-empty">No items added yet.</td></tr>';
    if (totEl)  totEl.textContent = '0.000';
    if (warnEl) warnEl.classList.add('hidden');
    onCartChange(cart);
    return;
  }

  const notAccepted = cart.filter(e => !e.buying);
  if (warnEl) {
    if (notAccepted.length > 0) {
      warnEl.textContent = `⚠ ${notAccepted.length} item(s) in your cart are not accepted by the Empire and have been excluded from all calculations.`;
      warnEl.classList.remove('hidden');
    } else {
      warnEl.classList.add('hidden');
    }
  }

  let runningTotal = 0;
  tbody.innerHTML = '';

  cart.forEach(entry => {
    const isAccepted = entry.buying;
    const price      = activeTab === 'fta' ? entry.currentPrice : entry.unitPrice;
    const lineTotal  = isAccepted ? entry.quantity * price : 0;
    if (isAccepted) runningTotal += lineTotal;

    const limitWarn = entry.limit != null && entry.quantity > entry.limit;

    const tr = document.createElement('tr');
    tr.dataset.cartId = entry.id;
    tr.className = !isAccepted ? 'row-not-accepted' : '';

    tr.innerHTML = `
      <td>
        <span class="item-name">${escHtml(entry.name)}</span>
        ${!isAccepted ? '<span class="badge-not-accepted">Not Accepted</span>' : ''}
        ${limitWarn ? `<span class="badge-limit-warn">Over limit (${entry.limit})</span>` : ''}
      </td>
      <td class="cat-cell">${escHtml(entry.category)}</td>
      <td class="price-cell">
        ${isAccepted ? price.toFixed(3) : '—'}
        ${activeTab === 'fta' && isAccepted ? '<span class="price-label">FTA base</span>' : ''}
      </td>
      <td class="qty-cell">
        <input type="number" class="qty-input" min="0" max="9999"
               value="${entry.quantity}" data-id="${escHtml(entry.id)}">
        ${entry.limit != null ? `<span class="limit-badge">/${entry.limit}</span>` : ''}
      </td>
      <td class="total-cell ${!isAccepted ? 'struck' : ''}">
        ${isAccepted ? lineTotal.toFixed(3) : '—'}
      </td>
      <td class="remove-cell">
        <button class="btn-remove" data-id="${escHtml(entry.id)}" title="Remove item">✕</button>
      </td>`;

    tbody.appendChild(tr);
  });

  // Wire quantity inputs
  tbody.querySelectorAll('.qty-input').forEach(input => {
    input.addEventListener('change', e => {
      const id    = e.target.dataset.id;
      const entry = cart.find(c => c.id === id);
      if (!entry) return;
      entry.quantity = Math.max(0, parseInt(e.target.value) || 0);
      renderCart();
      onCartChange(cart);
    });
  });

  // Wire remove buttons
  tbody.querySelectorAll('.btn-remove').forEach(btn => {
    btn.addEventListener('click', e => removeItem(e.target.dataset.id));
  });

  if (totEl) totEl.textContent = runningTotal.toFixed(3);
  onCartChange(cart);
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
