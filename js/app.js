// ============================================================
// js/app.js — Tab routing, renderAll, global state
// ============================================================

// ── Editing state (shared across tab modules) ───────────────
let editingCustomerId  = null;
let editingInvoiceId   = null;
let editingCNId        = null;
let editingUserId      = null;
let editingExpenseId   = null;
let editingDealerId    = null;
let editingPurchaseId  = null;
let editingPurchPayId  = null;
let editingDNId        = null;
let reminderTarget     = null;
let custFilter         = 'all';

// ── Tab switching ───────────────────────────────────────────
function showTab(name, btn) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const panel = document.getElementById('tab-' + name);
  if (panel) panel.classList.add('active');
  if (btn) btn.classList.add('active');
  // Re-render on tab switch from live DB state
  if (name === 'dashboard')    renderDashboard();
  if (name === 'customers')    renderCustomers();
  if (name === 'invoices')     { initInvMonthFilter(); renderInvoices(); }
  if (name === 'payments')     renderPayments();
  if (name === 'overdue')      renderOverdue();
  if (name === 'creditnotes')  { updateCustomerDropdowns(); renderCreditNotes(); }
  if (name === 'ledger')       { updateLedgerDropdown(); renderLedger(); }
  if (name === 'log')          renderLog();
  if (name === 'users')        renderUsersTable();
  if (name === 'backup')       renderBackupHistory();
  if (name === 'expenses')     renderExpenses();
  if (name === 'dealers')      renderDealers();
  if (name === 'purchases')    { updatePurDealerDropdowns(); renderPurchases(); }
  if (name === 'purchpayments'){ updatePurchPayDealerDropdowns(); renderPurchPayments(); }
  if (name === 'debitnotes')   { updateDNDealerDropdowns(); renderDebitNotes(); }
}

// ── Master re-render ────────────────────────────────────────
function renderAll() {
  renderDashboard();
  renderCustomers();
  initInvMonthFilter();
  renderInvoices();
  renderPayments();
  renderOverdue();
  renderCreditNotes();
  updateCustomerDropdowns();
  updateLedgerDropdown();
  renderLedger();
  if (document.getElementById('tab-backup')?.classList.contains('active'))       renderBackupHistory();
  if (document.getElementById('tab-expenses')?.classList.contains('active'))     renderExpenses();
  if (document.getElementById('tab-dealers')?.classList.contains('active'))      renderDealers();
  if (document.getElementById('tab-purchases')?.classList.contains('active'))    renderPurchases();
  if (document.getElementById('tab-purchpayments')?.classList.contains('active'))renderPurchPayments();
  if (document.getElementById('tab-debitnotes')?.classList.contains('active'))   renderDebitNotes();
}

function initInvMonthFilter() { /* no-op — using from/to date range */ }

function setCustFilter(f, btn) {
  custFilter = f;
  document.querySelectorAll('#tab-customers .filter-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderCustomers();
}
