/**
 * form.js — Form text generation + clipboard copy
 */

import { getState } from './main.js';
import { getCart }  from './cart.js';

const LINE = '────────────────────────────────────────';

function pad(label, value, width) {
  width = width || 26;
  return label.padEnd(width) + value;
}

// ─── Tax Form ─────────────────────────────────────────────────────────────────

export function generateTaxForm(calc) {
  const { config } = getState();
  const cart       = getCart();
  const accepted   = cart.filter(i => i.buying && i.quantity > 0);
  const fmt        = v => v.toFixed(2);

  const goodsLines = accepted.length
    ? accepted.map(i => `  - ${i.name} × ${i.quantity}`).join('\n')
    : '  (none)';

  const valueLines = accepted.length
    ? accepted.map(i => `  - ${i.name}: ${i.quantity} × ${i.unitPrice.toFixed(3)} = ${(i.quantity * i.unitPrice).toFixed(3)}`).join('\n')
    : '  (none)';

  let text = `TAX FORM
${LINE}
${pad('Settlement Name:', config.settlementName || '(unnamed)')}
${pad('Settlement Type:', config.settlementType || '—')}
${pad('Specialisation:', labelForSpec(config.specialisation))}

Goods Submitted:
${goodsLines}

Declared Value:
${valueLines}

${pad('Total Declared Value:', fmt(calc.submittedValue) + ' coins')}

${LINE}
${pad('Base Tax:', fmt(calc.baseTax) + ' coins')}
${pad('Race Modifier:', '+' + (calc.raceModifier * 100).toFixed(0) + '%')}
${pad('Final Tax Due:', fmt(calc.finalTax) + ' coins')}
${pad('Tax Paid:', fmt(Math.min(calc.submittedValue, calc.finalTax)) + ' coins')}
`;

  if (!calc.isHamlet) {
    text += `
${LINE}
Buyback:
${pad('  Excess Value:', fmt(calc.excessValue) + ' coins')}
${pad('  Max Buyback Limit:', fmt(calc.buybackCap) + ' coins')}
${pad('  Capped Surplus:', fmt(calc.cappedSurplus) + ' coins')}
${pad('  Empire Payout:', fmt(calc.empirePayout) + ' coins')}
`;
  }

  text += `
${LINE}
${pad('Date:', config.date || todayStr())}
${pad('Signature:', config.playerName || '(unsigned)')}
`;

  showOutput('tax', text);
}

// ─── FTA Form ─────────────────────────────────────────────────────────────────

export function generateFTAForm(calc) {
  const { config, ftaConfig } = getState();
  const cart    = getCart();
  const accepted = cart.filter(i => i.buying && i.quantity > 0);
  const fmt     = v => v.toFixed(2);
  const pct     = v => (v * 100).toFixed(0);

  const goodsLines = accepted.length
    ? accepted.map(i => `  - ${i.name} × ${i.quantity}`).join('\n')
    : '  (none)';

  const valueLines = accepted.length
    ? accepted.map(i => `  - ${i.name}: ${i.quantity} × ${i.currentPrice.toFixed(3)} = ${(i.quantity * i.currentPrice).toFixed(3)}`).join('\n')
    : '  (none)';

  const text = `FTA SALES FORM
${LINE}
${pad('Settlement Name:', config.settlementName || '(unnamed)')}
${pad('FTA Client / Faction:', ftaConfig.ftaClientName || '(unnamed)')}

Goods Submitted:
${goodsLines}

Declared Value (Base Empire Price):
${valueLines}

${LINE}
${pad('Total Base Price:', fmt(calc.baseTotal) + ' coins')}
${pad('Total × 1.25 (FTA Price):', fmt(calc.ftaPrice) + ' coins')}

${pad('Cut Rate Bracket:', pct(calc.cutRate) + '%')}
${pad('  Your Cut (' + pct(1 - calc.cutRate) + '%):', fmt(calc.yourCut) + ' coins')}
${pad('  FTA Cut (' + pct(calc.cutRate) + '%):', fmt(calc.ftaCut) + ' coins')}

${LINE}
${pad('Weekly Limit Used:', fmt(calc.baseTotal) + ' / ' + fmt(calc.weeklyCap) + (calc.capExceeded ? '  ⚠ EXCEEDED' : ''))}
${pad('Per-Person Limit:', calc.perPersonLim + ' coins')}
${pad('Loyalty Tier:', calc.loyaltyTier + ' / 6')}

${LINE}
${pad('Date:', config.date || todayStr())}
${pad('Signature:', config.playerName || '(unsigned)')}
`;

  showOutput('fta', text);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function showOutput(which, text) {
  const section = document.getElementById('form-output-section');
  const titleEl = document.getElementById('form-output-title');

  // Hide both textareas and copy buttons first
  ['tax-form-output', 'fta-form-output', 'btn-copy-tax', 'btn-copy-fta'].forEach(id =>
    document.getElementById(id)?.classList.add('hidden'));

  // Show the correct one
  const ta     = document.getElementById(which + '-form-output');
  const copyBtn = document.getElementById('btn-copy-' + which);

  if (ta) { ta.value = text; ta.classList.remove('hidden'); }
  if (copyBtn) copyBtn.classList.remove('hidden');
  if (section) section.classList.remove('hidden');

  if (titleEl) {
    titleEl.innerHTML = which === 'tax'
      ? '<span class="panel-title-icon">📜</span> Tax Form'
      : '<span class="panel-title-icon">🏪</span> FTA Sales Form';
  }

  section?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function labelForSpec(key) {
  const m = {
    'none':               'None (Current Price)',
    'priceIndustrialTown':'Industrial Town',
    'priceIndustrialCity':'Industrial City',
    'priceMarketTown':    'Market Town',
    'priceMarketCity':    'Market City',
    'priceReligiousTown': 'Religious Town',
    'priceTempleCity':    'Temple City',
  };
  return m[key] || key || '—';
}

// ─── Copy buttons ─────────────────────────────────────────────────────────────

export function initCopyButtons() {
  document.querySelectorAll('.btn-copy').forEach(btn => {
    btn.addEventListener('click', e => {
      const ta = document.getElementById(e.currentTarget.dataset.target);
      if (!ta) return;
      navigator.clipboard.writeText(ta.value)
        .then(() => flashCopy(e.currentTarget))
        .catch(() => { ta.select(); document.execCommand('copy'); flashCopy(e.currentTarget); });
    });
  });
}

function flashCopy(btn) {
  const orig = btn.textContent;
  btn.textContent = '✓ Copied!';
  btn.classList.add('btn-copy--success');
  setTimeout(() => { btn.textContent = orig; btn.classList.remove('btn-copy--success'); }, 1800);
}
