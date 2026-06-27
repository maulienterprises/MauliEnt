// ============================================================
// tabs/payments.js — Payment CRUD, receipt, edit, revise
// ============================================================

let _revisePaymentId       = null;
let _editPaymentGroupId    = null;
let _editPayCustomerId     = null;

// ── New Payment Modal ────────────────────────────────────────
function openPaymentModal() {
  _revisePaymentId = null;
  populatePaymentCustomers();
  document.getElementById('pm-total-received').value = '';
  document.getElementById('pm-date').value    = today();
  document.getElementById('pm-ref').value     = '';
  document.getElementById('pm-notes').value   = '';
  document.getElementById('pm-method').value  = 'Cash';
  document.getElementById('pm-invoice-rows').innerHTML = '';
  document.getElementById('pm-remaining-warn').style.display = 'none';
  updatePayRemaining();
  openModal('modal-payment');
}

function openPaymentModalForInvoice(invoiceId) {
  const inv = DB.invoices.find(i => i.id === invoiceId);
  if (!inv) return;
  _revisePaymentId = null;
  populatePaymentCustomers(inv.customerId);
  document.getElementById('pm-total-received').value = '';
  document.getElementById('pm-date').value    = today();
  document.getElementById('pm-ref').value     = '';
  document.getElementById('pm-notes').value   = '';
  document.getElementById('pm-method').value  = 'Cash';
  document.getElementById('pm-invoice-rows').innerHTML = '';
  updatePayRemaining();
  openModal('modal-payment');
  setTimeout(() => { onPayCustomerChange(inv.customerId, invoiceId); }, 60);
}

function populatePaymentCustomers(selectedId) {
  const sel    = document.getElementById('pm-customer');
  const sorted = [...DB.customers].sort((a,b) => a.name.localeCompare(b.name,'en-IN'));
  sel.innerHTML = '<option value="">-- Select Customer --</option>' +
    sorted.map(c => `<option value="${c.id}" ${c.id === selectedId ? 'selected' : ''}>${c.name}</option>`).join('');
}

function onPayCustomerChange(forceCustomerId, forceInvoiceId) {
  const custId = forceCustomerId || parseInt(document.getElementById('pm-customer').value);
  document.getElementById('pm-invoice-rows').innerHTML = '';
  if (!custId) { updatePayRemaining(); return; }
  const sel = document.getElementById('pm-customer');
  if (sel && custId && !sel.value) sel.value = String(custId);
  addPayInvoiceRow(forceInvoiceId, custId);
}

function addPayInvoiceRow(preselectInvId, forceCustId) {
  const custIdRaw = forceCustId != null ? String(forceCustId) : document.getElementById('pm-customer').value;
  const custId = parseInt(custIdRaw);
  if (!custId) { toast('Select a customer first.', 'error'); return; }
  const pmSel = document.getElementById('pm-customer');
  if (pmSel && !pmSel.value && custId) pmSel.value = String(custId);
  const container = document.getElementById('pm-invoice-rows');
  const rowId = 'prow_' + Date.now();
  const allInvoices = getAllInvoicesForCustomer(custId);
  if (!allInvoices.length) {
    const div = document.createElement('div');
    div.style.cssText = 'background:#f39c1215;border:1px solid var(--warning);border-radius:8px;padding:10px 14px;color:var(--warning);font-size:0.83rem;margin-bottom:8px';
    div.textContent = '⚠ No invoices found for this customer.';
    container.appendChild(div); updatePayRemaining(); return;
  }
  const unpaid   = allInvoices.filter(i => getInvoiceStatus(i) !== 'paid');
  const paidInvs = allInvoices.filter(i => getInvoiceStatus(i) === 'paid');
  const makeOpt  = (i, isPaid) => {
    const bal = parseFloat(i.amount) - getPaidAmount(i.id);
    const isSelected = preselectInvId && String(i.id) === String(preselectInvId) ? 'selected' : '';
    const label = isPaid ? `${i.invNo} — ₹${fmt(parseFloat(i.amount))} [PAID]` : `${i.invNo} — ₹${fmt(parseFloat(i.amount))} (bal ₹${fmt(bal)})`;
    return `<option value="${i.id}" ${isSelected} ${isPaid ? 'style="color:#94a3b8"' : ''}>${label}</option>`;
  };
  const opts = [
    unpaid.length  ? `<optgroup label="Unpaid / Partial">${unpaid.map(i => makeOpt(i,false)).join('')}</optgroup>` : '',
    paidInvs.length ? `<optgroup label="Already Paid">${paidInvs.map(i => makeOpt(i,true)).join('')}</optgroup>` : ''
  ].join('');
  const div = document.createElement('div');
  div.id = rowId;
  div.style.cssText = 'background:var(--card2);border:1px solid var(--border);border-radius:8px;padding:10px 12px;margin-bottom:8px';
  div.innerHTML = `
    <div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr auto;gap:8px;align-items:end">
      <div class="form-group" style="margin:0"><label style="font-size:0.72rem">Invoice</label>
        <select onchange="onPayInvRowChange('${rowId}')" style="width:100%;background:var(--input-bg);border:1px solid var(--border);border-radius:8px;padding:8px 10px;font-size:0.82rem;font-family:inherit;color:var(--text)">
          <option value="">-- Select --</option>${opts}
        </select>
      </div>
      <div class="form-group" style="margin:0"><label style="font-size:0.72rem">Cash Disc (₹)</label>
        <input type="number" placeholder="0" min="0" step="0.01" value="0" style="width:100%;background:var(--input-bg);border:1px solid var(--border);border-radius:8px;padding:8px 10px;font-size:0.82rem;font-family:inherit;color:var(--text)" oninput="updatePayRemaining()">
      </div>
      <div class="form-group" style="margin:0"><label style="font-size:0.72rem">Adjust Amt (₹)</label>
        <input type="number" placeholder="0" min="0" step="0.01" style="width:100%;background:var(--input-bg);border:1px solid var(--border);border-radius:8px;padding:8px 10px;font-size:0.82rem;font-family:inherit;color:var(--text)" oninput="updatePayRemaining()">
      </div>
      <div class="form-group" style="margin:0"><label style="font-size:0.72rem">Balance</label>
        <input type="text" readonly placeholder="₹0" style="width:100%;background:var(--input-bg);border:1px solid var(--border);border-radius:8px;padding:8px 10px;font-size:0.82rem;color:var(--success);font-weight:600;font-family:inherit">
      </div>
      <button onclick="document.getElementById('${rowId}').remove();updatePayRemaining()" style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:1.1rem;padding:0 4px;margin-bottom:2px">✕</button>
    </div>
    <div style="font-size:0.72rem;color:var(--muted);margin-top:5px" id="${rowId}_meta">Select an invoice to see details</div>`;
  container.appendChild(div);
  if (preselectInvId) { const sel = div.querySelector('select'); if (sel) { sel.value = preselectInvId; onPayInvRowChange(rowId); } }
  updatePayRemaining();
}

function onPayInvRowChange(rowId) {
  const row   = document.getElementById(rowId);
  if (!row) return;
  const sel   = row.querySelector('select');
  const invId = parseInt(sel.value);
  const meta  = document.getElementById(rowId + '_meta');
  if (!invId) { if (meta) meta.textContent = 'Select an invoice to see details'; updatePayRemaining(); return; }
  const inv = DB.invoices.find(i => i.id === invId);
  if (!inv) return;
  const bal    = parseFloat(inv.amount) - getPaidAmount(invId);
  const status = getInvoiceStatus(inv);
  const statusColors = { paid:'var(--success)', pending:'var(--warning)', partial:'var(--accent)', overdue:'var(--danger)' };
  if (meta) meta.innerHTML = `Invoice ₹${fmt(parseFloat(inv.amount))} &nbsp;|&nbsp; <span style="color:${statusColors[status]};font-weight:600">${status}</span> &nbsp;|&nbsp; Due: ${fmtDate(inv.dueDate)} &nbsp;|&nbsp; Balance: <strong style="color:var(--danger)">₹${fmt(bal)}</strong>`;
  updatePayRemaining();
}

function updatePayRemaining() {
  const totalReceived = parseFloat(document.getElementById('pm-total-received')?.value) || 0;
  let totalAllocated = 0, totalDisc = 0;
  document.querySelectorAll('#pm-invoice-rows > div').forEach(row => {
    const inputs = row.querySelectorAll('input[type=number]');
    const disc = parseFloat(inputs[0]?.value) || 0;
    const adj  = parseFloat(inputs[1]?.value) || 0;
    const balInput = row.querySelectorAll('input[type=text]')[0];
    totalDisc += disc; totalAllocated += adj;
    const sel = row.querySelector('select');
    const invId = parseInt(sel?.value);
    if (invId && balInput) {
      const inv = DB.invoices.find(i => i.id === invId);
      if (inv) {
        const invBal = parseFloat(inv.amount) - getPaidAmount(invId);
        const remainBal = invBal - adj - disc;
        balInput.value = '₹' + fmt(remainBal);
        balInput.style.color = remainBal <= 0.01 ? 'var(--success)' : 'var(--danger)';
      }
    }
  });
  const remaining = totalReceived - totalAllocated;
  document.getElementById('pm-bar-received').textContent  = '₹' + fmt(totalReceived);
  document.getElementById('pm-bar-allocated').textContent = '₹' + fmt(totalAllocated);
  document.getElementById('pm-bar-disc').textContent      = '₹' + fmt(totalDisc);
  const remEl = document.getElementById('pm-bar-remaining');
  remEl.textContent   = '₹' + fmt(remaining);
  remEl.style.color   = Math.abs(remaining) < 0.01 ? 'var(--success)' : 'var(--danger)';
}

async function savePayment() {
  const customerId    = parseInt(document.getElementById('pm-customer').value);
  const date          = document.getElementById('pm-date').value;
  const method        = document.getElementById('pm-method').value;
  const ref           = document.getElementById('pm-ref').value.trim();
  const notes         = document.getElementById('pm-notes').value.trim();
  const totalReceived = parseFloat(document.getElementById('pm-total-received').value) || 0;
  if (!customerId)        return toast('Select a customer.', 'error');
  if (!date)              return toast('Payment date required.', 'error');
  if (totalReceived <= 0) return toast('Enter total amount received.', 'error');
  const rows = document.querySelectorAll('#pm-invoice-rows > div');
  if (!rows.length) return toast('Add at least one invoice to allocate.', 'error');
  const allocations = []; let totalAllocated = 0, totalDisc = 0;
  for (const row of rows) {
    const sel   = row.querySelector('select');
    const inputs = row.querySelectorAll('input[type=number]');
    const invId = parseInt(sel?.value);
    const disc  = parseFloat(inputs[0]?.value) || 0;
    const adj   = parseFloat(inputs[1]?.value) || 0;
    if (!invId)               { toast('Select an invoice for each row.', 'error'); return; }
    if (adj <= 0 && disc <= 0){ toast('Enter adjust amount or cash discount.', 'error'); return; }
    allocations.push({ invId, disc, adj }); totalAllocated += adj; totalDisc += disc;
  }
  if (Math.abs(totalReceived - totalAllocated) > 0.01) {
    document.getElementById('pm-remaining-warn').style.display = 'block';
    return toast('Total allocated must equal total received.', 'error');
  }
  document.getElementById('pm-remaining-warn').style.display = 'none';
  btnGuard('btn-save-payment');
  const c = DB.customers.find(c => c.id === customerId);
  const groupId = 'grp_' + Date.now();
  const invNos = [];
  for (const alloc of allocations) {
    const inv = DB.invoices.find(i => i.id === alloc.invId);
    invNos.push(inv?.invNo || '—');
    if (alloc.adj > 0) DB.payments.push({ id: uniqueId(), groupId, customerId, invoiceId: alloc.invId, amount: alloc.adj, date, method, ref, notes, cashDisc: alloc.disc, totalReceived });
    if (alloc.disc > 0 && alloc.adj === 0) DB.payments.push({ id: uniqueId(), groupId, customerId, invoiceId: alloc.invId, amount: alloc.disc, date, method: 'Cash Discount', ref, notes: 'Cash Discount', cashDisc: alloc.disc, totalReceived });
    if (alloc.disc > 0 && alloc.adj > 0)  DB.payments.push({ id: uniqueId(), groupId, customerId, invoiceId: alloc.invId, amount: alloc.disc, date, method: 'Cash Discount', ref, notes: `Cash Discount on ${inv?.invNo}`, cashDisc: alloc.disc, totalReceived });
  }
  await addLog('create', `Payment ₹${fmt(totalReceived)} [${method}] for invoices ${invNos.join(', ')} (${c?.name})`);
  const receiptNo = getNextReceiptNo(date);
  DB.payments.forEach((x, i) => { if (x.groupId === groupId) DB.payments[i].receiptNo = receiptNo; });
  try {
    await save('payments');
    toast('Payment recorded!', 'success');
    closeModal('modal-payment');
    renderPayments(); renderInvoices(); renderDashboard();
  } catch(e) {
    btnGuardReset('btn-save-payment');
    toast('❌ Failed to save payment: ' + e.message, 'error');
  }
}

// ── Revise Payment ───────────────────────────────────────────
function openRevisePaymentModal(paymentId) {
  _revisePaymentId = paymentId;
  const p   = DB.payments.find(p => p.id === paymentId);
  if (!p) return;
  const c   = DB.customers.find(c => c.id === p.customerId);
  const inv = DB.invoices.find(i => i.id === p.invoiceId);
  document.getElementById('revise-payment-info').innerHTML =
    `<strong>${c?.name || '—'}</strong> · Invoice: <strong>${inv?.invNo || '—'}</strong><br>Payment: ₹${fmt(p.amount)} via ${p.method} on ${fmtDate(p.date)}`;
  document.getElementById('rp-reason').value = 'Check Bounce';
  document.getElementById('rp-notes').value  = '';
  document.getElementById('rp-charges-chk').checked    = false;
  document.getElementById('rp-charges-box').style.display = 'none';
  document.getElementById('rp-charge-amount').value    = '';
  openModal('modal-revise-payment');
}

function onReviseReasonChange() {}
function toggleReviseCharges() {
  document.getElementById('rp-charges-box').style.display = document.getElementById('rp-charges-chk').checked ? 'block' : 'none';
}

async function saveRevisePayment() {
  if (!_revisePaymentId) return;
  const p = DB.payments.find(p => p.id === _revisePaymentId);
  if (!p) return;
  const reason      = document.getElementById('rp-reason').value;
  const notes       = document.getElementById('rp-notes').value.trim();
  const applyCharge = document.getElementById('rp-charges-chk').checked;
  const chargeAmt   = parseFloat(document.getElementById('rp-charge-amount').value) || 0;
  if (applyCharge && chargeAmt <= 0) return toast('Enter a valid charge amount.', 'error');
  btnGuard('btn-save-revise-payment');
  const inv = DB.invoices.find(i => i.id === p.invoiceId);
  const c   = DB.customers.find(c => c.id === p.customerId);
  const cancelNote = `[REVISED — ${reason}]${notes ? ': ' + notes : ''}`;
  if (p.groupId) {
    DB.payments.forEach(px => { if (px.groupId === p.groupId) { px.method = 'Cancelled'; px.notes = cancelNote; } });
  } else {
    p.method = 'Cancelled'; p.notes = cancelNote;
  }
  if (applyCharge && chargeAmt > 0 && inv) {
    const idx = DB.invoices.findIndex(i => i.id === inv.id);
    if (idx !== -1) { DB.invoices[idx].amount = (parseFloat(DB.invoices[idx].amount) + chargeAmt).toFixed(2); await save('invoices'); }
  }
  try {
    await save('payments');
    await addLog('correction', `Payment revised for ${inv?.invNo} (${c?.name}) — ${reason}${notes ? ': ' + notes : ''}${applyCharge ? ' | Charge ₹' + fmt(chargeAmt) : ''}`);
    toast('Payment revised! Invoice balance restored.', 'info');
    closeModal('modal-revise-payment');
    renderPayments(); renderInvoices(); renderOverdue(); renderDashboard();
  } catch(e) {
    btnGuardReset('btn-save-revise-payment');
    toast('❌ Failed to revise: ' + e.message, 'error');
  }
}

// ── Edit Payment ─────────────────────────────────────────────
function addEditPayInvoiceRow(preselectInvId) {
  const custIdRaw = document.getElementById('ep-customer').value;
  const custId = parseInt(custIdRaw);
  if (!custId) { toast('Select a customer first.', 'error'); return; }
  const container = document.getElementById('ep-invoice-rows');
  const rowId = 'eprow_' + Date.now();
  const allInvoices = getAllInvoicesForCustomer(custId);
  if (!allInvoices.length) {
    const div = document.createElement('div');
    div.style.cssText = 'background:#f39c1215;border:1px solid var(--warning);border-radius:8px;padding:10px 14px;color:var(--warning);font-size:0.83rem;margin-bottom:8px';
    div.textContent = '⚠ No invoices found for this customer.';
    container.appendChild(div); return;
  }
  const unpaid   = allInvoices.filter(i => getInvoiceStatus(i) !== 'paid');
  const paidInvs = allInvoices.filter(i => getInvoiceStatus(i) === 'paid');
  const makeOpt  = (i, isPaid) => {
    const bal = parseFloat(i.amount) - getPaidAmount(i.id);
    const isSelected = preselectInvId && String(i.id) === String(preselectInvId) ? 'selected' : '';
    const label = isPaid ? `${i.invNo} — ₹${fmt(parseFloat(i.amount))} [PAID]` : `${i.invNo} — ₹${fmt(parseFloat(i.amount))} (bal ₹${fmt(bal)})`;
    return `<option value="${i.id}" ${isSelected} ${isPaid ? 'style="color:#94a3b8"' : ''}>${label}</option>`;
  };
  const opts = [
    unpaid.length   ? `<optgroup label="Unpaid / Partial">${unpaid.map(i => makeOpt(i,false)).join('')}</optgroup>` : '',
    paidInvs.length ? `<optgroup label="Already Paid">${paidInvs.map(i => makeOpt(i,true)).join('')}</optgroup>` : ''
  ].join('');
  const div = document.createElement('div');
  div.id = rowId;
  div.style.cssText = 'background:var(--card2);border:1px solid var(--border);border-radius:8px;padding:10px 12px;margin-bottom:8px';
  div.innerHTML = `
    <div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr auto;gap:8px;align-items:end">
      <div class="form-group" style="margin:0"><label style="font-size:0.72rem">Invoice</label>
        <select onchange="onEditPayInvRowChange('${rowId}')" style="width:100%;background:var(--input-bg);border:1px solid var(--border);border-radius:8px;padding:8px 10px;font-size:0.82rem;font-family:inherit;color:var(--text)">
          <option value="">-- Select --</option>${opts}
        </select>
      </div>
      <div class="form-group" style="margin:0"><label style="font-size:0.72rem">Cash Disc (₹)</label>
        <input type="number" placeholder="0" min="0" step="0.01" value="0" style="width:100%;background:var(--input-bg);border:1px solid var(--border);border-radius:8px;padding:8px 10px;font-size:0.82rem;font-family:inherit;color:var(--text)" oninput="updateEditPayRemaining()">
      </div>
      <div class="form-group" style="margin:0"><label style="font-size:0.72rem">Adjust Amt (₹)</label>
        <input type="number" placeholder="0" min="0" step="0.01" style="width:100%;background:var(--input-bg);border:1px solid var(--border);border-radius:8px;padding:8px 10px;font-size:0.82rem;font-family:inherit;color:var(--text)" oninput="updateEditPayRemaining()">
      </div>
      <div class="form-group" style="margin:0"><label style="font-size:0.72rem">Balance</label>
        <input type="text" readonly placeholder="₹0" style="width:100%;background:var(--input-bg);border:1px solid var(--border);border-radius:8px;padding:8px 10px;font-size:0.82rem;color:var(--success);font-weight:600;font-family:inherit">
      </div>
      <button onclick="document.getElementById('${rowId}').remove();updateEditPayRemaining()" style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:1.1rem;padding:0 4px;margin-bottom:2px">✕</button>
    </div>
    <div style="font-size:0.72rem;color:var(--muted);margin-top:5px" id="${rowId}_meta">Select an invoice to see details</div>`;
  container.appendChild(div);
  if (preselectInvId) { const sel = div.querySelector('select'); if (sel) { sel.value = preselectInvId; onEditPayInvRowChange(rowId); } }
  updateEditPayRemaining();
}

function onEditPayInvRowChange(rowId) {
  const row   = document.getElementById(rowId); if (!row) return;
  const sel   = row.querySelector('select');
  const invId = parseInt(sel?.value);
  const meta  = document.getElementById(rowId + '_meta');
  if (!invId) { if (meta) meta.textContent = 'Select an invoice to see details'; updateEditPayRemaining(); return; }
  const inv = DB.invoices.find(i => i.id === invId); if (!inv) return;
  const bal = parseFloat(inv.amount) - getPaidAmount(invId);
  const status = getInvoiceStatus(inv);
  const statusColors = { paid:'var(--success)', pending:'var(--warning)', partial:'var(--accent)', overdue:'var(--danger)' };
  if (meta) meta.innerHTML = `Invoice ₹${fmt(parseFloat(inv.amount))} &nbsp;|&nbsp; <span style="color:${statusColors[status]};font-weight:600">${status}</span> &nbsp;|&nbsp; Due: ${fmtDate(inv.dueDate)} &nbsp;|&nbsp; Balance: <strong style="color:var(--danger)">₹${fmt(bal)}</strong>`;
  updateEditPayRemaining();
}

function updateEditPayRemaining() {
  const totalReceived = parseFloat(document.getElementById('ep-total-received')?.value) || 0;
  let totalAllocated = 0, totalDisc = 0;
  document.querySelectorAll('#ep-invoice-rows > div').forEach(row => {
    const inputs = row.querySelectorAll('input[type=number]');
    const disc = parseFloat(inputs[0]?.value) || 0;
    const adj  = parseFloat(inputs[1]?.value) || 0;
    const balInput = row.querySelectorAll('input[type=text]')[0];
    totalDisc += disc; totalAllocated += adj;
    const sel = row.querySelector('select');
    const invId = parseInt(sel?.value);
    if (invId && balInput) {
      const inv = DB.invoices.find(i => i.id === invId);
      if (inv) { const invBal = parseFloat(inv.amount) - getPaidAmount(invId); const remainBal = invBal - adj - disc; balInput.value = '₹' + fmt(remainBal); balInput.style.color = remainBal <= 0.01 ? 'var(--success)' : 'var(--danger)'; }
    }
  });
  const remaining = totalReceived - totalAllocated;
  document.getElementById('ep-bar-received').textContent  = '₹' + fmt(totalReceived);
  document.getElementById('ep-bar-allocated').textContent = '₹' + fmt(totalAllocated);
  document.getElementById('ep-bar-disc').textContent      = '₹' + fmt(totalDisc);
  const remEl = document.getElementById('ep-bar-remaining');
  remEl.textContent = '₹' + fmt(remaining);
  remEl.style.color = Math.abs(remaining) < 0.01 ? 'var(--success)' : 'var(--danger)';
}

function openEditPaymentModal(paymentId) {
  const p = DB.payments.find(px => px.id === paymentId);
  if (!p) return toast('Payment not found.', 'error');
  const groupEntries = p.groupId ? DB.payments.filter(px => px.groupId === p.groupId && px.method !== 'Cash Discount') : [p];
  _editPaymentGroupId = p.groupId || null;
  if (!_editPaymentGroupId) window._editPaymentSingleId = paymentId;
  const custId = Math.round(parseFloat(p.customerId));
  _editPayCustomerId = custId;
  const totalReceived = p.totalReceived || groupEntries.reduce((s,x) => s + parseFloat(x.amount), 0);
  document.getElementById('edit-payment-info').innerHTML = `Receipt: <strong>${p.receiptNo || '—'}</strong> · Group: <strong>${p.groupId || 'Single'}</strong>`;
  const sel    = document.getElementById('ep-customer');
  const sorted = [...DB.customers].sort((a,b) => a.name.localeCompare(b.name,'en-IN'));
  sel.innerHTML = '<option value="">-- Select Customer --</option>' + sorted.map(cx => `<option value="${cx.id}" ${cx.id === custId ? 'selected' : ''}>${cx.name}</option>`).join('');
  document.getElementById('ep-total-received').value = totalReceived;
  document.getElementById('ep-date').value           = p.date || '';
  document.getElementById('ep-method').value         = (groupEntries[0]?.method) || 'Cheque';
  document.getElementById('ep-ref').value            = p.ref || '';
  document.getElementById('ep-notes').value          = p.notes || '';
  document.getElementById('ep-invoice-rows').innerHTML = '';
  groupEntries.forEach(entry => {
    addEditPayInvoiceRow(entry.invoiceId);
    const rows = document.querySelectorAll('#ep-invoice-rows > div');
    const lastRow = rows[rows.length - 1];
    if (lastRow) {
      const inputs = lastRow.querySelectorAll('input[type=number]');
      const discEntry = p.groupId ? DB.payments.find(px => px.groupId === p.groupId && px.invoiceId === entry.invoiceId && px.method === 'Cash Discount') : null;
      if (inputs[0]) inputs[0].value = discEntry ? discEntry.amount : (entry.cashDisc || 0);
      if (inputs[1]) inputs[1].value = entry.amount || 0;
      const selEl = lastRow.querySelector('select');
      if (selEl) onEditPayInvRowChange(lastRow.id);
    }
  });
  updateEditPayRemaining();
  openModal('modal-edit-payment');
}

async function saveEditPayment() {
  const customerId    = _editPayCustomerId;
  const date          = document.getElementById('ep-date').value;
  const method        = document.getElementById('ep-method').value;
  const ref           = document.getElementById('ep-ref').value.trim();
  const notes         = document.getElementById('ep-notes').value.trim();
  const totalReceived = parseFloat(document.getElementById('ep-total-received').value) || 0;
  if (!customerId)        return toast('Select a customer.', 'error');
  if (!date)              return toast('Date required.', 'error');
  if (totalReceived <= 0) return toast('Enter total amount received.', 'error');
  const rows = document.querySelectorAll('#ep-invoice-rows > div');
  if (!rows.length) return toast('Add at least one invoice row.', 'error');
  const allocations = []; let totalAllocated = 0;
  for (const row of rows) {
    const sel    = row.querySelector('select');
    const inputs = row.querySelectorAll('input[type=number]');
    const invId  = parseInt(sel?.value);
    const disc   = parseFloat(inputs[0]?.value) || 0;
    const adj    = parseFloat(inputs[1]?.value) || 0;
    if (!invId)             { toast('Select an invoice for each row.', 'error'); return; }
    if (adj <= 0 && disc <= 0){ toast('Enter adjust amount or cash discount.', 'error'); return; }
    allocations.push({ invId, disc, adj }); totalAllocated += adj;
  }
  if (Math.abs(totalReceived - totalAllocated) > 0.01) {
    document.getElementById('ep-remaining-warn').style.display = 'block';
    return toast('Total allocated must equal total received.', 'error');
  }
  document.getElementById('ep-remaining-warn').style.display = 'none';
  btnGuard('btn-save-edit-payment');
  const receiptNo = _editPaymentGroupId
    ? DB.payments.find(px => px.groupId === _editPaymentGroupId)?.receiptNo
    : DB.payments.find(px => px.id === window._editPaymentSingleId)?.receiptNo;
  if (_editPaymentGroupId) {
    DB.payments = DB.payments.filter(px => px.groupId !== _editPaymentGroupId);
    if (_db) { try { await _db.from('payments').delete().eq('groupId', _editPaymentGroupId); } catch(e) { console.error(e); } }
  } else {
    const singleId = window._editPaymentSingleId;
    const singleEntry = DB.payments.find(px => px.id === singleId);
    const singleGroupId = singleEntry?.groupId;
    DB.payments = DB.payments.filter(px => px.id !== singleId);
    if (_db && singleId) { try { await (singleGroupId ? _db.from('payments').delete().eq('groupId', singleGroupId) : _db.from('payments').delete().eq('id', singleId)); } catch(e) { console.error(e); } }
  }
  const newGroupId = _editPaymentGroupId || ('grp_' + uniqueId());
  const invNos = [];
  for (const alloc of allocations) {
    const inv = DB.invoices.find(i => i.id === alloc.invId);
    invNos.push(inv?.invNo || '—');
    if (alloc.adj > 0) DB.payments.push({ id: uniqueId(), groupId: newGroupId, customerId, invoiceId: alloc.invId, amount: alloc.adj, date, method, ref, notes, cashDisc: alloc.disc, totalReceived, receiptNo: receiptNo || '' });
    if (alloc.disc > 0 && alloc.adj === 0) DB.payments.push({ id: uniqueId(), groupId: newGroupId, customerId, invoiceId: alloc.invId, amount: alloc.disc, date, method: 'Cash Discount', ref, notes: 'Cash Discount', cashDisc: alloc.disc, totalReceived, receiptNo: receiptNo || '' });
    if (alloc.disc > 0 && alloc.adj > 0)  DB.payments.push({ id: uniqueId(), groupId: newGroupId, customerId, invoiceId: alloc.invId, amount: alloc.disc, date, method: 'Cash Discount', ref, notes: `Cash Discount on ${inv?.invNo}`, cashDisc: alloc.disc, totalReceived, receiptNo: receiptNo || '' });
  }
  try {
    await save('payments');
    await addLog('edit', `Edited payment ${receiptNo || newGroupId} | Invoices: ${invNos.join(', ')}`);
    toast('Payment updated!', 'success');
    closeModal('modal-edit-payment');
    renderPayments(); renderInvoices(); renderDashboard();
  } catch(e) {
    btnGuardReset('btn-save-edit-payment');
    toast('❌ Failed to save payment: ' + e.message, 'error');
  }
}

// ── Group wrappers ───────────────────────────────────────────
function openEditPaymentModalByGroup(paymentId, groupId) {
  if (groupId) { const first = DB.payments.find(px => px.groupId === groupId && px.method !== 'Cash Discount'); if (first) return openEditPaymentModal(first.id); }
  openEditPaymentModal(paymentId);
}

function printPaymentReceiptByGroup(paymentId, groupId) {
  if (groupId) { const first = DB.payments.find(px => px.groupId === groupId); if (first) return printPaymentReceipt(first.id); }
  printPaymentReceipt(paymentId);
}

async function deletePaymentGroup(paymentId, groupId) {
  const rep = groupId ? DB.payments.find(px => px.groupId === groupId && px.method !== 'Cash Discount') : DB.payments.find(px => px.id === paymentId);
  if (!rep) return toast('Payment not found.', 'error');
  const c   = DB.customers.find(c => String(c.id) === String(Math.round(parseFloat(rep.customerId))));
  const inv = DB.invoices.find(i => i.id === rep.invoiceId);
  if (!await confirmDialog({ title: `Delete ${rep.receiptNo || 'Payment'}`, msg: `Customer: ${c?.name || '—'}\nInvoice: ${inv?.invNo || '—'}\nAmount: ₹${fmt(rep.totalReceived || rep.amount)}\nMethod: ${rep.method}\n\nThis will permanently remove the payment and restore the invoice balance.`, type: 'danger', okLabel: 'Delete Payment' })) return;
  const idsToDelete = groupId ? DB.payments.filter(px => px.groupId === groupId).map(px => px.id) : [paymentId];
  if (groupId) DB.payments = DB.payments.filter(px => px.groupId !== groupId);
  else DB.payments = DB.payments.filter(px => px.id !== paymentId);
  if (_db) { try { const { error } = await _db.from('payments').delete().in('id', idsToDelete); if (error) throw new Error(error.message); } catch(e) { toast('❌ Delete failed: ' + e.message, 'error'); return; } }
  await addLog('delete', `Deleted payment ${rep.receiptNo || 'receipt'} ₹${fmt(rep.totalReceived || rep.amount)} for ${c?.name || '—'}`);
  toast('Payment deleted.', 'error');
  renderPayments(); renderInvoices(); renderDashboard();
}

// ── Print Receipt ────────────────────────────────────────────
function printPaymentReceipt(paymentId) {
  const p = DB.payments.find(p => p.id === paymentId);
  if (!p) return;
  const c = DB.customers.find(c => String(c.id) === String(Math.round(parseFloat(p.customerId))));
  const grpPayments = p.groupId ? DB.payments.filter(x => x.groupId === p.groupId && x.method !== 'Cash Discount') : [p];
  const discPayments = p.groupId ? DB.payments.filter(x => x.groupId === p.groupId && x.method === 'Cash Discount') : [];
  const totalPaid = grpPayments.reduce((s,x) => s + parseFloat(x.amount), 0);
  const totalDisc = discPayments.reduce((s,x) => s + parseFloat(x.amount), 0);
  let receiptNo = p.receiptNo;
  if (!receiptNo) {
    receiptNo = getNextReceiptNo(p.date);
    const idx = DB.payments.findIndex(x => x.id === p.id);
    if (idx !== -1) {
      DB.payments[idx].receiptNo = receiptNo;
      if (p.groupId) DB.payments.forEach((x,i) => { if (x.groupId === p.groupId) DB.payments[i].receiptNo = receiptNo; });
      save('payments');
    }
  }
  const invRows = grpPayments.map(x => {
    const inv  = DB.invoices.find(i => i.id === x.invoiceId);
    const disc = discPayments.find(d => d.invoiceId === x.invoiceId);
    return `<tr><td><strong>${inv?.invNo || '—'}</strong></td><td>${fmtDate(inv?.date)}</td><td>₹${fmt(inv?.amount || 0)}</td><td style="color:#16a34a;font-weight:700">₹${fmt(x.amount)}</td><td style="color:#d97706">${disc ? '₹' + fmt(disc.amount) : '—'}</td></tr>`;
  }).join('');
  const html = `
    <div class="header"><div>
      <div class="co-name"><span class="m">MAULI</span> <span class="e">ENTERPRISES</span></div>
      <div class="co-prop">PROP. SOURABH KAREKAR</div>
      <div class="co-sub">${MAULI_LETTERHEAD.address}<br>GSTIN: ${MAULI_LETTERHEAD.gstin} &nbsp;|&nbsp; Ph: ${MAULI_LETTERHEAD.phone} &nbsp;|&nbsp; ${MAULI_LETTERHEAD.email}</div>
    </div><img src="./logo.png" class="logo" onerror="this.style.display='none'"></div>
    <div class="section-title" style="color:#000;font-size:18px;font-weight:700;text-align:center;border-bottom:1px solid #cbd5e1;padding-bottom:8px;margin-bottom:14px">Receipt</div>
    <div class="info-grid">
      <div class="info-box"><label>Receipt No.</label><strong>${receiptNo}</strong></div>
      <div class="info-box"><label>Payment Date</label><strong>${fmtDate(p.date)}</strong></div>
      <div class="info-box"><label>Received From</label><strong>${c?.company || c?.name || '—'}</strong>${c?.company ? `<br><span style="color:#64748b;font-size:11px">${c.name}</span>` : ''}</div>
      <div class="info-box"><label>Payment Method</label><strong>${p.method}</strong>${p.ref ? `<br><span style="color:#64748b;font-size:11px">Ref: ${p.ref}</span>` : ''}</div>
    </div>
    <table><thead><tr><th>Invoice #</th><th>Invoice Date</th><th>Invoice Amt</th><th>Paid Amt</th><th>Cash Disc</th></tr></thead><tbody>${invRows}</tbody></table>
    <div style="background:#f8faff;border:1px solid #e2e8f0;border-radius:8px;padding:14px 18px;display:flex;justify-content:space-between;align-items:center;margin:10px 0">
      <div style="font-size:14px;font-weight:700">Total Received</div>
      <div style="font-size:16px;font-weight:700">₹${fmt(totalPaid)}${totalDisc > 0 ? `&nbsp;&nbsp;<span style="font-size:13px;color:#d97706;font-weight:400">(+₹${fmt(totalDisc)} discount)</span>` : ''}</div>
    </div>
    ${p.notes ? `<div style="margin-top:8px;font-size:12px;color:#64748b">Notes: ${p.notes}</div>` : ''}
    <div class="footer"><div>This is a computer generated receipt. No signature required.<br>Thank you! &nbsp;|&nbsp; MAULI ENTERPRISES</div></div>`;
  buildPrintWindow(html, c?.email || null, c?.phone || null);
  addLog('edit', `Printed Receipt ${receiptNo} for ${c?.name}`);
}

// ── Render & Export ──────────────────────────────────────────
function clearPayDateFilter() {
  const f = document.getElementById('pay-date-from'); if (f) f.value = '';
  const t = document.getElementById('pay-date-to');   if (t) t.value = '';
  renderPayments();
}
function clearPayAmtFilter() {
  const mn = document.getElementById('pay-amt-min'); if (mn) mn.value = '';
  const mx = document.getElementById('pay-amt-max'); if (mx) mx.value = '';
  renderPayments();
}
function onPayMethodChange() {}
function populatePaymentInvoices() {}
function updateBalanceDue() {}

function renderPayments() {
  populateFYFilter('pay-fy-filter', DB.payments.map(p => p.date));
  const selectedFY = document.getElementById('pay-fy-filter')?.value || 'all';
  const search     = document.getElementById('pay-search')?.value.toLowerCase() || '';
  const custF      = document.getElementById('pay-cust-filter')?.value || '';
  const methodF    = document.getElementById('pay-method-filter')?.value || '';
  const dateFrom   = document.getElementById('pay-date-from')?.value || '';
  const dateTo     = document.getElementById('pay-date-to')?.value || '';
  const amtMin     = parseFloat(document.getElementById('pay-amt-min')?.value) || null;
  const amtMax     = parseFloat(document.getElementById('pay-amt-max')?.value) || null;
  const tbody      = document.getElementById('pay-table');
  if (!tbody) return;

  const grouped = {}, singles = [];
  DB.payments.forEach(p => { if (p.groupId) { if (!grouped[p.groupId]) grouped[p.groupId]=[]; grouped[p.groupId].push(p); } else singles.push(p); });
  let list = [];
  Object.values(grouped).forEach(grp => {
    const primaryEntry = grp.find(p => p.method !== 'Cash Discount') || grp[0];
    const first = grp[0];
    const totalAmt  = grp.filter(p => p.method !== 'Cash Discount').reduce((s,p) => s+parseFloat(p.amount),0);
    const totalDisc = grp.filter(p => p.method === 'Cash Discount').reduce((s,p) => s+parseFloat(p.amount),0);
    const invNos = [...new Set(grp.map(p => DB.invoices.find(i=>i.id===p.invoiceId)?.invNo).filter(Boolean))];
    list.push({ _isGroup:true, _groupId:first.groupId, _firstId:primaryEntry.id, customerId:first.customerId, date:first.date, method:primaryEntry.method, ref:primaryEntry.ref, notes:primaryEntry.notes, receiptNo:first.receiptNo||'', amount:first.totalReceived||totalAmt, cashDisc:totalDisc, invNos });
  });
  singles.forEach(p => { const inv=DB.invoices.find(i=>i.id===p.invoiceId); list.push({...p,_isGroup:false,invNos:[inv?.invNo||'—']}); });

  list = list.filter(p => {
    if (selectedFY !== 'all') { try { if (getFYTag(p.date)!==selectedFY) return false; } catch { return false; } }
    const c = DB.customers.find(c => String(c.id) === String(Math.round(parseFloat(p.customerId))));
    if (![c?.name,p.invNos?.join(' '),p.method,p.ref,p.notes].join(' ').toLowerCase().includes(search)) return false;
    if (custF && String(Math.round(parseFloat(p.customerId))) !== custF && String(p.customerId) !== custF) return false;
    if (methodF && p.method !== methodF) return false;
    if (dateFrom && p.date < dateFrom) return false;
    if (dateTo   && p.date > dateTo)   return false;
    const pAmt = parseFloat(p.amount);
    if (amtMin !== null && pAmt < amtMin) return false;
    if (amtMax !== null && pAmt > amtMax) return false;
    return true;
  }).sort((a,b) => new Date(b.date) - new Date(a.date));

  if (!list.length) { tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state"><div class="icon">💳</div><p>No payments found.</p></div></td></tr>`; return; }

  const methodStyle = { 'Cancelled':'color:var(--danger)', 'Cash Discount':'color:var(--warning)' };
  tbody.innerHTML = list.map(p => {
    const c = DB.customers.find(c => String(c.id) === String(Math.round(parseFloat(p.customerId))));
    const mStyle = methodStyle[p.method] || 'color:var(--success)';
    const invDisplay = p.invNos && p.invNos.length > 1
      ? `<span title="${p.invNos.join(', ')}">${p.invNos[0]} <span style="color:var(--accent);font-size:0.72rem">+${p.invNos.length - 1} more</span></span>`
      : (p.invNos?.[0] || '—');
    const discBadge = p.cashDisc > 0 ? `<br><span style="font-size:0.7rem;color:var(--warning)">Disc: ₹${fmt(p.cashDisc)}</span>` : '';
    const reviseId  = p._isGroup ? p._firstId : p.id;
    const groupIdStr = p._isGroup ? `'${p._groupId}'` : 'null';
    return `<tr>
      <td>${fmtDate(p.date)}</td>
      <td>${c?.name || '—'}</td>
      <td>${invDisplay}</td>
      <td><span style="font-size:0.78rem;font-weight:600;color:var(--accent)">${p.receiptNo || '—'}</span></td>
      <td style="${mStyle}">₹${fmt(p.amount)}${discBadge}</td>
      <td><span style="font-size:0.8rem;font-weight:600;${p.method==='Cancelled'?'color:var(--danger)':p.method==='Cash Discount'?'color:var(--warning)':''}">${p.method}</span></td>
      <td>${p.ref || '—'}</td>
      <td style="color:var(--muted);font-size:0.82rem">${p.notes || '—'}</td>
      <td><div class="action-btns">
        <button class="btn btn-outline btn-xs" onclick="openEditPaymentModalByGroup(${reviseId}, ${groupIdStr})">✏️ Edit</button>
        <button class="btn btn-outline btn-xs" onclick="openRevisePaymentModal(${reviseId})">↩️ Reverse</button>
        <button class="btn btn-outline btn-xs" onclick="printPaymentReceiptByGroup(${reviseId}, ${groupIdStr})">🧾 PDF</button>
        <button class="btn btn-danger btn-xs" onclick="deletePaymentGroup(${reviseId}, ${groupIdStr})">🗑</button>
      </div></td>
    </tr>`;
  }).join('');
}

function exportPayments() {
  const grouped = {}, singles = [];
  DB.payments.forEach(p => { if (p.groupId) { if (!grouped[p.groupId]) grouped[p.groupId]=[]; grouped[p.groupId].push(p); } else singles.push(p); });
  let list = [];
  Object.values(grouped).forEach(grp => {
    const primaryEntry = grp.find(p => p.method !== 'Cash Discount') || grp[0];
    const first = grp[0];
    const totalAmt  = grp.filter(p => p.method !== 'Cash Discount').reduce((s,p) => s+parseFloat(p.amount),0);
    const totalDisc = grp.filter(p => p.method === 'Cash Discount').reduce((s,p) => s+parseFloat(p.amount),0);
    const invNos = [...new Set(grp.map(p => DB.invoices.find(i=>i.id===p.invoiceId)?.invNo).filter(Boolean))];
    list.push({ _isGroup:true, _grp:grp, customerId:first.customerId, date:first.date, method:primaryEntry.method, ref:primaryEntry.ref, notes:primaryEntry.notes, receiptNo:first.receiptNo||'', amount:first.totalReceived||totalAmt, cashDisc:totalDisc, invNos });
  });
  singles.forEach(p => { const inv=DB.invoices.find(i=>i.id===p.invoiceId); list.push({...p,_isGroup:false,invNos:[inv?.invNo||'—']}); });
  if (!list.length) return toast('No payments to export.','error');
  const data = [];
  for (const p of list) {
    if (p._isGroup && p._grp) {
      p._grp.filter(e => e.method !== 'Cash Discount').forEach(e => {
        const c   = DB.customers.find(c => c.id === e.customerId);
        const inv = DB.invoices.find(i => i.id === e.invoiceId);
        data.push({ 'Receipt No *': e.receiptNo||'', 'Customer *': c?.name||'', 'Amount *': e.totalReceived||p.amount, 'Payment Date *': fmtDateExport(e.date), 'Mode of Payment *': e.method, 'Invoice No *': inv?.invNo||'', 'Cash Disc': e.cashDisc||0, 'Adjust Amt': e.amount, 'Reference/UTR': e.ref||'', 'Notes': e.notes||'' });
      });
    } else {
      const c   = DB.customers.find(c => c.id === p.customerId);
      const inv = DB.invoices.find(i => i.id === p.invoiceId);
      data.push({ 'Receipt No *': p.receiptNo||'', 'Customer *': c?.name||'', 'Amount *': p.totalReceived||p.amount, 'Payment Date *': fmtDateExport(p.date), 'Mode of Payment *': p.method, 'Invoice No *': inv?.invNo||'', 'Cash Disc': p.cashDisc||0, 'Adjust Amt': p.amount, 'Reference/UTR': p.ref||'', 'Notes': p.notes||'' });
    }
  }
  exportStyledXLSX(data, 'Payments_MauliEnt', 'Payments');
}