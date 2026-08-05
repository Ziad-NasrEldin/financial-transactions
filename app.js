/* Prototype question: which local-first finance dashboard state best supports a calm daily review?
   Six states live on one route and are shareable with ?variant=overview|transactions|analytics|cash-flow|review|recurring. */

import { createHarborLedger } from './harbor-ledger.js';
import {
  addDays,
  createManualRecurringRule,
  detectRecurringPatterns,
  manualRecurringCadenceOptions,
  setManualRecurringRulePaused,
  toISODate,
  updateManualRecurringRule
} from './harbor-recurring.js';

const app = document.querySelector('#app');
const harborLedger = createHarborLedger();
const MANUAL_RECURRING_STORAGE_KEY = 'harbor.manual-recurring.v1';

function loadManualRecurringRules() {
  try {
    const saved = window.localStorage.getItem(MANUAL_RECURRING_STORAGE_KEY);
    const parsed = saved ? JSON.parse(saved) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistManualRecurringRules(rules) {
  try {
    window.localStorage.setItem(MANUAL_RECURRING_STORAGE_KEY, JSON.stringify(rules));
    return true;
  } catch {
    return false;
  }
}

const views = [
  { id: 'overview', key: 'A', label: 'Overview', icon: 'overview' },
  { id: 'transactions', key: 'B', label: 'Transactions', icon: 'transactions' },
  { id: 'analytics', key: 'C', label: 'Analytics', icon: 'analytics' },
  { id: 'cash-flow', key: 'D', label: 'Cash Flow', icon: 'cash' },
  { id: 'review', key: 'E', label: 'Review Queue', icon: 'review' },
  { id: 'recurring', key: 'F', label: 'Recurring', icon: 'recurring' },
  { id: 'settings', key: 'G', label: 'Settings', icon: 'settings' }
];

const state = {
  view: getViewFromUrl(),
  isEditing: false,
  reviewCandidateId: null,
  toast: '',
  showAddTransaction: false,
  showRecurringRule: false,
  recurringRuleTransactionId: null,
  editingRecurringRuleId: null,
  manualTransactions: [],
  manualRecurringRules: loadManualRecurringRules(),
  transactionFilter: 'all',
  transactionQuery: '',
  trendTimeframe: '4',
  displayCurrency: 'EGP'
};

const DISPLAY_CURRENCIES = [
  { code: 'EGP', name: 'Egyptian pound', egpPerUnit: 1 },
  { code: 'USD', name: 'US dollar', egpPerUnit: 50 },
  { code: 'EUR', name: 'Euro', egpPerUnit: 54 }
];

const DISPLAY_CURRENCY_BY_CODE = Object.fromEntries(
  DISPLAY_CURRENCIES.map((currency) => [currency.code, currency])
);

const overviewTrendRanges = {
  1: { label: '1 week', days: 7 },
  2: { label: '2 weeks', days: 14 },
  4: { label: '4 weeks', days: 28 },
  8: { label: '8 weeks', days: 56 }
};

const iconPaths = {
  overview: '<path d="M4 12.5 12 5l8 7.5"/><path d="M6.5 11.5V19h11v-7.5"/><path d="M9.5 19v-4.8h5V19"/>',
  transactions: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 11h8M8 15h5"/>',
  analytics: '<path d="M4 19V5M4 19h16"/><path d="m7 15 3-3 3 2 5-6"/><circle cx="7" cy="15" r="1"/><circle cx="10" cy="12" r="1"/><circle cx="13" cy="14" r="1"/><circle cx="18" cy="8" r="1"/>',
  recurring: '<path d="M18 8a6.5 6.5 0 0 0-11.7-2.8L5 7"/><path d="M5 3v4h4"/><path d="M6 16a6.5 6.5 0 0 0 11.7 2.8L19 17"/><path d="M19 21v-4h-4"/>',
  cash: '<path d="M4 18.5V11"/><path d="M9 18.5V6"/><path d="M14 18.5v-4"/><path d="M19 18.5V4"/><path d="M3 20h18"/>',
  review: '<path d="M4 5.5h16v13H4z"/><path d="m8 12 2.5 2.5L16 9"/>',
  settings: '<path d="M12 15.4a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8Z"/><path d="m19.4 15 .1.1a1.7 1.7 0 0 1-2.4 2.4l-.1-.1a1.7 1.7 0 0 0-2.8 1.2v.2a1.7 1.7 0 0 1-3.4 0v-.2a1.7 1.7 0 0 0-2.8-1.2l-.1.1a1.7 1.7 0 0 1-2.4-2.4l.1-.1A1.7 1.7 0 0 0 6.4 12a1.7 1.7 0 0 1-1.7-1.7 1.7 1.7 0 0 1 1.7-1.7 1.7 1.7 0 0 0 1.2-2.8l-.1-.1a1.7 1.7 0 0 1 2.4-2.4l.1.1A1.7 1.7 0 0 0 12.8 2a1.7 1.7 0 0 1 1.7 1.7v.2a1.7 1.7 0 0 0 2.8 1.2l.1-.1a1.7 1.7 0 0 1 2.4 2.4l-.1.1A1.7 1.7 0 0 0 20.8 10a1.7 1.7 0 0 1 0 3.4 1.7 1.7 0 0 0-1.4 1.6Z"/>',
  arrowRight: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
  arrowLeft: '<path d="M19 12H5"/><path d="m11 6-6 6 6 6"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  chevronRight: '<path d="m9 6 6 6-6 6"/>',
  lock: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  shield: '<path d="M12 3 19 6v5c0 4.5-2.8 8.2-7 10-4.2-1.8-7-5.5-7-10V6l7-3Z"/><path d="m9 12 2 2 4-4"/>',
  trendUp: '<path d="m4 16 5-5 3 3 7-8"/><path d="M14 6h5v5"/>',
  trendDown: '<path d="m4 8 5 5 3-3 7 8"/><path d="M14 18h5v-5"/>',
  card: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/><path d="M7 15h3"/>',
  calendar: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/>',
  check: '<path d="m5 12 4.2 4.2L19 6.5"/>',
  edit: '<path d="m4 16.5-.7 3.2 3.2-.7L18 7.5a2.2 2.2 0 0 0-3.1-3.1L4 16.5Z"/><path d="m13.5 5.5 3 3"/>',
  message: '<path d="M4 5h16v11H8l-4 4V5Z"/><path d="M8 9h8M8 12h5"/>',
  bank: '<path d="m3 9 9-5 9 5"/><path d="M5 10v7M9 10v7M15 10v7M19 10v7M3 20h18M3 9h18"/>',
  coffee: '<path d="M5 8h11v5a5 5 0 0 1-5 5H10a5 5 0 0 1-5-5V8Z"/><path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16"/><path d="M8 4v2M12 3v3"/>',
  home: '<path d="m4 10 8-6 8 6"/><path d="M6 9v10h12V9"/><path d="M10 19v-5h4v5"/>',
  cart: '<path d="M4 5h2l1.5 9h9L19 8H7"/><circle cx="9" cy="18" r="1"/><circle cx="17" cy="18" r="1"/>',
  wallet: '<path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H19v14H6.5A2.5 2.5 0 0 1 4 16.5v-9Z"/><path d="M4 8h15M15 12h4v3h-4a1.5 1.5 0 0 1 0-3Z"/>',
  bolt: '<path d="m13 2-8 11h6l-1 9 8-11h-6l1-9Z"/>',
  alert: '<path d="M12 4 21 20H3L12 4Z"/><path d="M12 10v4M12 17h.01"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="10.8" cy="10.8" r="6.3"/><path d="m16 16 4 4"/>'
};

function icon(name, size = 18) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name] || ''}</svg>`;
}

function getViewFromUrl() {
  const requested = new URLSearchParams(window.location.search).get('variant');
  return views.some((view) => view.id === requested) ? requested : 'overview';
}

function currencyDefinition(code) {
  return DISPLAY_CURRENCY_BY_CODE[code] || DISPLAY_CURRENCY_BY_CODE.EGP;
}

function convertCurrency(value, sourceCurrency = 'EGP', targetCurrency = state.displayCurrency) {
  const amount = Number(value) || 0;
  const source = currencyDefinition(sourceCurrency);
  const target = currencyDefinition(targetCurrency);
  return amount * source.egpPerUnit / target.egpPerUnit;
}

function formatCurrency(value, sourceCurrency = 'EGP') {
  const targetCurrency = currencyDefinition(state.displayCurrency);
  const convertedAmount = convertCurrency(value, sourceCurrency, targetCurrency.code);
  return `${targetCurrency.code} ${convertedAmount.toLocaleString('en-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function signedCurrency(value, sourceCurrency = 'EGP', direction = '') {
  const amount = Number(value) || 0;
  const sign = amount < 0 || (amount === 0 && direction === 'debit') ? '-' : '+';
  return `${sign}${formatCurrency(Math.abs(amount), sourceCurrency)}`;
}

function currencyOptions() {
  return DISPLAY_CURRENCIES.map((currency) => `<option value="${currency.code}"${state.displayCurrency === currency.code ? ' selected' : ''}>${currency.code} · ${currency.name}</option>`).join('');
}

function currencySelect(id) {
  const currency = currencyDefinition(state.displayCurrency);
  const rateNote = currency.code === 'EGP' ? 'Base currency' : `EGP ${currency.egpPerUnit.toFixed(0)} = 1 ${currency.code}`;
  return `<label class="currency-control" for="${id}"><span>Display currency</span><select id="${id}" data-display-currency aria-label="Display currency">${currencyOptions()}</select><small>Prototype rate · ${rateNote}</small></label>`;
}

function formatProjectionDate(value, fallback = 'Not available') {
  const isoDate = toISODate(value);
  if (!isoDate) return fallback;
  const date = new Date(`${isoDate}T12:00:00Z`);
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function dateInputValue(value) {
  return toISODate(value) || new Date().toISOString().slice(0, 10);
}

function recurringIconForCategory(category = '') {
  const normalized = category.toLowerCase();
  if (normalized.includes('home') || normalized.includes('utility')) return 'home';
  if (normalized.includes('transport')) return 'card';
  if (normalized.includes('subscription')) return 'bolt';
  if (normalized.includes('food') || normalized.includes('eating')) return 'coffee';
  return 'card';
}

function escapeHtml(value) {
  const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(value ?? '').replace(/[&<>"']/g, (character) => entities[character]);
}

function reviewCandidateAmount(candidate) {
  const signedAmount = candidate.direction === 'credit' ? candidate.amount : -candidate.amount;
  return signedCurrency(signedAmount, candidate.currency || 'EGP', candidate.direction || 'debit');
}

function liveLedgerSummary() {
  const snapshot = harborLedger.snapshot();
  const approved = snapshot.events || [];
  const reviews = snapshot.reviewCandidates || [];
  const debits = approved.filter((event) => (event.direction || 'debit') === 'debit');
  const credits = approved.filter((event) => event.direction === 'credit');
  const debitTotal = debits.reduce((sum, event) => sum + convertCurrency(event.amount, event.currency || 'EGP', 'EGP'), 0);
  const creditTotal = credits.reduce((sum, event) => sum + convertCurrency(event.amount, event.currency || 'EGP', 'EGP'), 0);
  const categories = debits.reduce((map, event) => {
    const category = event.category || 'Other';
    map[category] = (map[category] || 0) + convertCurrency(event.amount, event.currency || 'EGP', 'EGP');
    return map;
  }, {});
  return { snapshot, approved, reviews, debits, credits, debitTotal, creditTotal, categories };
}

function categoryAmount(categories, aliases) {
  const wanted = aliases.map((alias) => alias.toLowerCase());
  return Object.entries(categories).reduce((sum, [name, amount]) => {
    const normalized = name.toLowerCase();
    return sum + (wanted.some((alias) => normalized.includes(alias)) ? amount : 0);
  }, 0);
}

function observedTrend(debits, selectedRange) {
  const range = overviewTrendRanges[selectedRange] || overviewTrendRanges[4];
  const datedDebits = debits
    .map((event) => ({ event, date: toISODate(event.date || event.receivedAt) }))
    .filter((item) => item.date);
  const latestDate = datedDebits.map((item) => item.date).sort().at(-1) || dateInputValue(new Date());
  const anchor = new Date(`${latestDate}T12:00:00Z`);
  const slots = Math.min(8, range.days);
  const daysPerSlot = Math.ceil(range.days / slots);
  const start = new Date(anchor.getTime() - ((range.days - 1) * 86400000));
  const buckets = Array.from({ length: slots }, (_, index) => ({
    start: new Date(start.getTime() + (index * daysPerSlot * 86400000)),
    total: 0
  }));
  datedDebits.forEach(({ event, date }) => {
    const eventDate = new Date(`${date}T12:00:00Z`);
    const offset = Math.floor((eventDate - start) / 86400000);
    const bucket = Math.floor(offset / daysPerSlot);
    if (bucket >= 0 && bucket < buckets.length) buckets[bucket].total += convertCurrency(event.amount, event.currency || 'EGP', 'EGP');
  });
  const highest = Math.max(...buckets.map((bucket) => bucket.total), 0);
  return {
    ...range,
    total: buckets.reduce((sum, bucket) => sum + bucket.total, 0),
    values: buckets.map((bucket) => highest ? 156 - ((bucket.total / highest) * 124) : 156),
    labels: buckets.map((bucket) => bucket.start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }))
  };
}

function categoryBreakdown(categories, total) {
  return Object.entries(categories)
    .map(([name, amount]) => ({ name, amount, share: total ? (amount / total) * 100 : 0 }))
    .sort((left, right) => right.amount - left.amount);
}

function setView(viewId) {
  if (!views.some((view) => view.id === viewId)) return;
  state.view = viewId;
  state.isEditing = false;
  const url = new URL(window.location.href);
  url.searchParams.set('variant', viewId);
  window.history.replaceState({}, '', url);
  render();
}

function currentView() {
  return views.find((view) => view.id === state.view) || views[0];
}

function showToast(message) {
  state.toast = message;
  render();
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    state.toast = '';
    render();
  }, 3600);
}

function renderSidebar() {
  const openReviews = harborLedger.snapshot().reviewCandidates.length;
  const nav = views.filter((view) => view.id !== 'settings').map((view) => {
    const isReview = view.id === 'review';
    return `<button class="nav-item" data-view="${view.id}" aria-current="${state.view === view.id ? 'page' : 'false'}">
      ${icon(view.icon, 17)}
      <span>${view.label}</span>
      ${isReview ? '<span class="nav-count">' + openReviews + '</span>' : ''}
    </button>`;
  }).join('');

  return `<aside class="sidebar">
      <div class="identity-rail" aria-label="Zoid Bank identity rail"><span class="identity-code">ZB</span><span class="identity-rule"></span><span class="identity-foot">LOCAL</span></div>
    <div class="sidebar-main">
      <div class="brand"><span class="brand-mark">ZB</span><span><span class="brand-name">Zoid Bank</span><small>Private signal ledger</small></span></div>
      <div class="nav-label">Command index</div>
      <nav class="nav-list" aria-label="Dashboard modes">
        ${nav}
      </nav>
      <div class="nav-label">Workspace</div>
      <button class="nav-item" data-view="settings" aria-current="${state.view === 'settings' ? 'page' : 'false'}">${icon('settings', 17)}<span>Settings</span></button>
      <div class="sidebar-spacer"></div>
      <div class="local-card">
        <div class="local-card-head"><span class="status-dot"></span><span>Local boundary</span></div>
        <p>Only approved bank alerts enter this Mac Mini ledger. Messages are read locally.</p>
      </div>
    </div>
  </aside>`;
}

function renderTopbar() {
  return `<header class="topbar">
    <div class="breadcrumbs"><span class="topbar-code">CMD ${currentView().key}</span><span>Zoid Bank</span><span class="breadcrumb-slash">/</span><strong>${currentView().label}</strong></div>
    <div class="topbar-actions">
      <span class="sync-note"><span class="status-dot"></span>Last local sync 8 min ago</span>
      <span class="local-badge"><span class="status-dot"></span>${icon('lock', 13)} Local only</span>
    </div>
  </header>`;
}

function renderPageHeading({ eyebrow, title, description, amber = false, action = '' }) {
  return `<div class="page-heading">
    <div class="page-heading-copy">
      <div class="route-mast"><span class="route-code">CMD ${currentView().key}</span><p class="eyebrow${amber ? ' amber' : ''}">${eyebrow}</p></div>
      <h1>${title}</h1>
      <p class="heading-description">${description}</p>
    </div>
    ${action ? `<div class="heading-actions">${action}</div>` : '<div class="mast-proof"><span class="status-dot"></span><strong>Local evidence</strong><small>Source-bound workspace</small></div>'}
  </div>`;
}

function addTransactionButton() {
  return `<button class="button button-secondary" data-action="open-add">${icon('plus', 14)}Add transaction</button>`;
}

function renderOverview() {
  const live = liveLedgerSummary();
  const reviewCount = live.reviews.length;
  const patterns = detectRecurringPatterns(live.debits);
  const trend = observedTrend(live.debits, state.trendTimeframe);
  const allocation = [
    { name: 'Home & utilities', amount: categoryAmount(live.categories, ['home', 'utility']), tone: '' },
    { name: 'Groceries', amount: categoryAmount(live.categories, ['grocery', 'market']), tone: 'tone-2' },
    { name: 'Transport', amount: categoryAmount(live.categories, ['transport']), tone: 'tone-3' },
    { name: 'Eating out', amount: categoryAmount(live.categories, ['eating', 'restaurant']), tone: 'tone-4' }
  ];
  return `<section class="page" aria-labelledby="overview-title">
    ${renderPageHeading({
      eyebrow: 'August 2026 · Tuesday, 4 August',
      title: 'Good morning, Ziad',
      description: 'A calm read on the money moving through your local workspace.',
      action: `${addTransactionButton()}<button class="button button-secondary" data-view="transactions">View transactions ${icon('arrowRight', 15)}</button><button class="button button-amber" data-view="review"><span class="status-dot" style="background:#ffe0b0;box-shadow:none"></span>Review ${reviewCount} item${reviewCount === 1 ? '' : 's'}</button>`
    })}
    <div class="overview-hero">
      <article class="card position-card">
        <span class="card-label">Approved spending</span>
        <div class="position-value">${formatCurrency(live.debitTotal)}</div>
        <div class="position-meta"><span class="source-chip source-chip-dark">${icon('message', 11)} Bank SMS only</span><span class="muted-inverse">Approved debit messages to date</span></div>
        <div class="position-footer">
          <div><span class="metric-number">${live.debits.length}</span><span class="muted-inverse">Approved debit SMS</span></div>
          <div><span class="metric-number">${patterns.length}</span><span class="muted-inverse">Recurring signals</span></div>
        </div>
      </article>
      <article class="card trend-card">
        <div class="card-header"><div><span class="card-label">Approved spending trend</span><h2>Observed debits over ${trend.label}</h2></div><div class="trend-controls"><label class="trend-range"><span>Range</span><select id="trend-timeframe" aria-label="Trend timeframe">${Object.entries(overviewTrendRanges).map(([value, range]) => `<option value="${value}" ${value === state.trendTimeframe ? 'selected' : ''}>${range.label}</option>`).join('')}</select></label><div class="trend-total">${formatCurrency(trend.total)}<small>Approved debit messages only</small></div></div></div>
        <div class="chart-wrap">${overviewTrendChart(trend)}</div>
      </article>
    </div>
    <div class="overview-secondary">
      <article class="card allocation-card">
        <div class="card-header"><div><span class="card-label">Where it went</span><h3>Monthly spending</h3></div><button class="button button-quiet" data-view="cash-flow">View detail ${icon('arrowRight', 13)}</button></div>
        <div class="allocation-list">
          ${allocation.map((item) => allocationRow(item.name, formatCurrency(item.amount), live.debitTotal ? Math.round((item.amount / live.debitTotal) * 100) : 0, item.tone)).join('')}
        </div>
      </article>
      <article class="card recurring-card">
        <div class="card-header"><div><span class="card-label">Pattern signal</span><h3>Recurring payments</h3></div><button class="button button-quiet" data-view="recurring">View recurring ${icon('arrowRight', 13)}</button></div>
        <div class="signal-box"><span class="signal-icon">${icon(patterns.length ? 'trendUp' : 'message', 18)}</span><div><strong>${patterns.length ? `${patterns.length} observed pattern${patterns.length === 1 ? '' : 's'}` : 'No repeated debits yet'}</strong><span>${patterns.length ? 'Calculated from approved debit evidence only.' : 'A repeated pattern will appear after another approved debit.'}</span></div></div>
        <div class="recurring-list">${patterns.length ? patterns.slice(0, 3).map((pattern) => `<div class="recurring-row"><span>${escapeHtml(pattern.merchant)}</span><strong>${formatCurrency(pattern.amount, pattern.currency)} · ${pattern.evidenceCount} observed</strong></div>`).join('') : '<div class="recurring-empty-inline">Approved debit events are the only input for automatic observations.</div>'}</div>
      </article>
    </div>
    ${renderRecentTransactions()}
    <div class="note-row"><span>${icon('shield', 14)} Local projection from approved debit messages.</span><span>Manual entries never become recurring evidence.</span></div>
  </section>`;
}

function allocationRow(name, value, width, tone) {
  return `<div class="allocation-item"><div class="allocation-row"><span class="allocation-name"><i class="${tone}"></i>${name}</span><span class="allocation-value">${value}</span></div><div class="allocation-track"><div class="allocation-fill ${tone}" style="width:${width}%"></div></div></div>`;
}

function renderRecentTransactions() {
  const items = transactionLedger()
    .filter((item) => item.status !== 'Needs review')
    .slice(0, 6);
  return `<article class="card transactions-card"><div class="card-header"><div><span class="card-label">Activity</span><h3>Recent transactions</h3></div><button class="button button-quiet" data-view="transactions">See all transactions ${icon('arrowRight', 13)}</button></div><div class="transaction-list">${items.length ? items.map((item) => `<div class="transaction-row"><div class="transaction-main"><span class="transaction-icon">${icon(item.icon, 15)}</span><div class="transaction-copy"><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.meta)}</span><span class="transaction-source ${item.sourceType === 'manual' ? 'manual-source' : 'bank-source'}">${item.sourceType === 'manual' ? `Manual · ${manualTypeLabel(item.type)}` : escapeHtml(item.source)}</span></div></div><div class="transaction-amount">${item.sourceType === 'manual' ? manualDisplayAmount(item.type, item.amount) : signedCurrency(item.amount, item.currency, item.direction)}<small>${item.sourceType === 'manual' ? 'Manual entry' : 'Approved debit'}</small></div></div>`).join('') : '<div class="transaction-empty"><strong>No local activity yet</strong><p>Scan approved Messages alerts or add a manual note to begin.</p></div>'}</div></article>`;
}

function manualIcon(type) {
  return { income: 'trendUp', expense: 'card', cash: 'wallet', transfer: 'arrowRight', adjustment: 'edit' }[type] || 'edit';
}

function manualTypeLabel(type) {
  return { income: 'Income', expense: 'Expense', cash: 'Cash', transfer: 'Transfer', adjustment: 'Adjustment' }[type] || 'Entry';
}

function manualDisplayAmount(type, amount) {
  const formatted = formatCurrency(amount);
  if (type === 'income') return `+${formatted}`;
  if (type === 'expense' || type === 'cash') return `-${formatted}`;
  if (type === 'transfer') return `↔ ${formatted}`;
  return `± ${formatted}`;
}

function transactionLedger() {
  const manual = state.manualTransactions.map((item) => ({
    id: `manual-${item.date}-${item.description}`,
    icon: manualIcon(item.type),
    name: item.description,
    meta: item.date,
    category: manualTypeLabel(item.type),
    type: item.type,
    amount: item.amount,
    currency: 'EGP',
    sourceType: 'manual',
    source: `Manual entry · ${manualTypeLabel(item.type)}`,
    status: 'Manual'
  }));
  const ledgerSnapshot = harborLedger.snapshot();
  const pendingReviews = ledgerSnapshot.reviewCandidates
    .map((candidate) => ({
      id: candidate.id,
      icon: 'alert',
      name: candidate.merchant,
      meta: candidate.date,
      dateValue: toISODate(candidate.date || candidate.receivedAt),
      category: candidate.category,
      amount: candidate.direction === 'credit' ? candidate.amount : -candidate.amount,
      currency: candidate.currency || 'EGP',
      direction: candidate.direction || 'debit',
      sourceType: 'bank',
      source: 'Messages · needs review',
      status: 'Needs review'
    }));
  const automaticallyApproved = ledgerSnapshot.events.map((event) => ({
    id: event.id,
    sourceId: event.sourceId,
    icon: recurringIconForCategory(event.category),
    name: event.merchant,
    meta: event.date,
    dateValue: toISODate(event.date || event.receivedAt),
    category: event.category,
    amount: event.direction === 'credit' ? event.amount : -event.amount,
    currency: event.currency || 'EGP',
    direction: event.direction || 'debit',
    sourceType: 'bank',
    source: event.source || (event.decision?.mode === 'manual' ? 'Messages · manually approved' : 'Messages · approved'),
    status: event.status === 'approved' ? 'Approved' : 'Auto-approved'
  }));
  return [...manual, ...pendingReviews, ...automaticallyApproved];
}

function ledgerAmount(item) {
  if (item.sourceType === 'manual') return manualDisplayAmount(item.type, item.amount);
  return signedCurrency(item.amount, item.currency || 'EGP', item.direction);
}

function transactionRowMatches(item) {
  const query = state.transactionQuery.trim().toLowerCase();
  const matchesQuery = !query || `${item.name} ${item.category} ${item.source} ${item.meta}`.toLowerCase().includes(query);
  const matchesFilter = state.transactionFilter === 'all'
    || (state.transactionFilter === 'bank' && item.sourceType === 'bank')
    || (state.transactionFilter === 'manual' && item.sourceType === 'manual')
    || (state.transactionFilter === 'review' && item.status === 'Needs review');
  return matchesQuery && matchesFilter;
}

function renderTransactions() {
  const ledger = transactionLedger();
  const visible = ledger.filter(transactionRowMatches);
  const bankCount = ledger.filter((item) => item.sourceType === 'bank').length;
  const manualCount = ledger.filter((item) => item.sourceType === 'manual').length;
  const reviewCount = ledger.filter((item) => item.status === 'Needs review').length;
  return `<section class="page" aria-labelledby="transactions-title">
    ${renderPageHeading({
      eyebrow: 'Ledger · August 2026',
      title: 'Transactions, in one place',
      description: 'A searchable record of structured events, with the source and decision state kept visible.',
      action: `${addTransactionButton()}<button class="button button-secondary" data-action="export-transactions">Export view ${icon('arrowRight', 15)}</button>`
    })}
    <div class="transactions-summary-grid" aria-label="Transaction summary">
      <article class="card transaction-summary-card"><span class="card-label">Total records</span><strong>${ledger.length}</strong><span>All local entries in this ledger</span></article>
      <article class="card transaction-summary-card transaction-summary-card-accent"><span class="card-label">Needs your review</span><strong>${reviewCount}</strong><span>Uncertain bank SMS parsing</span></article>
      <article class="card transaction-summary-card"><span class="card-label">Source split</span><strong>${bankCount} / ${manualCount}</strong><span>Approved Messages / manual notes</span></article>
    </div>
    <div class="transactions-toolbar card"><div class="transaction-filter-group" role="group" aria-label="Transaction filters">
      ${transactionFilterButton('all', 'All activity', ledger.length)}
      ${transactionFilterButton('bank', 'Bank SMS', bankCount)}
      ${transactionFilterButton('manual', 'Manual', manualCount)}
      ${transactionFilterButton('review', 'Needs review', reviewCount)}
    </div><div class="transaction-toolbar-controls">${currencySelect('transaction-currency')}<label class="transaction-search">${icon('search', 15)}<span class="sr-only">Search transactions</span><input id="transaction-search" type="search" placeholder="Search merchant, category, or source" value="${state.transactionQuery.replace(/"/g, '&quot;')}" /></label></div></div>
    <div class="transactions-page-grid"><article class="card transaction-table-card"><div class="card-header"><div><span class="card-label">Local ledger</span><h2>All activity</h2></div><span class="card-note">Showing ${visible.length} of ${ledger.length}</span></div><div class="transaction-table-scroll"><div class="ledger-table" role="table" aria-label="Transactions">
      <div class="ledger-table-head" role="row"><span role="columnheader">Merchant</span><span role="columnheader">Category</span><span role="columnheader">Source</span><span role="columnheader">Date</span><span role="columnheader">Amount</span></div>
      ${visible.length ? visible.map(transactionLedgerRow).join('') : `<div class="transaction-empty"><span>${icon('search', 20)}</span><strong>No matching entries</strong><p>Try a different search or filter.</p></div>`}
    </div></div></article></div>
    <div class="note-row"><span>${icon('shield', 14)} Local Messages data stays on this Mac Mini.</span><span>Manual entries never change approved bank SMS totals.</span></div>
  </section>`;
}

function transactionFilterButton(id, label, count) {
  return `<button class="segmented-button ${state.transactionFilter === id ? 'active' : ''}" type="button" data-transaction-filter="${id}">${label} <span>${count}</span></button>`;
}

function transactionLedgerRow(item) {
  const sourceClass = item.sourceType === 'manual' ? 'manual-source' : item.status === 'Needs review' ? 'review-source' : 'bank-source';
  const statusClass = item.status === 'Needs review' ? 'ledger-status-review' : item.sourceType === 'manual' ? 'ledger-status-manual' : 'ledger-status-approved';
  const isDebit = item.direction === 'debit' || (!item.direction && item.amount < 0);
  const canCreateRule = item.sourceType === 'bank' && isDebit && item.status !== 'Needs review';
  const hasRule = state.manualRecurringRules.some((rule) => rule.sourceEventId === item.id);
  const recurringAction = canCreateRule
    ? `<button class="ledger-row-action" type="button" data-action="open-recurring-rule" data-transaction-id="${escapeHtml(item.id)}">${hasRule ? 'Manage recurring' : 'Make recurring'}</button>`
    : '';
  return `<div class="ledger-table-row" role="row"><span class="ledger-merchant"><span class="transaction-icon">${icon(item.icon, 15)}</span><span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.category)}</small></span></span><span class="ledger-category">${escapeHtml(item.category)}</span><span class="ledger-source ${sourceClass}">${escapeHtml(item.source)}</span><span class="ledger-date">${escapeHtml(item.meta)}</span><span class="ledger-amount ${item.amount >= 0 ? 'ledger-amount-positive' : ''}">${ledgerAmount(item)}<small class="${statusClass}">${escapeHtml(item.status)}</small>${recurringAction}</span></div>`;
}

function overviewTrendChart(trend) {
  const chartWidth = 676;
  const startX = 12;
  const endX = startX + chartWidth;
  const step = chartWidth / (trend.values.length - 1);
  const points = trend.values.map((value, index) => `${startX + (step * index)} ${value}`);
  const linePath = `M${points.join(' L')}`;
  const labelStep = trend.labels.length > 1 ? chartWidth / (trend.labels.length - 1) : chartWidth;
  const labels = trend.labels.map((label, index) => `<text class="chart-label" x="${startX + (labelStep * index)}" y="174">${label}</text>`).join('');
  return `<svg viewBox="0 0 700 180" role="img" aria-label="Approved spending trend rising across ${trend.label}">
    <path class="chart-grid" d="M12 27H688M12 70H688M12 113H688M12 156H688" />
    <path class="chart-area" d="${linePath} L${endX} 156 H${startX} Z" />
    <path class="chart-line" d="${linePath}" />
    <circle class="chart-dot" cx="${endX}" cy="${trend.values[trend.values.length - 1]}" r="5" />
    ${labels}
  </svg>`;
}

function renderRecurring() {
  const live = liveLedgerSummary();
  const patterns = detectRecurringPatterns(live.debits, { asOf: new Date() });
  const manualRules = state.manualRecurringRules;
  const statusCounts = patterns.reduce((counts, pattern) => {
    counts[pattern.status] = (counts[pattern.status] || 0) + 1;
    return counts;
  }, {});
  const confirmedPatterns = patterns.filter((pattern) => pattern.status === 'confirmed');
  const confirmedTypicalAmount = confirmedPatterns.reduce((sum, pattern) => sum + pattern.amount, 0);
  const upcoming = patterns
    .filter((pattern) => pattern.nextObservedDate && pattern.status !== 'paused')
    .sort((a, b) => a.nextObservedDate.localeCompare(b.nextObservedDate));
  const cadenceNames = [...new Set(patterns.map((pattern) => pattern.cadence))];
  const cadenceDays = patterns.map((pattern) => pattern.cadenceDays).filter(Number.isFinite);
  const cadenceRange = cadenceDays.length
    ? `${Math.min(...cadenceDays)}–${Math.max(...cadenceDays)} days`
    : 'No measured interval';
  const cadenceSummary = cadenceNames.length === 1 ? `${cadenceNames[0]} rhythm` : cadenceNames.length ? 'Mixed observed rhythms' : 'No cadence measured';

  return `<section class="page recurring-page" aria-labelledby="recurring-title">
    ${renderPageHeading({
      eyebrow: 'Patterns · local projection',
      title: 'Recurring, without false certainty',
      description: 'See what repeats in approved debit evidence, what changed, and what you have chosen to track manually.',
      action: `<button class="button button-secondary" data-view="transactions">Open transactions ${icon('arrowRight', 15)}</button><button class="button button-amber" data-view="review">${icon('alert', 14)}Review ${live.reviews.length} item${live.reviews.length === 1 ? '' : 's'}</button>`
    })}
    <div class="recurring-summary-grid">
      <article class="card recurring-commitment-card">
        <div class="recurring-summary-head"><span class="card-label">Confirmed observed amount</span><span class="recurring-summary-source">${confirmedPatterns.length} pattern${confirmedPatterns.length === 1 ? '' : 's'}</span></div>
        <strong class="recurring-total">${formatCurrency(confirmedTypicalAmount)}</strong>
        <p>Typical amounts for confirmed repeated groups. This is not a scheduled payment total.</p>
        <div class="recurring-commitment-footer"><span>${icon('message', 13)}${live.debits.length} approved debit${live.debits.length === 1 ? '' : 's'}</span><span>${icon('lock', 13)}Local only</span></div>
      </article>
      <article class="card recurring-signal-card">
        <div class="card-header"><div><span class="card-label">Pattern read</span><h2>${patterns.length} observed pattern${patterns.length === 1 ? '' : 's'}</h2></div>${icon('bolt', 18)}</div>
        <p class="recurring-signal-description">Automatic groups need at least two dated approved debit events. Amount tolerance and date spacing are calculated locally for each merchant.</p>
        <div class="recurring-signal-metrics"><div><strong>${statusCounts.confirmed || 0}</strong><span>Confirmed</span></div><div><strong>${statusCounts.signal || 0}</strong><span>Signal</span></div><div><strong>${statusCounts.changed || 0}</strong><span>Changed</span></div><div><strong>${statusCounts.paused || 0}</strong><span>Paused</span></div></div>
        <div class="recurring-signal-callout">${icon('alert', 14)}<span>Observed patterns never schedule or pay anything automatically.</span></div>
      </article>
    </div>
    <div class="recurring-board-grid">
      <article class="card recurring-patterns-card">
        <div class="card-header"><div><span class="card-label">Automatic observations</span><h2>What repeats</h2></div><span class="card-note">Approved debit events only</span></div>
        <div class="recurring-legend"><span><i class="recurring-legend-dot confirmed"></i>Confirmed</span><span><i class="recurring-legend-dot signal"></i>Signal</span><span><i class="recurring-legend-dot changed"></i>Changed</span><span><i class="recurring-legend-dot paused"></i>Paused</span></div>
        <div class="recurring-pattern-table" role="table" aria-label="Recurring patterns">
          <div class="recurring-pattern-head" role="row"><span>Pattern</span><span>Cadence</span><span>Next observation</span><span>Amount</span></div>
          ${patterns.length ? patterns.map(recurringPatternRow).join('') : `<div class="recurring-empty-state"><span class="recurring-empty-icon">${icon('message', 20)}</span><strong>No repeated approved debits yet</strong><p>Automatic observations will appear after the same merchant has at least two dated debit events in the local Messages ledger.</p><button class="button button-secondary" data-view="transactions">Open transactions ${icon('arrowRight', 14)}</button></div>`}
        </div>
      </article>
      <article class="card upcoming-card">
        <div class="card-header"><div><span class="card-label">Observed windows</span><h2>Next pattern checks</h2></div><span class="card-note">No payment action</span></div>
        <p class="upcoming-description">These dates are calculated observation windows, not due dates or scheduled payments.</p>
        <div class="upcoming-list">
          ${upcoming.length ? upcoming.map((pattern) => upcomingCommitment(pattern.nextObservedDate, pattern.merchant, `${pattern.cadence} · ${pattern.statusLabel.toLowerCase()}`, pattern.amount, pattern.currency, pattern.status)).join('') : '<div class="recurring-empty-state compact"><strong>No next observation window</strong><p>A stable dated cadence will create one here.</p></div>'}
        </div>
        <div class="upcoming-total"><div><span>Confirmed typical amount</span><strong>${formatCurrency(confirmedTypicalAmount)}</strong></div><div><span>Manual rules kept separate</span><strong>${manualRules.length}</strong></div></div>
      </article>
    </div>
    ${renderManualRecurringRules(manualRules)}
    <div class="recurring-bottom-grid">
      <article class="card cadence-card">
        <div class="card-header"><div><span class="card-label">Cadence</span><h3>How the rhythm was grouped</h3></div>${icon('calendar', 17)}</div>
        <div class="cadence-summary"><strong>${cadenceSummary}</strong><span>${patterns.length ? `Measured from ${patterns.length} automatic pattern${patterns.length === 1 ? '' : 's'}.` : 'No automatic cadence is measurable yet.'}</span></div>
        <div class="cadence-rows"><div class="cadence-row"><span>Observed patterns</span><strong>${patterns.length}</strong><small>${statusCounts.confirmed || 0} confirmed · ${statusCounts.signal || 0} signal · ${statusCounts.changed || 0} changed · ${statusCounts.paused || 0} paused</small></div><div class="cadence-row"><span>Interval range</span><strong>${cadenceRange}</strong><small>Calculated from approved debit dates</small></div></div>
        <p class="cadence-note">Cadence is an observation, not a calendar entry or a bank promise.</p>
      </article>
      <article class="card recurring-boundary-card">
        <div class="card-header"><div><span class="card-label">Source boundary</span><h3>Local-only evidence</h3></div>${icon('lock', 17)}</div>
        <div class="boundary-callout"><span class="boundary-icon">${icon('message', 16)}</span><div><strong>${live.debits.length} approved debit message${live.debits.length === 1 ? '' : 's'}</strong><span>Only source for automatic patterns</span></div></div>
        <div class="boundary-points"><div><span class="boundary-point-icon included">${icon('check', 12)}</span><p>Approved debit events from local Messages can support an observation.</p></div><div><span class="boundary-point-icon separate">${icon('edit', 12)}</span><p>Manual entries and manual rules never change bank evidence.</p></div><div><span class="boundary-point-icon unavailable">${icon('alert', 12)}</span><p>No cloud sync, raw-message rendering, or payment execution exists here.</p></div></div>
      </article>
    </div>
    <div class="note-row"><span>${icon('shield', 14)}Source: local approved Messages ledger.</span><span>Manual rules are reminders only and never execute payments.</span></div>
  </section>`;
}

function recurringStatusBadge(status) {
  const labels = { confirmed: 'Confirmed', signal: 'Signal', changed: 'Changed', paused: 'Paused', manual: 'Manual rule' };
  const icons = { confirmed: 'check', signal: 'bolt', changed: 'edit', paused: 'alert', manual: 'edit' };
  return `<span class="recurring-status ${status}">${icon(icons[status] || 'bolt', 11)}${labels[status] || 'Signal'}</span>`;
}

function recurringPatternRow(item) {
  const next = item.nextObservedDate ? formatProjectionDate(item.nextObservedDate) : 'No recent window';
  return `<div class="recurring-pattern-row ${item.status}" role="row"><div class="recurring-pattern-name"><span class="recurring-pattern-icon">${icon(recurringIconForCategory(item.category), 15)}</span><span><strong>${escapeHtml(item.merchant)}</strong><small>${escapeHtml(item.category)} · ${item.evidenceCount} approved debit${item.evidenceCount === 1 ? '' : 's'}</small><span class="recurring-pattern-note">${recurringStatusBadge(item.status)}${escapeHtml(item.note)}</span></span></div><div class="recurring-cadence"><strong>${escapeHtml(item.cadence)}</strong><small>${escapeHtml(item.rhythm)}</small></div><div class="recurring-next"><strong>${escapeHtml(next)}</strong><small>${item.status === 'paused' ? 'No recent window' : 'Next observation'}</small></div><div class="recurring-amount"><strong>-${formatCurrency(item.amount, item.currency)}</strong><small>${item.status === 'changed' ? `Latest ${formatCurrency(item.latestAmount, item.currency)}` : 'Typical amount'}</small></div></div>`;
}

function upcomingCommitment(date, name, meta, amount, currency, status) {
  const formattedDate = formatProjectionDate(date);
  const [day, month] = formattedDate.split(' ');
  return `<div class="upcoming-item ${status}"><div class="upcoming-date"><strong>${escapeHtml(day)}</strong><span>${escapeHtml(month || '')}</span></div><div class="upcoming-copy"><div>${recurringStatusBadge(status)}</div><strong>${escapeHtml(name)}</strong><span>${escapeHtml(meta)}</span></div><strong class="upcoming-amount">-${formatCurrency(amount, currency)}</strong></div>`;
}

function manualRecurringRuleRow(rule) {
  const isPaused = Boolean(rule.paused);
  const status = isPaused ? 'paused' : 'manual';
  return `<div class="recurring-manual-row"><div class="recurring-pattern-name"><span class="recurring-pattern-icon">${icon('edit', 15)}</span><span><strong>${escapeHtml(rule.merchant)}</strong><small>${escapeHtml(rule.category)} · ${escapeHtml(rule.sourceLabel)}</small><span class="recurring-pattern-note">${recurringStatusBadge(status)}${escapeHtml(isPaused ? 'Paused by you. It remains separate from bank evidence.' : rule.note)}</span></span></div><div class="recurring-cadence"><strong>${escapeHtml(rule.cadence)}</strong><small>User selected</small></div><div class="recurring-next"><strong>${escapeHtml(formatProjectionDate(rule.nextExpectedDate))}</strong><small>${isPaused ? 'Tracking paused' : 'Next expected date'}</small></div><div class="recurring-amount"><strong>-${formatCurrency(rule.amount, rule.currency)}</strong><small>Manual amount</small></div><div class="recurring-manual-actions"><button class="ledger-row-action" type="button" data-action="edit-recurring-rule" data-rule-id="${escapeHtml(rule.id)}">Edit</button><button class="ledger-row-action" type="button" data-action="toggle-recurring-rule" data-rule-id="${escapeHtml(rule.id)}">${isPaused ? 'Resume' : 'Pause'}</button><button class="ledger-row-action ledger-row-action-danger" type="button" data-action="delete-recurring-rule" data-rule-id="${escapeHtml(rule.id)}">Remove</button></div></div>`;
}

function renderManualRecurringRules(rules) {
  const emptyState = `<div class="recurring-empty-state compact"><strong>No manual recurring rules</strong><p>Open an approved debit in Transactions and choose Make recurring to define one.</p><button class="button button-secondary" data-view="transactions">Open transactions ${icon('arrowRight', 14)}</button></div>`;
  return `<article class="card recurring-manual-card"><div class="card-header"><div><span class="card-label">Manual rules</span><h2>What you chose to track</h2></div><span class="card-note">Separate from bank evidence</span></div><p class="upcoming-description">Manual rules are local notes created from an approved transaction. They do not add evidence, change totals, or make a payment.</p><div class="recurring-manual-list">${rules.length ? rules.map(manualRecurringRuleRow).join('') : emptyState}</div></article>`;
}

function renderCashFlow() {
  const live = liveLedgerSummary();
  const recurringPatterns = detectRecurringPatterns(live.debits, { asOf: new Date() });
  const categories = categoryBreakdown(live.categories, live.debitTotal);
  return `<section class="page" aria-labelledby="cash-flow-title">
    ${renderPageHeading({
      eyebrow: 'Movement · August 2026',
      title: 'Spending flow, in plain view',
      description: 'See the debit activity that your approved bank SMS messages actually support.',
      action: `${addTransactionButton()}<div class="cashflow-toolbar" role="group" aria-label="Spending period"><button class="segmented-button active">August</button><button class="segmented-button">July</button><button class="segmented-button">3 months</button></div>`
    })}
    <div class="metrics-grid">
      ${metricCard('Approved debits', formatCurrency(live.debitTotal), `${live.debits.length} bank SMS approvals`, 'neutral')}
      ${metricCard('Incoming money', live.credits.length ? formatCurrency(live.creditTotal) : 'Unavailable', live.credits.length ? `${live.credits.length} approved credit messages` : 'No approved credit messages', 'neutral')}
      ${metricCard('Manual entries', String(state.manualTransactions.length), 'Separate from SMS totals', 'neutral')}
      ${metricCard('Recurring signals', String(recurringPatterns.length), 'Observed from approved debits', 'neutral')}
    </div>
    <div class="cashflow-grid">
      <article class="card cashflow-chart-card"><div class="card-header"><div><span class="card-label">Approved debit activity</span><h2>Observed spending by day</h2></div><span class="card-note">Debit messages only</span></div><div class="cashflow-chart">${cashFlowBarChart(live.debits)}</div><div class="legend"><span><i></i>Approved debits</span></div></article>
      <article class="card changes-card"><div class="card-header"><div><span class="card-label">Source limits</span><h3>What this view can say</h3></div>${icon('shield', 17)}</div><div class="changes-list">
        <div class="change-item"><span class="change-marker">${icon('alert', 14)}</span><div><strong>Incoming money unavailable</strong><p>No approved bank SMS explicitly indicates a credit, so Zoid Bank does not estimate income or a balance.</p></div></div>
        <div class="change-item"><span class="change-marker">${icon('message', 14)}</span><div><strong>Spending totals are source-bound</strong><p>Only messages that clearly describe a debit are included in approved spending.</p></div></div>
        <div class="change-item"><span class="change-marker">${icon('edit', 14)}</span><div><strong>Manual entries stay separate</strong><p>Use Add transaction for income, expense, cash, transfer, or adjustment notes.</p></div></div>
      </div></article>
    </div>
    <div class="cashflow-lower">
      <article class="card forecast-card"><div class="card-header"><div><span class="card-label">Observed pattern</span><h3>Recurring debit signals</h3></div><span class="card-note">Not a forecast</span></div><div class="forecast-list">
        ${recurringPatterns.length ? recurringPatterns.map((pattern) => forecastRow('SEEN', pattern.merchant, `${pattern.evidenceCount} approved debit${pattern.evidenceCount === 1 ? '' : 's'} · ${pattern.statusLabel.toLowerCase()}`, pattern.amount, pattern.currency)).join('') : '<div class="transaction-empty"><strong>No repeated debit pattern</strong><p>Another approved debit from the same merchant is needed.</p></div>'}
      </div></article>
      <article class="card category-table-card"><div class="card-header"><div><span class="card-label">Approved debit mix</span><h3>By category</h3></div><span class="card-note">Month to date</span></div><div class="category-table">
        ${categories.length ? categories.map((category) => tableRow(category.name, formatCurrency(category.amount), `${category.share.toFixed(1)}%`)).join('') : '<div class="transaction-empty"><strong>No approved debit categories</strong><p>Categories appear after a debit is approved locally.</p></div>'}
      </div></article>
    </div>
    <div class="note-row"><span>${icon('shield', 14)} Source: approved debit messages.</span><span>Incoming money is unavailable until an approved credit message exists.</span></div>
  </section>`;
}

function metricCard(label, value, trend, trendTone) {
  return `<article class="card metric-card"><span class="card-label">${label}</span><span class="metric-number">${value}</span><span class="metric-trend ${trendTone === 'neutral' ? 'neutral' : ''}">${trend}</span></article>`;
}

function renderAnalytics() {
  const live = liveLedgerSummary();
  const largest = Object.entries(live.categories).sort((a, b) => b[1] - a[1])[0] || ['No category', 0];
  const largestShare = live.debitTotal ? ((largest[1] / live.debitTotal) * 100).toFixed(1) : '0.0';
  const trend = observedTrend(live.debits, 4);
  const categories = categoryBreakdown(live.categories, live.debitTotal);
  const dailySeries = recentDebitSeries(live.debits);
  const dailyPeak = dailySeries.slice().sort((left, right) => right.total - left.total)[0];
  return `<section class="page analytics-page" aria-labelledby="analytics-title">
    ${renderPageHeading({
      eyebrow: 'Analytics · August 2026',
      title: 'See the shape of your spending',
      description: 'A calm read on cash flow, category mix, and daily rhythm - built from the approved debit sample.',
      action: `<span class="analytics-range">August 2026 sample</span><button class="button button-secondary" data-view="cash-flow">Open cash flow ${icon('arrowRight', 14)}</button>`
    })}
    <div class="analytics-scope-banner" role="note">
      <div class="analytics-scope-copy"><span class="analytics-scope-icon">${icon('shield', 16)}</span><div><strong>Live local boundary</strong><span>${live.debits.length} approved debit messages · ${formatCurrency(live.debitTotal)} observed</span></div></div>
      <span class="analytics-scope-badge"><span class="status-dot"></span>No live account connection</span>
    </div>
    <div class="analytics-metrics">
      ${analyticsMetric('Approved debit spend', formatCurrency(live.debitTotal), `${live.debits.length} approved messages`, 'moss')}
      ${analyticsMetric('Largest category', `${largestShare}%`, largest[0], 'sage')}
      ${analyticsMetric('Approved credits', live.credits.length ? formatCurrency(live.creditTotal) : 'Unavailable', live.credits.length ? `${live.credits.length} messages` : 'No credit messages', 'ochre')}
      ${analyticsMetric('Open review items', String(live.reviews.length), 'Held outside totals', 'neutral')}
    </div>
    <div class="analytics-top-grid">
      <article class="card analytics-trend-card">
        <div class="card-header"><div><span class="card-label">Cash flow trend</span><h2>Observed local debit activity</h2></div><span class="card-note">Approved debits only</span></div>
        <div class="analytics-chart-wrap">${analyticsTrendChart(trend)}</div>
        <div class="analytics-chart-footer"><span class="analytics-legend"><i class="analytics-legend-current"></i>${trend.label} local ledger window</span><span class="analytics-delta">${formatCurrency(trend.total)} observed</span></div>
      </article>
      <article class="card analytics-comparison-card">
        <div class="card-header"><div><span class="card-label">Source coverage</span><h3>What this ledger currently supports</h3></div>${icon('message', 17)}</div>
        <p class="comparison-kicker">Only approved local debit messages contribute to these figures.</p>
        <div class="comparison-list">
          ${comparisonRow('Current local ledger', formatCurrency(live.debitTotal), 100, 'current')}
          ${comparisonRow('Categorised debit evidence', `${categories.length} categories`, live.debits.length ? 100 : 0, 'prior')}
        </div>
        <div class="comparison-callout"><span class="comparison-callout-icon">${icon('lock', 15)}</span><div><strong>${live.debits.length} approved debit${live.debits.length === 1 ? '' : 's'}</strong><span>Manual entries and unapproved messages stay outside this view.</span></div></div>
        <p class="analytics-footnote">This is a source-bound ledger view, not a bank statement, balance, or forecast.</p>
      </article>
    </div>
    <div class="analytics-lower-grid">
      <article class="card analytics-category-card">
        <div class="card-header"><div><span class="card-label">Category allocation</span><h3>Where the approved debits went</h3></div><span class="card-note">100% of sample</span></div>
        <div class="analytics-allocation-list">
          ${categories.length ? categories.map((category, index) => analyticsAllocationRow(category.name, formatCurrency(category.amount), `${category.share.toFixed(1)}%`, Math.round(category.share), ['', 'tone-2', 'tone-3', 'tone-4', 'tone-5'][index] || 'tone-5')).join('') : '<div class="transaction-empty"><strong>No approved debit allocation</strong><p>Category allocation appears after an approved local debit.</p></div>'}
        </div>
      </article>
      <article class="card analytics-rhythm-card">
        <div class="card-header"><div><span class="card-label">Daily rhythm</span><h3>Recent observed debit days</h3></div><span class="card-note">EGP by observed day</span></div>
        <div class="rhythm-chart" role="img" aria-label="Approved debit activity by observed day">
          ${dailySeries.length ? dailySeries.map((item) => rhythmBar(new Date(`${item.date}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }), formatCurrency(item.total), dailyPeak ? Math.max(3, Math.round((item.total / dailyPeak.total) * 100)) : 0, dailyPeak?.date === item.date ? 'peak' : '')).join('') : '<div class="transaction-empty"><strong>No observed daily rhythm</strong><p>A dated approved debit is needed.</p></div>'}
        </div>
        <div class="rhythm-note"><span class="status-dot"></span><span>${dailyPeak ? `${formatProjectionDate(dailyPeak.date)} is the highest observed debit day.` : 'No observed debit day yet.'}</span></div>
      </article>
    </div>
    <article class="card analytics-boundary-card">
      <div class="card-header"><div><span class="card-label">Read this view carefully</span><h3>What Analytics can and cannot say</h3></div>${icon('lock', 17)}</div>
      <div class="analytics-boundary-grid">
        <div><span class="boundary-label included">Included in this prototype</span><div class="boundary-list"><div class="boundary-item"><span>${icon('check', 13)}</span><p>Dates, amounts, categories, and trends from approved debit messages.</p></div><div class="boundary-item"><span>${icon('check', 13)}</span><p>Manual entries remain outside these totals and charts.</p></div></div></div>
        <div><span class="boundary-label excluded">Not available from this source</span><div class="boundary-list"><div class="boundary-item"><span>${icon('alert', 13)}</span><p>No bank balance, income total, or live account connection.</p></div><div class="boundary-item"><span>${icon('alert', 13)}</span><p>No unapproved messages, cash activity, or future estimate.</p></div></div></div>
      </div>
    </article>
    <div class="note-row"><span>${icon('shield', 14)} Source: approved debit messages.</span><span>Manual entries remain outside Analytics.</span></div>
  </section>`;
}

function analyticsMetric(label, value, detail, tone) {
  return `<article class="card analytics-metric ${tone}"><span class="card-label">${label}</span><span class="analytics-metric-value">${value}</span><span class="analytics-metric-detail">${detail}</span></article>`;
}

function analyticsTrendChart(trend) {
  const startX = 12;
  const endX = 688;
  const step = trend.values.length > 1 ? (endX - startX) / (trend.values.length - 1) : 0;
  const points = trend.values.map((value, index) => `${startX + (step * index)} ${value}`);
  const linePath = `M${points.join(' L')}`;
  const labels = trend.labels.map((label, index) => `<text class="chart-label" x="${startX + (step * index)}" y="195">${escapeHtml(label)}</text>`).join('');
  const peak = Math.min(...trend.values);
  const peakIndex = trend.values.indexOf(peak);
  return `<svg viewBox="0 0 700 220" role="img" aria-label="Approved debit trend from the local ledger">
    <path class="chart-grid" d="M12 24H688M12 74H688M12 124H688M12 174H688" />
    <path class="analytics-current-area" d="${linePath} L${endX} 174 H${startX}Z" />
    <path class="analytics-current-line" d="${linePath}" />
    <circle class="analytics-current-dot" cx="${startX + (step * peakIndex)}" cy="${peak}" r="5" /><circle class="analytics-current-dot" cx="${endX}" cy="${trend.values.at(-1)}" r="5" />
    ${labels}
  </svg>`;
}

function comparisonRow(label, amount, width, tone) {
  return `<div class="comparison-row"><div class="comparison-row-head"><span>${label}</span><strong>${amount}</strong></div><div class="comparison-track"><div class="comparison-fill ${tone}" style="width:${width}%"></div></div></div>`;
}

function analyticsAllocationRow(name, amount, share, width, tone) {
  return `<div class="analytics-allocation-item"><div class="analytics-allocation-head"><span class="analytics-allocation-name"><i class="${tone}"></i>${name}</span><span class="analytics-allocation-value">${amount} <small>${share}</small></span></div><div class="allocation-track"><div class="allocation-fill ${tone}" style="width:${width}%"></div></div></div>`;
}

function rhythmBar(label, value, height, tone) {
  return `<div class="rhythm-column"><div class="rhythm-bar-wrap"><span class="rhythm-value">${value}</span><div class="rhythm-bar ${tone}" style="height:${height}%"></div></div><span class="rhythm-label">${label}</span></div>`;
}

function recentDebitSeries(debits, limit = 4) {
  const totalsByDate = new Map();
  debits.forEach((event) => {
    const date = toISODate(event.date || event.receivedAt);
    if (!date) return;
    totalsByDate.set(date, (totalsByDate.get(date) || 0) + convertCurrency(event.amount, event.currency || 'EGP', 'EGP'));
  });
  return [...totalsByDate.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(-limit)
    .map(([date, total]) => ({ date, total }));
}

function cashFlowBarChart(debits) {
  const series = recentDebitSeries(debits);
  if (!series.length) return '<div class="transaction-empty"><strong>No approved debit activity</strong><p>The chart will appear after an approved local debit.</p></div>';
  const highest = Math.max(...series.map((item) => item.total), 1);
  const spacing = 590 / series.length;
  const bars = series.map(({ date, total }, index) => {
    const height = Math.max(3, (total / highest) * 130);
    const x = 72 + (spacing * index) + ((spacing - 52) / 2);
    const y = 170 - height;
    const label = new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
    return `<rect x="${x}" y="${y}" width="52" height="${height}" rx="4" fill="#2e5b48"/><text class="chart-label" x="${x - 10}" y="196">${label}</text>`;
  }).join('');
  return `<svg viewBox="0 0 720 205" role="img" aria-label="Approved debit spending by observed day"><path class="chart-grid" d="M38 20H708M38 70H708M38 120H708M38 170H708"/><path class="chart-grid" d="M38 170V20"/>
    <text class="chart-label" x="4" y="24">${formatCurrency(highest)}</text><text class="chart-label" x="25" y="174">0</text>${bars}
  </svg>`;
}

function forecastRow(date, name, meta, amount, currency = 'EGP') {
  return `<div class="forecast-row"><span class="forecast-date">${date}</span><div class="forecast-copy"><strong>${escapeHtml(name)}</strong><span>${escapeHtml(meta)}</span></div><span class="forecast-amount">-${formatCurrency(amount, currency)}</span></div>`;
}

function tableRow(name, amount, share) {
  return `<div class="table-row"><span>${name} <small style="color:var(--graphite-faint);font-size:10px">${share}</small></span><span>${amount}</span></div>`;
}

function renderReview() {
  const reviewCandidates = harborLedger.snapshot().reviewCandidates;
  const selectedCandidate = reviewCandidates.find((candidate) => candidate.id === state.reviewCandidateId) || reviewCandidates[0];
  const detail = renderReviewDetail(selectedCandidate);
  return `<section class="page" aria-labelledby="review-title">
    ${renderPageHeading({
      eyebrow: reviewQueueEyebrow(),
      title: 'Review Queue',
      description: 'A quick human check keeps local parsing honest and keeps your data in your hands.',
      amber: true,
      action: `${addTransactionButton()}<button class="button button-secondary" data-view="overview">Back to overview ${icon('arrowRight', 15)}</button>`
    })}
    <div class="review-intro">${icon('alert', 17)}<span><strong>Open transactions need a quick check.</strong> Zoid Bank will not include uncertain text in your totals until you approve it.</span></div>
    <div class="review-layout">
      <article class="card queue-card"><div class="card-header"><div><span class="card-label">Inbox</span><h3>Review items</h3></div><span class="uncertain-badge"><span class="status-dot"></span>${reviewQueueBadge()}</span></div><div class="queue-list">
        ${reviewCandidates.length ? reviewCandidates.map((candidate) => queueItem(candidate.merchant, `${candidate.date} · Needs review`, reviewCandidateAmount(candidate), candidate.id === selectedCandidate?.id, false, candidate.id)).join('') : '<p class="queue-footer">No review items are open.</p>'}
      </div><div class="queue-footer">Only explicitly approved messages enter the local ledger. Uncertain alerts from the local Messages source stay here.</div></article>
      <article class="card review-detail">${detail}</article>
    </div>
  </section>`;
}

function reviewQueueEyebrow() {
  const count = harborLedger.snapshot().reviewCandidates.length;
  return 'Needs your call · ' + count + ' item' + (count === 1 ? '' : 's');
}

function reviewQueueBadge() {
  return harborLedger.snapshot().reviewCandidates.length + ' open';
}

function queueItem(name, meta, amount, active, resolved, candidateId = '') {
  const candidateAttribute = candidateId ? ` data-candidate-id="${escapeHtml(candidateId)}"` : '';
  return `<button class="queue-item ${active ? 'active' : ''} ${resolved ? 'resolved' : ''}" data-action="queue-select"${candidateAttribute}><span class="queue-dot"></span><span><strong>${escapeHtml(name)}</strong><span>${escapeHtml(meta)}</span></span><small>${escapeHtml(amount)}</small></button>`;
}

function renderReviewDetail(candidate) {
  if (!candidate) {
    return `<div class="resolved-state"><span class="resolved-state-icon">${icon('check', 23)}</span><h2>Queue is clear</h2><p>The review state is now approved locally. Nothing was sent anywhere.</p><button class="button button-secondary" data-view="overview">Back to overview ${icon('arrowRight', 14)}</button></div>`;
  }
  const merchant = escapeHtml(candidate.merchant || 'Unresolved merchant');
  const date = escapeHtml(candidate.date || 'Unresolved date');
  const amount = escapeHtml(formatCurrency(Math.abs(Number(candidate.amount) || 0), candidate.currency || 'EGP'));
  const category = escapeHtml(candidate.category || 'Unresolved category');
  const sender = escapeHtml(candidate.sender || 'local Messages source');
  const preview = escapeHtml(candidate.preview || 'No redacted preview available.');
  const reasons = escapeHtml((candidate.reasons || ['Needs a human check']).join(' · '));
  return `<div class="detail-topline"><div class="detail-merchant"><span class="merchant-avatar">${escapeHtml((candidate.merchant || 'NA').slice(0, 2).toUpperCase())}</span><div><strong>${merchant}</strong><span>Parsed from ${sender} · ${date}</span></div></div><span class="uncertain-badge"><span class="status-dot"></span>Uncertain parse</span></div>
    <p class="detail-question">Zoid Bank is not fully confident about this transaction. Check the details before it enters your totals.</p>
    <div class="parsed-fields">
      <div class="parsed-field"><label for="merchant">Merchant</label><input id="merchant" value="${merchant}" ${state.isEditing ? '' : 'disabled'} /></div>
      <div class="parsed-field"><label for="amount">Amount</label><input id="amount" value="${amount}" ${state.isEditing ? '' : 'disabled'} /></div>
      <div class="parsed-field"><label for="date">Date</label><input id="date" value="${date}" ${state.isEditing ? '' : 'disabled'} /></div>
      <div class="parsed-field"><label for="category">Category</label><input id="category" value="${category}" ${state.isEditing ? '' : 'disabled'} /></div>
    </div>
    <div class="source-snippet"><span>Local Messages preview · sensitive digits redacted</span><p>"${preview}"</p></div>
    <div class="detail-actions"><p>Reason held: ${reasons}. Approval saves this event locally and does not send a reply or modify Messages.</p><div class="detail-buttons"><button class="button button-secondary" data-action="edit">${icon('edit', 14)}${state.isEditing ? 'Cancel edit' : 'Edit fields'}</button><button class="button button-amber" data-action="approve" data-candidate-id="${escapeHtml(candidate.id)}">${icon('check', 14)}${state.isEditing ? 'Save edit & approve' : 'Approve & save'}</button></div></div>`;
}

function renderSettings() {
  return `<section class="page settings-page" aria-labelledby="settings-title">
    ${renderPageHeading({
      eyebrow: 'Workspace · Local boundary',
      title: 'Settings, with the boundary written down',
      description: 'Control how this private ledger is described, reviewed, and kept separate from imported bank SMS evidence.',
      action: `<button class="button button-secondary" data-view="overview">Back to overview ${icon('arrowRight', 15)}</button>`
    })}
    <div class="settings-layout">
      <article class="card settings-section">
        <div class="settings-section-head"><span class="settings-number">01</span><div><span class="card-label">Workspace identity</span><h2>Personal ledger</h2></div></div>
        <p class="settings-section-copy">This prototype keeps manual entries and approved bank SMS records visibly distinct so the source of every number stays legible.</p>
        <div class="settings-field"><label for="workspace-name">Workspace name</label><input id="workspace-name" value="Personal ledger" /></div>
        <div class="settings-field"><label for="currency">Display currency</label><select id="currency" data-display-currency aria-label="Display currency">${currencyOptions()}</select><small class="currency-setting-note">${state.displayCurrency === 'EGP' ? 'Base currency' : `Prototype rate · EGP ${currencyDefinition(state.displayCurrency).egpPerUnit.toFixed(0)} = 1 ${state.displayCurrency}`}</small></div>
      </article>
      <article class="card settings-section">
        <div class="settings-section-head"><span class="settings-number">02</span><div><span class="card-label">Evidence source</span><h2>Approved messages only</h2></div></div>
        <div class="settings-proof"><span class="settings-proof-icon">${icon('shield', 18)}</span><div><strong>Local processing boundary</strong><span>Only approved debit messages are eligible for spending totals and recurring observations.</span></div><span class="written-state healthy">Active</span></div>
        <div class="settings-list"><div><span>Messages reader</span><strong>Local and read-only</strong></div><div><span>Cloud sync</span><strong>Not configured</strong></div><div><span>Raw alert retention</span><strong>Redacted preview only</strong></div></div>
      </article>
      <article class="card settings-section">
        <div class="settings-section-head"><span class="settings-number">03</span><div><span class="card-label">Review controls</span><h2>Keep uncertainty visible</h2></div></div>
        <label class="settings-toggle"><input type="checkbox" checked /><span class="toggle-box"></span><span><strong>Hold uncertain parses for review</strong><small>Do not include unresolved bank SMS text in totals.</small></span></label>
        <label class="settings-toggle"><input type="checkbox" checked /><span class="toggle-box"></span><span><strong>Label manual entries separately</strong><small>Manual notes never change approved bank SMS totals.</small></span></label>
        <div class="settings-actions"><button class="button button-primary" data-action="settings-save">Save local preferences ${icon('check', 14)}</button><span>Saved only in this prototype session.</span></div>
      </article>
    </div>
    <div class="note-row"><span>${icon('shield', 14)} Local source is available when the bridge is running.</span><span>Settings do not send or modify Messages.</span></div>
  </section>`;
}

function renderPrototypeSwitcher() {
  const view = currentView();
  const index = views.findIndex((item) => item.id === view.id);
  const previous = views[(index - 1 + views.length) % views.length];
  const next = views[(index + 1) % views.length];
  return `<div class="prototype-switcher" aria-label="Prototype state switcher"><button data-view="${previous.id}" aria-label="Previous state">${icon('arrowLeft', 15)}</button><div class="prototype-label">${view.key} · ${view.label}<span> · prototype state</span></div><button data-view="${next.id}" aria-label="Next state">${icon('arrowRight', 15)}</button></div>`;
}

function renderAddTransactionModal() {
  if (!state.showAddTransaction) return '';
  return `<div class="modal-backdrop" data-action="close-add"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="add-transaction-title">
    <div class="modal-header"><div><span class="card-label">Manual ledger entry</span><h2 id="add-transaction-title">Add transaction</h2></div><button class="modal-close" data-action="close-add" aria-label="Close">×</button></div>
    <p class="modal-description">Add a personal note for income, expense, cash, transfer, or adjustment. Manual items are stored separately from imported bank SMS messages.</p>
    <form id="manual-transaction-form">
      <div class="manual-form-grid">
        <div class="parsed-field"><label for="manual-type">Type</label><select id="manual-type" required><option value="income">Manual income</option><option value="expense">Manual expense</option><option value="cash">Cash</option><option value="transfer">Transfer</option><option value="adjustment">Adjustment</option></select></div>
        <div class="parsed-field"><label for="manual-amount">Amount</label><input id="manual-amount" type="number" min="0.01" step="0.01" placeholder="0.00" required /></div>
        <div class="parsed-field full"><label for="manual-description">Description</label><input id="manual-description" type="text" maxlength="60" placeholder="e.g. Cash lunch" required /></div>
        <div class="parsed-field"><label for="manual-date">Date</label><input id="manual-date" type="date" value="2026-08-04" required /></div>
        <div class="parsed-field"><label>Source</label><span class="modal-source"><span class="source-chip source-chip-manual">Manual entry</span><small>Never treated as bank SMS</small></span></div>
      </div>
      <div class="modal-actions"><button class="button button-secondary" type="button" data-action="close-add">Cancel</button><button class="button button-primary" type="submit">Save manual entry ${icon('check', 14)}</button></div>
    </form>
  </div></div>`;
}

function renderManualRecurringRuleModal() {
  if (!state.showRecurringRule) return '';
  const existingRule = state.editingRecurringRuleId
    ? state.manualRecurringRules.find((rule) => rule.id === state.editingRecurringRuleId)
    : null;
  const transaction = transactionLedger().find((item) => item.id === (existingRule?.sourceEventId || state.recurringRuleTransactionId));
  if (!existingRule && !transaction) return '';
  const merchant = existingRule?.merchant || transaction.name;
  const amount = existingRule?.amount ?? Math.abs(Number(transaction.amount) || 0);
  const nextExpectedDate = existingRule?.nextExpectedDate || addDays(transaction.dateValue || transaction.meta, 30) || dateInputValue(new Date());
  const sourceLabel = existingRule?.sourceLabel || transaction.source;
  const sourceMeta = existingRule ? `${existingRule.category} · Manual rule` : `${transaction.meta} · ${transaction.category}`;
  const cadenceOptions = manualRecurringCadenceOptions()
    .map((cadence) => `<option value="${cadence.key}"${cadence.key === (existingRule?.cadenceKey || 'monthly') ? ' selected' : ''}>${cadence.label}</option>`)
    .join('');
  return `<div class="modal-backdrop" data-action="close-recurring-rule"><div class="modal recurring-rule-modal" role="dialog" aria-modal="true" aria-labelledby="manual-recurring-title">
    <div class="modal-header"><div><span class="card-label">Manual recurring rule</span><h2 id="manual-recurring-title">${existingRule ? 'Manage this recurring rule' : 'Track this transaction again'}</h2></div><button class="modal-close" data-action="close-recurring-rule" aria-label="Close">×</button></div>
    <p class="modal-description">This is a local reminder based on one approved imported debit. It never adds bank evidence, changes totals, syncs to the cloud, or makes a payment.</p>
    <div class="recurring-rule-source"><span class="source-chip source-chip-dark">${escapeHtml(sourceLabel)}</span><span>${escapeHtml(sourceMeta)}</span></div>
    <form id="manual-recurring-form">
      <div class="manual-form-grid">
        <div class="parsed-field full"><label for="recurring-merchant">Merchant</label><input id="recurring-merchant" value="${escapeHtml(merchant)}" readonly /></div>
        <div class="parsed-field"><label for="recurring-amount">Amount</label><input id="recurring-amount" type="number" min="0.01" step="0.01" value="${Number(amount).toFixed(2)}" required /></div>
        <div class="parsed-field"><label for="recurring-cadence">Cadence</label><select id="recurring-cadence" required>${cadenceOptions}</select></div>
        <div class="parsed-field"><label for="recurring-next-date">Next expected date</label><input id="recurring-next-date" type="date" value="${nextExpectedDate}" required /></div>
        <div class="parsed-field"><label>Evidence</label><span class="modal-source"><span class="source-chip source-chip-dark">Imported debit</span><small>One approved event · manual rule stays separate</small></span></div>
      </div>
      <div class="modal-actions"><button class="button button-secondary" type="button" data-action="close-recurring-rule">Cancel</button><button class="button button-primary" type="submit">${existingRule ? 'Save changes' : 'Save manual rule'} ${icon('check', 14)}</button></div>
    </form>
  </div></div>`;
}

function render() {
  let page = renderOverview();
  if (state.view === 'transactions') page = renderTransactions();
  if (state.view === 'analytics') page = renderAnalytics();
  if (state.view === 'recurring') page = renderRecurring();
  if (state.view === 'cash-flow') page = renderCashFlow();
  if (state.view === 'review') page = renderReview();
  if (state.view === 'settings') page = renderSettings();
  app.innerHTML = `<div class="app-shell">${renderSidebar()}<main class="main-shell">${renderTopbar()}${page}</main></div>${renderPrototypeSwitcher()}${renderAddTransactionModal()}${renderManualRecurringRuleModal()}${state.toast ? `<div class="toast">${icon('check', 15)}${state.toast}</div>` : ''}`;
  bindEvents();
}

window.__harborLedger = harborLedger;
window.__harborRender = render;
window.__harborShowToast = showToast;

function bindEvents() {
  document.querySelectorAll('[data-view]').forEach((element) => {
    element.addEventListener('click', () => setView(element.dataset.view));
  });
  document.querySelectorAll('[data-action="settings-save"]').forEach((element) => {
    element.addEventListener('click', () => showToast('Local preferences saved for this prototype session.'));
  });
  document.querySelectorAll('[data-action="open-add"]').forEach((element) => {
    element.addEventListener('click', () => {
      state.showAddTransaction = true;
      render();
      document.querySelector('#manual-type')?.focus();
    });
  });
  document.querySelectorAll('[data-action="close-add"]').forEach((element) => {
    element.addEventListener('click', (event) => {
      if (event.currentTarget.classList.contains('modal-backdrop') && event.target !== event.currentTarget) return;
      state.showAddTransaction = false;
      render();
    });
  });
  document.querySelectorAll('[data-action="open-recurring-rule"]').forEach((element) => {
    element.addEventListener('click', () => {
      const transaction = transactionLedger().find((item) => item.id === element.dataset.transactionId);
      if (!transaction || transaction.status === 'Needs review') {
        showToast('Review the imported transaction before creating a recurring rule.');
        return;
      }
      const existingRule = state.manualRecurringRules.find((rule) => rule.sourceEventId === transaction.id);
      state.recurringRuleTransactionId = transaction.id;
      state.editingRecurringRuleId = existingRule?.id || null;
      state.showRecurringRule = true;
      render();
      document.querySelector('#recurring-amount')?.focus();
    });
  });
  document.querySelectorAll('[data-action="close-recurring-rule"]').forEach((element) => {
    element.addEventListener('click', (event) => {
      if (event.currentTarget.classList.contains('modal-backdrop') && event.target !== event.currentTarget) return;
      state.showRecurringRule = false;
      state.recurringRuleTransactionId = null;
      state.editingRecurringRuleId = null;
      render();
    });
  });
  document.querySelectorAll('[data-action="edit-recurring-rule"]').forEach((element) => {
    element.addEventListener('click', () => {
      state.editingRecurringRuleId = element.dataset.ruleId;
      state.recurringRuleTransactionId = null;
      state.showRecurringRule = true;
      render();
      document.querySelector('#recurring-amount')?.focus();
    });
  });
  document.querySelectorAll('[data-action="toggle-recurring-rule"]').forEach((element) => {
    element.addEventListener('click', () => {
      const index = state.manualRecurringRules.findIndex((rule) => rule.id === element.dataset.ruleId);
      if (index < 0) return;
      const nextRules = state.manualRecurringRules.slice();
      nextRules[index] = setManualRecurringRulePaused(nextRules[index], !nextRules[index].paused);
      if (!persistManualRecurringRules(nextRules)) {
        showToast('The rule could not be saved locally. Check browser storage and try again.');
        return;
      }
      state.manualRecurringRules = nextRules;
      render();
      showToast(nextRules[index].paused ? 'Manual recurring rule paused locally.' : 'Manual recurring rule resumed locally.');
    });
  });
  document.querySelectorAll('[data-action="delete-recurring-rule"]').forEach((element) => {
    element.addEventListener('click', () => {
      const rule = state.manualRecurringRules.find((candidate) => candidate.id === element.dataset.ruleId);
      if (!rule || !window.confirm(`Remove the recurring rule for ${rule.merchant}? This only removes the local reminder.`)) return;
      const nextRules = state.manualRecurringRules.filter((candidate) => candidate.id !== rule.id);
      if (!persistManualRecurringRules(nextRules)) {
        showToast('The rule could not be removed locally. Check browser storage and try again.');
        return;
      }
      state.manualRecurringRules = nextRules;
      render();
      showToast('Manual recurring rule removed. No bank evidence changed.');
    });
  });
  document.querySelectorAll('[data-action="queue-select"]').forEach((element) => {
    element.addEventListener('click', () => {
      state.reviewCandidateId = element.dataset.candidateId || null;
      state.isEditing = false;
      render();
    });
  });
  document.querySelectorAll('[data-transaction-filter]').forEach((element) => {
    element.addEventListener('click', () => {
      state.transactionFilter = element.dataset.transactionFilter;
      render();
    });
  });
  document.querySelector('#trend-timeframe')?.addEventListener('change', (event) => {
    state.trendTimeframe = event.target.value;
    render();
  });
  document.querySelectorAll('[data-display-currency]').forEach((element) => {
    element.addEventListener('change', (event) => {
      if (!DISPLAY_CURRENCY_BY_CODE[event.target.value]) return;
      state.displayCurrency = event.target.value;
      render();
    });
  });
  document.querySelector('#transaction-search')?.addEventListener('input', (event) => {
    state.transactionQuery = event.target.value;
    render();
    const nextSearch = document.querySelector('#transaction-search');
    nextSearch?.focus();
    nextSearch?.setSelectionRange(state.transactionQuery.length, state.transactionQuery.length);
  });
  document.querySelectorAll('[data-action="transaction-detail"]').forEach((element) => {
    element.addEventListener('click', () => showToast(`${element.dataset.transactionName} selected. Structured fields stay local to this prototype.`));
  });
  document.querySelectorAll('[data-action="export-transactions"]').forEach((element) => {
    element.addEventListener('click', () => showToast('Export stays disabled in this visual prototype.'));
  });
  const recurringForm = document.querySelector('#manual-recurring-form');
  recurringForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      const input = {
        amount: Number(document.querySelector('#recurring-amount').value),
        cadence: document.querySelector('#recurring-cadence').value,
        nextExpectedDate: document.querySelector('#recurring-next-date').value,
        updatedAt: new Date().toISOString()
      };
      let nextRules;
      let successMessage;
      if (state.editingRecurringRuleId) {
        const index = state.manualRecurringRules.findIndex((rule) => rule.id === state.editingRecurringRuleId);
        if (index < 0) throw new Error('The saved manual rule is no longer available locally.');
        nextRules = state.manualRecurringRules.slice();
        nextRules[index] = updateManualRecurringRule(nextRules[index], input);
        successMessage = 'Manual recurring rule updated locally. No payment was scheduled.';
      } else {
        const transaction = transactionLedger().find((item) => item.id === state.recurringRuleTransactionId);
        if (!transaction) throw new Error('The imported transaction is no longer available locally.');
        const rule = createManualRecurringRule(transaction, { ...input, createdAt: input.updatedAt });
        if (state.manualRecurringRules.some((existingRule) => existingRule.sourceEventId === rule.sourceEventId)) {
          throw new Error('A manual recurring rule already exists for this imported debit.');
        }
        nextRules = [rule, ...state.manualRecurringRules];
        successMessage = 'Manual recurring rule saved locally. No payment was scheduled.';
      }
      if (!persistManualRecurringRules(nextRules)) {
        showToast('The rule could not be saved locally. Check browser storage and try again.');
        return;
      }
      state.manualRecurringRules = nextRules;
      state.showRecurringRule = false;
      state.recurringRuleTransactionId = null;
      state.editingRecurringRuleId = null;
      setView('recurring');
      showToast(successMessage);
    } catch (error) {
      showToast(error.message || 'The recurring rule could not be saved locally.');
    }
  });
  document.querySelectorAll('[data-action="edit"]').forEach((element) => {
    element.addEventListener('click', () => {
      state.isEditing = !state.isEditing;
      render();
    });
  });
  document.querySelectorAll('[data-action="approve"]').forEach((element) => {
    element.addEventListener('click', () => {
      const result = harborLedger.approveCandidate(element.dataset.candidateId);
      if (result.kind !== 'approved') {
        showToast('This review item could not be approved locally.');
        return;
      }
      state.reviewCandidateId = null;
      state.isEditing = false;
      showToast('Saved locally. The review item is now approved.');
    });
  });
  const form = document.querySelector('#manual-transaction-form');
  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    const type = document.querySelector('#manual-type').value;
    const amount = Number(document.querySelector('#manual-amount').value);
    const description = document.querySelector('#manual-description').value.trim();
    const dateValue = document.querySelector('#manual-date').value;
    if (!description || !amount || amount <= 0 || !dateValue) return;
    state.manualTransactions.unshift({ type, amount, description, date: formatManualDate(dateValue) });
    state.showAddTransaction = false;
    showToast(`Manual ${manualTypeLabel(type).toLowerCase()} added. It is labeled separately from bank SMS.`);
  });
}

function formatManualDate(value) {
  const date = new Date(`${value}T12:00:00`);
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

window.addEventListener('keydown', (event) => {
  const tagName = document.activeElement?.tagName;
  if (tagName === 'INPUT' || tagName === 'TEXTAREA' || document.activeElement?.isContentEditable) return;
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  event.preventDefault();
  const index = views.findIndex((view) => view.id === state.view);
  const offset = event.key === 'ArrowRight' ? 1 : -1;
  setView(views[(index + offset + views.length) % views.length].id);
});

render();
