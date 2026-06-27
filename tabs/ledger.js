// ============================================================
// tabs/ledger.js — Customer Ledger render, print, export
// ============================================================

function updateLedgerDropdown() {
  const sel    = document.getElementById('ledger-cust');
  if (!sel) return;
  const sorted = [...DB.customers].sort((a,b) => a.name.localeCompare(b.name,'en-IN'));
  const prev   = sel.value;
  sel.innerHTML = '<option value="">— All Customers —</option>' +
    sorted.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  if (prev) sel.value = prev;
}

function clearLedgerDateFilter() {
  const f = document.getElementById('ledger-date-from'); if (f) f.value='';
  const t = document.getElementById('ledger-date-to');   if (t) t.value='';
  renderLedger();
}

function renderLedger() {
  const selectedCustId = document.getElementById('ledger-cust')?.value || '';
  const statusFilter   = document.getElementById('ledger-status')?.value || 'total';
  const dateFrom       = document.getElementById('ledger-date-from')?.value || '';
  const dateTo         = document.getElementById('ledger-date-to')?.value || '';
  const tbody          = document.getElementById('ledger-table');
  if (!tbody) return;

  let invs = DB.invoices.filter(inv => {
    if (selectedCustId) {
      const custIdInt = Math.round(parseFloat(selectedCustId));
      if (Math.round(parseFloat(inv.customerId)) !== custIdInt && String(inv.customerId) !== selectedCustId) return false;
    }
    if (statusFilter === 'paid'   && getInvoiceStatus(inv) !== 'paid')   return false;
    if (statusFilter === 'unpaid' && getInvoiceStatus(inv) === 'paid')   return false;
    if (dateFrom && inv.date < dateFrom) return false;
    if (dateTo   && inv.date > dateTo)   return false;
    return true;
  }).sort((a,b) => {
    if (selectedCustId) return new Date(a.date) - new Date(b.date);
    const ca = DB.customers.find(c => c.id === Math.round(parseFloat(a.customerId)))?.name || '';
    const cb = DB.customers.find(c => c.id === Math.round(parseFloat(b.customerId)))?.name || '';
    return ca.localeCompare(cb,'en-IN') || new Date(a.date) - new Date(b.date);
  });

  // Stats
  const totalAmt   = invs.reduce((s, i) => s + parseFloat(i.amount), 0);
  const totalPaid  = invs.reduce((s, i) => s + getPaidAmount(i.id), 0);
  const totalUnpaid = totalAmt - totalPaid;
  const paidCount   = invs.filter(i => getInvoiceStatus(i) === 'paid').length;
  const unpaidCount = invs.filter(i => getInvoiceStatus(i) !== 'paid').length;

  const el = (id) => document.getElementById(id);
  if (el('ledger-total'))        el('ledger-total').textContent        = '₹' + fmt(totalAmt);
  if (el('ledger-paid'))         el('ledger-paid').textContent         = '₹' + fmt(totalPaid);
  if (el('ledger-unpaid'))       el('ledger-unpaid').textContent       = '₹' + fmt(totalUnpaid);
  if (el('ledger-total-count'))  el('ledger-total-count').textContent  = invs.length + ' invoices';
  if (el('ledger-paid-count'))   el('ledger-paid-count').textContent   = paidCount + ' paid';
  if (el('ledger-unpaid-count')) el('ledger-unpaid-count').textContent = unpaidCount + ' unpaid';

  if (!invs.length) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state"><div class="icon">📒</div><p>No records found.</p></div></td></tr>`;
    return;
  }
  const statusMap = { paid:'badge-paid', pending:'badge-pending', partial:'badge-partial', overdue:'badge-overdue' };
  let runningBal = 0;
  tbody.innerHTML = invs.map((inv, idx) => {
    const c      = DB.customers.find(c => String(c.id) === String(Math.round(parseFloat(inv.customerId))));
    const paid   = getPaidAmount(inv.id);
    const bal    = parseFloat(inv.amount) - paid;
    runningBal  += bal;
    const status = getInvoiceStatus(inv);
    return `<tr>
      <td>${idx + 1}</td>
      <td>${c?.name || '—'}</td>
      <td><strong>${inv.invNo}</strong></td>
      <td>${fmtDate(inv.date)}</td>
      <td>${fmtDate(inv.dueDate)}</td>
      <td>₹${fmt(inv.amount)}</td>
      <td style="color:var(--success)">₹${fmt(paid)}</td>
      <td style="color:${bal>0?'var(--danger)':'var(--success)'}">₹${fmt(bal)}</td>
      <td><span class="badge ${statusMap[status]}">${status}</span></td>
    </tr>`;
  }).join('');
}

function exportLedger() {
  const selectedCustId = document.getElementById('ledger-cust')?.value || '';
  const statusFilter   = document.getElementById('ledger-status')?.value || 'total';
  const dateFrom       = document.getElementById('ledger-date-from')?.value || '';
  const dateTo         = document.getElementById('ledger-date-to')?.value || '';
  let invs = DB.invoices.filter(inv => {
    if (selectedCustId) {
      const custIdInt = Math.round(parseFloat(selectedCustId));
      if (Math.round(parseFloat(inv.customerId)) !== custIdInt) return false;
    }
    if (statusFilter === 'paid'   && getInvoiceStatus(inv) !== 'paid') return false;
    if (statusFilter === 'unpaid' && getInvoiceStatus(inv) === 'paid') return false;
    if (dateFrom && inv.date < dateFrom) return false;
    if (dateTo   && inv.date > dateTo)   return false;
    return true;
  });
  if (!invs.length) return toast('No ledger data to export.', 'error');
  const data = invs.map(inv => {
    const c = DB.customers.find(c => String(c.id) === String(Math.round(parseFloat(inv.customerId))));
    return {
      Customer: c?.name||'', InvoiceNo: inv.invNo, Date: inv.date, DueDate: inv.dueDate,
      Amount: parseFloat(inv.amount), Paid: getPaidAmount(inv.id),
      Balance: parseFloat(inv.amount) - getPaidAmount(inv.id), Status: getInvoiceStatus(inv)
    };
  });
  exportStyledXLSX(data, 'Ledger_MauliEnt', 'Ledger');
}

function printLedgerStatement() {
  const selectedCustId = document.getElementById('ledger-cust')?.value || '';
  const dateFrom       = document.getElementById('ledger-date-from')?.value || '';
  const dateTo         = document.getElementById('ledger-date-to')?.value || '';
  const c = selectedCustId ? DB.customers.find(c => String(c.id) === selectedCustId) : null;
  let invs = DB.invoices.filter(inv => {
    if (selectedCustId) {
      const custIdInt = Math.round(parseFloat(selectedCustId));
      if (Math.round(parseFloat(inv.customerId)) !== custIdInt) return false;
    }
    if (dateFrom && inv.date < dateFrom) return false;
    if (dateTo   && inv.date > dateTo)   return false;
    return true;
  }).sort((a,b) => new Date(a.date) - new Date(b.date));
  if (!invs.length) return toast('No invoices to print.', 'error');

  const totalAmt  = invs.reduce((s, i) => s + parseFloat(i.amount), 0);
  const totalPaid = invs.reduce((s, i) => s + getPaidAmount(i.id), 0);
  const totalBal  = totalAmt - totalPaid;
  const rows = invs.map((inv, i) => {
    const paid   = getPaidAmount(inv.id);
    const bal    = parseFloat(inv.amount) - paid;
    const status = getInvoiceStatus(inv);
    const statusColors = { paid:'#16a34a', pending:'#d97706', partial:'#1a6fd4', overdue:'#dc2626' };
    return `<tr${i % 2 === 0 ? ' style="background:#f8faff"' : ''}>
      <td>${i+1}</td>
      <td><strong>${inv.invNo}</strong></td>
      <td>${fmtDate(inv.date)}</td>
      <td>${fmtDate(inv.dueDate)}</td>
      <td>₹${fmt(inv.amount)}</td>
      <td style="color:#16a34a">₹${fmt(paid)}</td>
      <td style="color:${bal>0?'#dc2626':'#16a34a'}">₹${fmt(bal)}</td>
      <td><span class="badge ${status}" style="background:${statusColors[status]}20;color:${statusColors[status]};border:1px solid ${statusColors[status]}40;border-radius:10px;padding:2px 8px;font-size:10px;font-weight:700">${status}</span></td>
    </tr>`;
  }).join('');

  const custInfo = c
    ? `<div style="margin-bottom:14px;background:#f8faff;border:1px solid #e2e8f0;border-radius:8px;padding:10px 14px;font-size:12px"><strong>${c.name}</strong>${c.company ? ' · ' + c.company : ''}<br>${c.phone || ''}${c.email ? ' · ' + c.email : ''}</div>`
    : '';
  const periodLine = (dateFrom || dateTo) ? `<div style="font-size:11px;color:#64748b;margin-bottom:10px">Period: ${dateFrom ? fmtDate(dateFrom) : '—'} to ${dateTo ? fmtDate(dateTo) : '—'}</div>` : '';
  const html = `
    <div class="header"><div>
      <div class="co-name"><span class="m">MAULI</span> <span class="e">ENTERPRISES</span></div>
      <div class="co-prop">PROP. SOURABH KAREKAR</div>
      <div class="co-sub">${MAULI_LETTERHEAD.address}<br>GSTIN: ${MAULI_LETTERHEAD.gstin} &nbsp;|&nbsp; Ph: ${MAULI_LETTERHEAD.phone} &nbsp;|&nbsp; ${MAULI_LETTERHEAD.email}</div>
    </div><img src="./logo.png" class="logo" onerror="this.style.display='none'"></div>
    <div class="section-title" style="color:#000;font-size:17px;font-weight:700;text-align:center;border-bottom:1px solid #cbd5e1;padding-bottom:8px;margin-bottom:14px">Account Statement</div>
    ${periodLine}${custInfo}
    <table><thead><tr><th>#</th><th>Invoice #</th><th>Date</th><th>Due Date</th><th>Amount</th><th>Paid</th><th>Balance</th><th>Status</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr class="total-row" style="background:#e8f0fc">
      <td colspan="4" style="text-align:right;font-weight:700;color:#1355a8">Totals:</td>
      <td style="font-weight:700">₹${fmt(totalAmt)}</td>
      <td style="font-weight:700;color:#16a34a">₹${fmt(totalPaid)}</td>
      <td style="font-weight:700;color:${totalBal>0?'#dc2626':'#16a34a'}">₹${fmt(totalBal)}</td>
      <td></td>
    </tr></tfoot></table>
    <div class="footer">Generated on ${new Date().toLocaleDateString('en-IN')} &nbsp;|&nbsp; MAULI ENTERPRISES</div>`;
  buildPrintWindow(html, c?.email || null, c?.phone || null);
}
