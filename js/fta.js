/**
 * fta.js — FTA bulk sale calculation logic
 */

import { getState } from './main.js';
import { getCart }  from './cart.js';
import { generateFTAForm } from './form.js';

const MIN_LIMIT  = 150;
const MAX_LIMIT  = 450;
const STEP       = 50;
const FTA_MARKUP = 1.25;

function ftaCutRate(ftaPrice) {
  if (ftaPrice <= 3000) return 0.10;
  if (ftaPrice <= 4000) return 0.25;
  return 0.40;
}

function snapLimit(v) {
  const clamped = Math.max(MIN_LIMIT, Math.min(MAX_LIMIT, v));
  return Math.round(clamped / STEP) * STEP;
}

// ─── Calculation ──────────────────────────────────────────────────────────────

export function calcFTA() {
  const { config, ftaConfig } = getState();
  const cart = getCart();

  const population    = Math.max(1, parseInt(config.population) || 1);
  const perPersonLim  = snapLimit(parseInt(ftaConfig.perPersonLimit) || MIN_LIMIT);
  const weeklyCap     = perPersonLim * population;

  const acceptedItems = cart.filter(i => i.buying && i.quantity > 0);
  const baseTotal     = acceptedItems.reduce((sum, i) => sum + i.quantity * i.currentPrice, 0);

  const ftaPrice   = baseTotal * FTA_MARKUP;
  const cutRate    = ftaCutRate(ftaPrice);
  const yourCut    = ftaPrice * (1 - cutRate);
  const ftaCut     = ftaPrice * cutRate;

  const loyaltyTier = Math.round((perPersonLim - MIN_LIMIT) / STEP); // 0–6
  const capExceeded = baseTotal > weeklyCap;

  return {
    population, perPersonLim, weeklyCap,
    baseTotal, ftaPrice,
    cutRate, yourCut, ftaCut,
    loyaltyTier, capExceeded,
    acceptedItems,
  };
}

// ─── UI ───────────────────────────────────────────────────────────────────────

export function renderFTACalc() {
  const panel = document.getElementById('fta-calc-panel');
  if (!panel) return;

  const r   = calcFTA();
  const fmt = v => v.toFixed(2);
  const pct = v => (v * 100).toFixed(0);

  const cart    = getCart();
  const hasItems = cart.some(i => i.buying && i.quantity > 0);
  const genBtn   = document.getElementById('btn-generate-fta');
  if (genBtn) genBtn.disabled = !hasItems;

  const capWarn = document.getElementById('fta-cap-warning');
  if (capWarn) {
    if (r.capExceeded) {
      capWarn.textContent = `⚠ Weekly settlement cap exceeded! Your base total (${fmt(r.baseTotal)} coins) exceeds the cap of ${fmt(r.weeklyCap)} coins (${r.perPersonLim} × ${r.population} pop).`;
      capWarn.classList.remove('hidden');
    } else {
      capWarn.classList.add('hidden');
    }
  }

  panel.innerHTML = `
    <div class="calc-grid">
      <div class="calc-section">
        <h4 class="calc-heading">Settlement Cap</h4>
        <div class="calc-row">
          <span class="calc-label">Per-Person Limit</span>
          <span class="calc-value">${r.perPersonLim} coins</span>
          <span class="calc-note">Loyalty Tier ${r.loyaltyTier}/6</span>
        </div>
        <div class="calc-row">
          <span class="calc-label">Weekly Cap</span>
          <span class="calc-value">${fmt(r.weeklyCap)} coins</span>
          <span class="calc-note">${r.perPersonLim} × ${r.population} pop</span>
        </div>
        <div class="calc-row ${r.capExceeded ? 'calc-row--warn' : 'calc-row--good'}">
          <span class="calc-label">Cap Used</span>
          <span class="calc-value">${fmt(r.baseTotal)} / ${fmt(r.weeklyCap)}</span>
          <span class="calc-note">${r.capExceeded ? '⚠ Exceeded' : '✓ Within limit'}</span>
        </div>
      </div>

      <div class="calc-section">
        <h4 class="calc-heading">FTA Price</h4>
        <div class="calc-row">
          <span class="calc-label">Base Total</span>
          <span class="calc-value">${fmt(r.baseTotal)} coins</span>
        </div>
        <div class="calc-row calc-row--total">
          <span class="calc-label">FTA Price (×1.25)</span>
          <span class="calc-value">${fmt(r.ftaPrice)} coins</span>
        </div>
        <div class="calc-row">
          <span class="calc-label">Cut Rate Bracket</span>
          <span class="calc-value">${pct(r.cutRate)}%</span>
          <span class="calc-note">${r.ftaPrice <= 3000 ? '≤ 3000' : r.ftaPrice <= 4000 ? '3001–4000' : '4001+'}</span>
        </div>
      </div>

      <div class="calc-section">
        <h4 class="calc-heading">Your Earnings</h4>
        <div class="calc-row calc-row--total calc-row--payout">
          <span class="calc-label">Your Cut (${pct(1 - r.cutRate)}%)</span>
          <span class="calc-value">${fmt(r.yourCut)} coins</span>
        </div>
        <div class="calc-row calc-row--muted">
          <span class="calc-label">FTA Cut (${pct(r.cutRate)}%)</span>
          <span class="calc-value">${fmt(r.ftaCut)} coins</span>
        </div>
      </div>
    </div>`;
}

export function initFTAFormButton() {
  document.getElementById('btn-generate-fta')?.addEventListener('click', () => {
    const r = calcFTA();
    generateFTAForm(r);
  });
}

// ─── Per-person limit input ───────────────────────────────────────────────────

export function initFTAInputs() {
  const limInput = document.getElementById('fta-per-person-limit');
  if (!limInput) return;
  limInput.addEventListener('change', e => {
    const snapped = snapLimit(parseInt(e.target.value) || MIN_LIMIT);
    e.target.value = snapped;
    // Update ftaConfig via event
    document.dispatchEvent(new CustomEvent('ftaConfigChange', { detail: { perPersonLimit: snapped } }));
  });
}
