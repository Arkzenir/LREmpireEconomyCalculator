/**
 * tax.js — Tax calculation logic
 */

import { getState } from './main.js';
import { getCart }  from './cart.js';
import { generateTaxForm } from './form.js';

// Tax rates per settlement type (base = rate * population)
const TAX_RATE = {
  Hamlet:  0,
  Village: 100,
  Town:    125,
  City:    150,
  Capital: 150,
};

const BUYBACK_CAP_MULTIPLIER = {
  Village: 2.0,
  Town:    1.5,
  City:    1.0,
  Capital: 1.0,
};

const BUYBACK_BUY_RATE = {
  Village: 0.75,
  Town:    0.65,
  City:    0.55,
  Capital: 0.55,
};

const GOBLIN_EXEMPT = 3;

// ─── Calculation ──────────────────────────────────────────────────────────────

export function calcTax() {
  const { config } = getState();
  const cart       = getCart();

  const type       = config.settlementType;
  const population = Math.max(1, parseInt(config.population) || 1);
  const residents  = Math.max(0, parseInt(config.nonMatchingResidents) || 0);

  const taxableResidents = Math.max(0, residents - GOBLIN_EXEMPT);
  const raceModifier     = taxableResidents * 0.05;

  const baseTax  = (TAX_RATE[type] || 0) * population;
  const finalTax = baseTax * (1 + raceModifier);

  const acceptedItems = cart.filter(i => i.buying && i.quantity > 0);
  const submittedValue = acceptedItems.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);

  const excessValue = Math.max(0, submittedValue - finalTax);

  let cappedSurplus  = 0;
  let empirePayout   = 0;
  let buybackCap     = 0;

  if (type !== 'Hamlet') {
    const capMult  = BUYBACK_CAP_MULTIPLIER[type] ?? 1.0;
    const buyRate  = BUYBACK_BUY_RATE[type] ?? 0.55;
    buybackCap     = finalTax * capMult;
    cappedSurplus  = Math.min(excessValue, buybackCap);
    empirePayout   = cappedSurplus * buyRate;
  }

  return {
    type, population, residents, taxableResidents,
    raceModifier, baseTax, finalTax,
    submittedValue, excessValue,
    buybackCap, cappedSurplus, empirePayout,
    isHamlet: type === 'Hamlet',
    taxCovered: submittedValue >= finalTax,
  };
}

// ─── UI rendering ─────────────────────────────────────────────────────────────

export function renderTaxCalc() {
  const panel = document.getElementById('tax-calc-panel');
  if (!panel) return;

  const r = calcTax();
  const fmt = v => v.toFixed(2);
  const pct = v => (v * 100).toFixed(0);

  if (r.isHamlet) {
    panel.innerHTML = `
      <div class="calc-notice">
        <span class="notice-icon">ℹ</span>
        Hamlets have no tax due and no buyback. No form is needed.
      </div>`;
    document.getElementById('btn-generate-tax').disabled = true;
    return;
  }

  const cart = getCart();
  const hasItems = cart.some(i => i.buying && i.quantity > 0);
  document.getElementById('btn-generate-tax').disabled = !hasItems;

  panel.innerHTML = `
    <div class="calc-grid">
      <div class="calc-section">
        <h4 class="calc-heading">Tax Calculation</h4>
        <div class="calc-row">
          <span class="calc-label">Base Tax</span>
          <span class="calc-value">${fmt(r.baseTax)} coins</span>
          <span class="calc-note">${r.population} pop × ${TAX_RATE[r.type]}</span>
        </div>
        <div class="calc-row ${r.raceModifier > 0 ? '' : 'calc-row--muted'}">
          <span class="calc-label">Race Modifier</span>
          <span class="calc-value">+${pct(r.raceModifier)}%</span>
          <span class="calc-note">${r.taxableResidents} taxable residents (${r.residents} − ${Math.min(r.residents, 3)} exempt goblins)</span>
        </div>
        <div class="calc-row calc-row--total">
          <span class="calc-label">Final Tax Due</span>
          <span class="calc-value">${fmt(r.finalTax)} coins</span>
        </div>
      </div>

      <div class="calc-section">
        <h4 class="calc-heading">Submitted Goods</h4>
        <div class="calc-row">
          <span class="calc-label">Submitted Value</span>
          <span class="calc-value">${fmt(r.submittedValue)} coins</span>
        </div>
        <div class="calc-row ${r.taxCovered ? 'calc-row--good' : 'calc-row--warn'}">
          <span class="calc-label">${r.taxCovered ? 'Excess Value' : 'Shortfall'}</span>
          <span class="calc-value">
            ${r.taxCovered
              ? fmt(r.excessValue) + ' coins'
              : '⚠ ' + fmt(r.finalTax - r.submittedValue) + ' coins short'}
          </span>
        </div>
      </div>

      <div class="calc-section">
        <h4 class="calc-heading">Buyback</h4>
        <div class="calc-row">
          <span class="calc-label">Buyback Cap</span>
          <span class="calc-value">${fmt(r.buybackCap)} coins</span>
          <span class="calc-note">Tax × ${BUYBACK_CAP_MULTIPLIER[r.type]}</span>
        </div>
        <div class="calc-row">
          <span class="calc-label">Capped Surplus</span>
          <span class="calc-value">${fmt(r.cappedSurplus)} coins</span>
        </div>
        <div class="calc-row calc-row--total calc-row--payout">
          <span class="calc-label">Empire Payout</span>
          <span class="calc-value">${fmt(r.empirePayout)} coins</span>
          <span class="calc-note">@ ${pct(BUYBACK_BUY_RATE[r.type])}% buy rate</span>
        </div>
      </div>
    </div>`;
}

// ─── Form generation trigger ──────────────────────────────────────────────────

export function initTaxFormButton() {
  document.getElementById('btn-generate-tax')?.addEventListener('click', () => {
    const r = calcTax();
    generateTaxForm(r);
  });
}
