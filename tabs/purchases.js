// ============================================================
// tabs/purchases.js — Purchases, PurchPayments, DebitNotes
// ============================================================

// ── Purchase Paid Amount ─────────────────────────────────────
function getPurchasePaidAmount(purchaseId) {
  const idStr = String(purchaseId);
  const paid  = (DB.purchpayments||[]).filter(pp => String(pp.purchaseId) === idStr && pp.mode !== 'Cancelled').reduce((s,pp) => s + parseFloat(pp.amount||0), 0);
  const dn    = (DB.debitNotes||[]).filter(dn  => String(dn.purchaseId)  === idStr).reduce((s,dn) => s + parseFloat(dn.amount||0), 0);
  return paid + dn;
}

function getPurchaseStatus(pur) {
  const paid   = getPurchasePaidAmount(pur.id);
  const amount = parseFloat(pur.amount);
  const today  = new Date(); today.setHours(0,0,0,0);
  const due    = parseLocalDate(pur.dueDate || pur.billDate);
  if (paid >= amount)  return 'paid';
  if (due < today)     return 'overdue';
  if (paid > 0)        return 'partial';
  return 'pending';
}

// ── Purchases ────────────────────────────────────────────────
function checkPurDup() {
  const val   = document.getElementById('pur-billno')?.value.trim();
  const dealId = parseInt(document.getElementById('pur-dealer-id')?.value);
  const isDup = val && DB.purchases.some(p => String(p.billNo) === val && p.id !== editingPurchaseId);
  document.getElementById('pur-dup-warning').style.display = isDup ? 'block' : 'none';
}

function openPurchaseModal(id = null) {
  editingPurchaseId = id;
  const p = id ? DB.purchases.find(p => p.id === id) : null;
  document.getElementById('purchase-modal-title').textContent = id ? 'Edit Purchase' : 'New Purchase';
  document.getElementById('pur-billno').value   = p?.billNo  || '';
  document.getElementById('pur-date').value     = p?.date    || today();
  document.getElementById('pur-duedate').value  = p?.dueDate || '';
  document.getElementById('pur-amount').value   = p?.amount  || '';
  document.getElementById('pur-desc').value     = p?.description || '';
  document.getElementById('pur-dup-warning').style.display = 'none';
  const sorted = [...DB.dealers].sort((a,b) => a.name.localeCompare(b.name,'en-IN'));
  const sel = document.getElementById('pur-dealer-id');
  sel.innerHTML = '<option value="">-- Select Dealer --</option>' +
    sorted.map(d => `<option value="${d.id}" ${d.id === p?.dealerId ? 'selected' : ''}>${d.name}</option>`).join('');
  openModal('modal-purchase');
}

async function savePurchase() {
  const dealerId  = parseInt(document.getElementById('pur-dealer-id').value);
  const billNo    = document.getElementById('pur-billno').value.trim();
  const date      = document.getElementById('pur-date').value;
  const dueDate   = document.getElementById('pur-duedate').value;
  const amount    = parseFloat(document.getElementById('pur-amount').value);
  const desc      = document.getElementById('pur-desc').value.trim();
  if (!dealerId)              return toast('Select a dealer.', 'error');
  if (!billNo)                return toast('Bill number required.', 'error');
  if (!date)                  return toast('Bill date required.', 'error');
  if (isNaN(amount)||amount<=0) return toast('Valid amount required.', 'error');
  if (DB.purchases.some(p => String(p.billNo) === billNo && p.id !== editingPurchaseId))
    return toast('Duplicate bill number!', 'error');
  btnGuard('btn-save-purchase');
  const data = { dealerId, billNo, date, dueDate: dueDate || date, amount, description: desc };
  if (editingPurchaseId) {
    const idx = DB.purchases.findIndex(p => p.id === editingPurchaseId);
    DB.purchases[idx] = { ...DB.purchases[idx], ...data };
    await addLog('edit', `Edited purchase ${billNo} ₹${fmt(amount)}`);
    toast('Purchase updated!', 'success');
  } else {
    data.id = uniqueId();
    DB.purchases.push(data);
    await addLog('create', `Added purchase ${billNo} ₹${fmt(amount)}`);
    toast('Purchase saved!', 'success');
  }
  try {
    await save('purchases');
    closeModal('modal-purchase');
    renderPurchases();
    renderDashboard();
  } catch(e) {
    btnGuardReset('btn-save-purchase');
    toast('❌ Failed to save: ' + e.message, 'error');
  }
}

async function deletePurchase(id) {
  const p = DB.purchases.find(p => p.id === id);
  if (!await confirmDialog({ title:'Delete Purchase', msg:`Delete bill ${p?.billNo}?\n\nAll associated payments and debit notes will also be removed.`, type:'danger', okLabel:'Delete Purchase' })) return;
  DB.purchpayments = (DB.purchpayments||[]).filter(pp => pp.purchaseId !== id);
  DB.debitNotes    = (DB.debitNotes||[]).filter(dn => dn.purchaseId !== id);
  await deleteDoc('purchases', id);
  DB.purchases = DB.purchases.filter(p => p.id !== id);
  await save('purchpayments'); await save('debitNotes');
  await addLog('delete', `Deleted purchase ${p?.billNo}`);
  toast('Purchase deleted.', 'error');
  renderPurchases(); renderDashboard();
}

function clearPurDateFilter() {
  const f = document.getElementById('pur-date-from'); if (f) f.value='';
  const t = document.getElementById('pur-date-to');   if (t) t.value='';
  renderPurchases();
}

function renderPurchases() {
  if (!DB.purchases) DB.purchases = [];
  populateFYFilter('pur-fy-filter', DB.purchases.map(p => p.date));
  const selectedFY = document.getElementById('pur-fy-filter')?.value || 'all';
  const search     = document.getElementById('pur-search')?.value.toLowerCase() || '';
  const dealerF    = document.getElementById('pur-dealer-filter')?.value || '';
  const statusF    = document.getElementById('pur-status-filter')?.value || '';
  const dateFrom   = document.getElementById('pur-date-from')?.value || '';
  const dateTo     = document.getElementById('pur-date-to')?.value || '';
  const tbody      = document.getElementById('pur-table');
  if (!tbody) return;

  // Also update dealer filter dropdown with current dealers
  const purDealerFilter = document.getElementById('pur-dealer-filter');
  if (purDealerFilter && purDealerFilter.options.length <= 1) updatePurDealerDropdowns();

  let list = DB.purchases.filter(p => {
    if (selectedFY !== 'all') { try { if (getFYTag(p.date) !== selectedFY) return false; } catch { return false; } }
    const d = DB.dealers.find(d => d.id === Math.round(parseFloat(p.dealerId)));
    if (![p.billNo, d?.name, p.description].join(' ').toLowerCase().includes(search)) return false;
    if (dealerF && String(Math.round(parseFloat(p.dealerId))) !== dealerF) return false;
    if (statusF && getPurchaseStatus(p) !== statusF) return false;
    if (dateFrom && p.date < dateFrom) return false;
    if (dateTo   && p.date > dateTo)   return false;
    return true;
  }).sort((a,b) => new Date(b.date) - new Date(a.date));

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state"><div class="icon">🛒</div><p>No purchases found.</p></div></td></tr>`;
    return;
  }
  const statusMap = { paid:'badge-paid', pending:'badge-pending', partial:'badge-partial', overdue:'badge-overdue' };
  tbody.innerHTML = list.map(p => {
    const d      = DB.dealers.find(d => d.id === Math.round(parseFloat(p.dealerId)));
    const paid   = getPurchasePaidAmount(p.id);
    const bal    = parseFloat(p.amount) - paid;
    const status = getPurchaseStatus(p);
    return `<tr>
      <td><strong>${p.billNo}</strong></td>
      <td>${d?.name||'—'}</td>
      <td>${fmtDate(p.date)}</td>
      <td>${fmtDate(p.dueDate)}</td>
      <td>₹${fmt(p.amount)}</td>
      <td style="color:var(--success)">₹${fmt(paid)}</td>
      <td style="color:${bal>0?'var(--danger)':'var(--success)'}">₹${fmt(bal)}</td>
      <td><span class="badge ${statusMap[status]}">${status}</span></td>
      <td><div class="action-btns">
        <button class="btn btn-outline btn-xs" onclick="openPurchaseModal(${p.id})">✏️ Edit</button>
        <button class="btn btn-primary btn-xs" onclick="openPurchPaymentModalForBill(${p.id})">💰 Pay</button>
        <button class="btn btn-danger btn-xs" onclick="deletePurchase(${p.id})">🗑</button>
      </div></td>
    </tr>`;
  }).join('');
}

function exportPurchases() {
  if (!DB.purchases.length) return toast('No purchases to export.','error');
  const data = DB.purchases.map(p => {
    const d = DB.dealers.find(d => d.id === Math.round(parseFloat(p.dealerId)));
    return { 'DealerName *': d?.name||'', 'BillNo *': p.billNo, 'BillDate *': fmtDateExport(p.date), 'DueDate': fmtDateExport(p.dueDate), 'Amount *': parseFloat(p.amount), 'Description': p.description||'' };
  });
  exportStyledXLSX(data, 'Purchases_MauliEnt', 'Purchases');
}

// ── Purchase Payments ────────────────────────────────────────
function updatePurchPayDealerDropdowns() {
  const sorted = [...DB.dealers].sort((a,b) => a.name.localeCompare(b.name,'en-IN'));
  const modalOpts = '<option value="">-- Select Dealer --</option>' + sorted.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
  const ppModal = document.getElementById('pp-dealer-id');
  if (ppModal) ppModal.innerHTML = modalOpts;
  const filterOpts = '<option value="">All Dealers</option>' + sorted.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
  const ppFilter = document.getElementById('pp-dealer-filter');
  if (ppFilter) ppFilter.innerHTML = filterOpts;
}

function updatePurBillDropdown(forceDealer, forceBill) {
  const dealerId = forceDealer || parseInt(document.getElementById('pp-dealer-id')?.value);
  const sel      = document.getElementById('pp-bill-id');
  if (!sel) return;
  if (!dealerId) { sel.innerHTML = '<option value="">-- Select Bill --</option>'; return; }
  const bills = DB.purchases.filter(p => Math.round(parseFloat(p.dealerId)) === dealerId)
    .sort((a,b) => new Date(b.date) - new Date(a.date));
  sel.innerHTML = '<option value="">-- Select Bill --</option>' +
    bills.map(p => {
      const bal = parseFloat(p.amount) - getPurchasePaidAmount(p.id);
      const status = getPurchaseStatus(p);
      return `<option value="${p.id}" ${forceBill && p.id === forceBill ? 'selected' : ''}>${p.billNo} — ₹${fmt(p.amount)} (bal ₹${fmt(bal)}) [${status}]</option>`;
    }).join('');
  if (forceBill) sel.value = String(forceBill);
}

function openPurchPaymentModal() {
  editingPurchPayId = null;
  document.getElementById('purchpay-modal-title').textContent = 'Record Purchase Payment';
  document.getElementById('pp-amount').value   = '';
  document.getElementById('pp-date').value     = today();
  document.getElementById('pp-mode').value     = 'Cash';
  document.getElementById('pp-receiptno').value= '';
  document.getElementById('pp-ref').value      = '';
  document.getElementById('pp-notes').value    = '';
  updatePurchPayDealerDropdowns();
  document.getElementById('pp-dealer-id').value = '';
  document.getElementById('pp-bill-id').innerHTML = '<option value="">-- Select Bill --</option>';
  openModal('modal-purchpayment');
}

function openPurchPaymentModalForBill(purchaseId) {
  const pur = DB.purchases.find(p => p.id === purchaseId);
  if (!pur) return;
  editingPurchPayId = null;
  document.getElementById('purchpay-modal-title').textContent = 'Record Purchase Payment';
  document.getElementById('pp-amount').value   = '';
  document.getElementById('pp-date').value     = today();
  document.getElementById('pp-mode').value     = 'Cash';
  document.getElementById('pp-receiptno').value= '';
  document.getElementById('pp-ref').value      = '';
  document.getElementById('pp-notes').value    = '';
  updatePurchPayDealerDropdowns();
  setTimeout(() => {
    const dealerSel = document.getElementById('pp-dealer-id');
    if (dealerSel) dealerSel.value = String(Math.round(parseFloat(pur.dealerId)));
    updatePurBillDropdown(Math.round(parseFloat(pur.dealerId)), purchaseId);
  }, 50);
  openModal('modal-purchpayment');
}

async function savePurchPayment() {
  const dealerId   = parseInt(document.getElementById('pp-dealer-id').value);
  const purchaseId = parseInt(document.getElementById('pp-bill-id').value);
  const amount     = parseFloat(document.getElementById('pp-amount').value);
  const date       = document.getElementById('pp-date').value;
  const mode       = document.getElementById('pp-mode').value;
  const receiptNo  = document.getElementById('pp-receiptno').value.trim();
  const ref        = document.getElementById('pp-ref').value.trim();
  const notes      = document.getElementById('pp-notes').value.trim();
  if (!dealerId)              return toast('Select a dealer.', 'error');
  if (!purchaseId)            return toast('Select a bill.', 'error');
  if (!date)                  return toast('Date required.', 'error');
  if (isNaN(amount)||amount<=0) return toast('Valid amount required.', 'error');
  btnGuard('btn-save-purchpayment');
  const data = { dealerId, purchaseId, amount, date, mode, receiptNo: receiptNo || 'PRP-' + Date.now(), ref, notes };
  if (editingPurchPayId) {
    const idx = DB.purchpayments.findIndex(pp => pp.id === editingPurchPayId);
    DB.purchpayments[idx] = { ...DB.purchpayments[idx], ...data };
    await addLog('edit', `Edited purchase payment ₹${fmt(amount)} [${mode}]`);
    toast('Payment updated!', 'success');
  } else {
    data.id = uniqueId();
    if (!DB.purchpayments) DB.purchpayments = [];
    DB.purchpayments.push(data);
    const d = DB.dealers.find(d => d.id === dealerId);
    const p = DB.purchases.find(p => p.id === purchaseId);
    await addLog('create', `Purchase payment ₹${fmt(amount)} [${mode}] for bill ${p?.billNo} (${d?.name})`);
    toast('Payment recorded!', 'success');
  }
  try {
    await save('purchpayments');
    closeModal('modal-purchpayment');
    renderPurchPayments(); renderPurchases(); renderDashboard();
  } catch(e) {
    btnGuardReset('btn-save-purchpayment');
    toast('❌ Failed to save: ' + e.message, 'error');
  }
}

async function deletePurchPayment(id) {
  const pp = (DB.purchpayments||[]).find(p => p.id === id);
  if (!await confirmDialog({ title:'Delete Payment', msg:`Delete payment of ₹${fmt(pp?.amount)} via ${pp?.mode}?`, type:'danger', okLabel:'Delete Payment' })) return;
  await deleteDoc('purchpayments', id);
  DB.purchpayments = (DB.purchpayments||[]).filter(p => p.id !== id);
  await addLog('delete', `Deleted purchase payment ₹${fmt(pp?.amount)}`);
  toast('Payment deleted.', 'error');
  renderPurchPayments(); renderPurchases();
}

function clearPPDateFilter() {
  const f = document.getElementById('pp-date-from'); if (f) f.value='';
  const t = document.getElementById('pp-date-to');   if (t) t.value='';
  renderPurchPayments();
}

function renderPurchPayments() {
  if (!DB.purchpayments) DB.purchpayments = [];
  populateFYFilter('pp-fy-filter', DB.purchpayments.map(pp => pp.date));
  const selectedFY = document.getElementById('pp-fy-filter')?.value || 'all';
  const search     = document.getElementById('pp-search')?.value.toLowerCase() || '';
  const dealerF    = document.getElementById('pp-dealer-filter')?.value || '';
  const methodF    = document.getElementById('pp-method-filter')?.value || '';
  const dateFrom   = document.getElementById('pp-date-from')?.value || '';
  const dateTo     = document.getElementById('pp-date-to')?.value || '';
  const tbody      = document.getElementById('pp-table');
  if (!tbody) return;

  let list = DB.purchpayments.filter(pp => {
    if (selectedFY !== 'all') { try { if (getFYTag(pp.date) !== selectedFY) return false; } catch { return false; } }
    const d   = DB.dealers.find(d => d.id === Math.round(parseFloat(pp.dealerId)));
    const pur = DB.purchases.find(p => p.id === Math.round(parseFloat(pp.purchaseId)));
    if (![d?.name, pur?.billNo, pp.mode, pp.ref, pp.notes, pp.receiptNo].join(' ').toLowerCase().includes(search)) return false;
    if (dealerF && String(Math.round(parseFloat(pp.dealerId))) !== dealerF) return false;
    if (methodF && pp.mode !== methodF) return false;
    if (dateFrom && pp.date < dateFrom) return false;
    if (dateTo   && pp.date > dateTo)   return false;
    return true;
  }).sort((a,b) => new Date(b.date) - new Date(a.date));

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state"><div class="icon">💰</div><p>No purchase payments found.</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = list.map(pp => {
    const d   = DB.dealers.find(d => d.id === Math.round(parseFloat(pp.dealerId)));
    const pur = DB.purchases.find(p => p.id === Math.round(parseFloat(pp.purchaseId)));
    return `<tr>
      <td>${fmtDate(pp.date)}</td>
      <td>${d?.name||'—'}</td>
      <td>${pur?.billNo||'—'}</td>
      <td><span style="font-size:0.78rem;font-weight:600;color:var(--accent)">${pp.receiptNo||'—'}</span></td>
      <td style="color:var(--success);font-weight:600">₹${fmt(pp.amount)}</td>
      <td>${pp.mode}</td>
      <td style="color:var(--muted)">${pp.ref||'—'}</td>
      <td style="color:var(--muted);font-size:0.82rem">${pp.notes||'—'}</td>
      <td><div class="action-btns">
        <button class="btn btn-outline btn-xs" onclick="openEditPurchPayModal(${pp.id})">✏️ Edit</button>
        <button class="btn btn-danger btn-xs" onclick="deletePurchPayment(${pp.id})">🗑</button>
      </div></td>
    </tr>`;
  }).join('');
}

function openEditPurchPayModal(id) {
  const pp = (DB.purchpayments||[]).find(p => p.id === id);
  if (!pp) return;
  editingPurchPayId = id;
  document.getElementById('purchpay-modal-title').textContent = 'Edit Purchase Payment';
  document.getElementById('pp-amount').value    = pp.amount  || '';
  document.getElementById('pp-date').value      = pp.date    || today();
  document.getElementById('pp-mode').value      = pp.mode    || 'Cash';
  document.getElementById('pp-receiptno').value = pp.receiptNo || '';
  document.getElementById('pp-ref').value       = pp.ref     || '';
  document.getElementById('pp-notes').value     = pp.notes   || '';
  updatePurchPayDealerDropdowns();
  setTimeout(() => {
    const dealerSel = document.getElementById('pp-dealer-id');
    if (dealerSel) dealerSel.value = String(Math.round(parseFloat(pp.dealerId)));
    updatePurBillDropdown(Math.round(parseFloat(pp.dealerId)), Math.round(parseFloat(pp.purchaseId)));
  }, 50);
  openModal('modal-purchpayment');
}

function exportPurchPayments() {
  if (!DB.purchpayments?.length) return toast('No purchase payments to export.','error');
  const data = DB.purchpayments.map(pp => {
    const d   = DB.dealers.find(d => d.id === Math.round(parseFloat(pp.dealerId)));
    const pur = DB.purchases.find(p => p.id === Math.round(parseFloat(pp.purchaseId)));
    return { 'Receipt No *': pp.receiptNo||'', 'Dealer *': d?.name||'', 'Amount *': parseFloat(pp.amount), 'Payment Date *': fmtDateExport(pp.date), 'Mode *': pp.mode, 'Bill No *': pur?.billNo||'', 'Reference/UTR': pp.ref||'', 'Notes': pp.notes||'' };
  });
  exportStyledXLSX(data, 'PurchasePayments_MauliEnt', 'Purchase Payments');
}

// ── Debit Notes ──────────────────────────────────────────────
function updateDNDealerDropdowns() {
  const sorted = [...DB.dealers].sort((a,b) => a.name.localeCompare(b.name,'en-IN'));
  const modalOpts = '<option value="">-- Select Dealer --</option>' + sorted.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
  const dnModal = document.getElementById('dn-dealer-id');
  if (dnModal) dnModal.innerHTML = modalOpts;
  const filterOpts = '<option value="">All Dealers</option>' + sorted.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
  const dnFilter = document.getElementById('dn-dealer-filter');
  if (dnFilter) dnFilter.innerHTML = filterOpts;
}

function updateDNBillDropdown(forceDealer, forceBill) {
  const dealerId = forceDealer || parseInt(document.getElementById('dn-dealer-id')?.value);
  const sel      = document.getElementById('dn-bill-id');
  if (!sel) return;
  const bills = DB.purchases.filter(p => Math.round(parseFloat(p.dealerId)) === dealerId)
    .sort((a,b) => new Date(b.date) - new Date(a.date));
  sel.innerHTML = '<option value="">-- Select Bill (optional) --</option>' +
    bills.map(p => `<option value="${p.id}" ${forceBill && p.id === forceBill ? 'selected' : ''}>${p.billNo} — ₹${fmt(p.amount)}</option>`).join('');
  if (forceBill) sel.value = String(forceBill);
}

function openDebitNoteModal(id = null) {
  editingDNId = id;
  const dn = id ? (DB.debitNotes||[]).find(d => d.id === id) : null;
  document.getElementById('dn-modal-title').textContent = id ? 'Edit Debit Note' : 'New Debit Note';
  document.getElementById('dn-number').value = dn?.dnNumber || '';
  document.getElementById('dn-date').value   = dn?.date     || today();
  document.getElementById('dn-amount').value = dn?.amount   || '';
  document.getElementById('dn-reason').value = dn?.reason   || 'Return';
  document.getElementById('dn-notes').value  = dn?.notes    || '';
  updateDNDealerDropdowns();
  if (dn?.dealerId) {
    setTimeout(() => {
      const sel = document.getElementById('dn-dealer-id');
      if (sel) sel.value = String(Math.round(parseFloat(dn.dealerId)));
      updateDNBillDropdown(Math.round(parseFloat(dn.dealerId)), dn?.purchaseId ? Math.round(parseFloat(dn.purchaseId)) : null);
    }, 50);
  }
  openModal('modal-debitnote');
}

async function saveDebitNote() {
  const dealerId   = parseInt(document.getElementById('dn-dealer-id').value);
  const purchaseId = parseInt(document.getElementById('dn-bill-id').value) || null;
  const dnNumber   = document.getElementById('dn-number').value.trim();
  const date       = document.getElementById('dn-date').value;
  const amount     = parseFloat(document.getElementById('dn-amount').value);
  const reason     = document.getElementById('dn-reason').value;
  const notes      = document.getElementById('dn-notes').value.trim();
  if (!dealerId)              return toast('Select a dealer.', 'error');
  if (!dnNumber)              return toast('Debit Note number required.', 'error');
  if (!date)                  return toast('Date required.', 'error');
  if (isNaN(amount)||amount<=0) return toast('Valid amount required.', 'error');
  btnGuard('btn-save-debitnote');
  if (!DB.debitNotes) DB.debitNotes = [];
  const data = { dealerId, purchaseId, dnNumber, date, amount, reason, notes };
  if (editingDNId) {
    const idx = DB.debitNotes.findIndex(d => d.id === editingDNId);
    DB.debitNotes[idx] = { ...DB.debitNotes[idx], ...data };
    await addLog('edit', `Edited Debit Note ${dnNumber} ₹${fmt(amount)}`);
    toast('Debit Note updated!', 'success');
  } else {
    data.id = uniqueId();
    DB.debitNotes.push(data);
    const d = DB.dealers.find(d => d.id === dealerId);
    await addLog('create', `Created Debit Note ${dnNumber} ₹${fmt(amount)} (${d?.name})`);
    toast('Debit Note saved!', 'success');
  }
  try {
    await save('debitNotes');
    closeModal('modal-debitnote');
    renderDebitNotes(); renderPurchases();
  } catch(e) {
    btnGuardReset('btn-save-debitnote');
    toast('❌ Failed to save: ' + e.message, 'error');
  }
}

async function deleteDebitNote(id) {
  const dn = (DB.debitNotes||[]).find(d => d.id === id);
  if (!await confirmDialog({ title:'Delete Debit Note', msg:`Delete DN ${dn?.dnNumber} — ₹${fmt(dn?.amount)}?`, type:'danger', okLabel:'Delete' })) return;
  await deleteDoc('debitNotes', id);
  DB.debitNotes = (DB.debitNotes||[]).filter(d => d.id !== id);
  await addLog('delete', `Deleted Debit Note ${dn?.dnNumber}`);
  toast('Debit Note deleted.', 'error');
  renderDebitNotes(); renderPurchases();
}

function clearDNDateFilter() {
  const f = document.getElementById('dn-date-from'); if (f) f.value='';
  const t = document.getElementById('dn-date-to');   if (t) t.value='';
  renderDebitNotes();
}

function renderDebitNotes() {
  if (!DB.debitNotes) DB.debitNotes = [];
  populateFYFilter('dn-fy-filter', DB.debitNotes.map(dn => dn.date));
  const selectedFY = document.getElementById('dn-fy-filter')?.value || 'all';
  const search     = document.getElementById('dn-search')?.value.toLowerCase() || '';
  const dealerF    = document.getElementById('dn-dealer-filter')?.value || '';
  const reasonF    = document.getElementById('dn-reason-filter')?.value || '';
  const dateFrom   = document.getElementById('dn-date-from')?.value || '';
  const dateTo     = document.getElementById('dn-date-to')?.value || '';
  const tbody      = document.getElementById('dn-table');
  if (!tbody) return;

  let list = DB.debitNotes.filter(dn => {
    if (selectedFY !== 'all') { try { if (getFYTag(dn.date) !== selectedFY) return false; } catch { return false; } }
    const d   = DB.dealers.find(d => d.id === Math.round(parseFloat(dn.dealerId)));
    const pur = DB.purchases.find(p => p.id === Math.round(parseFloat(dn.purchaseId)));
    if (![dn.dnNumber, d?.name, pur?.billNo, dn.reason, dn.notes].join(' ').toLowerCase().includes(search)) return false;
    if (dealerF && String(Math.round(parseFloat(dn.dealerId))) !== dealerF) return false;
    if (reasonF && dn.reason !== reasonF) return false;
    if (dateFrom && dn.date < dateFrom) return false;
    if (dateTo   && dn.date > dateTo)   return false;
    return true;
  }).sort((a,b) => new Date(b.date) - new Date(a.date));

  const total = list.reduce((s, dn) => s + parseFloat(dn.amount||0), 0);
  const countEl = document.getElementById('dn-stat-count');
  const totalEl = document.getElementById('dn-stat-total');
  if (countEl) countEl.textContent = list.length;
  if (totalEl) totalEl.textContent = '₹' + fmt(total);

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="icon">📋</div><p>No debit notes found.</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = list.map(dn => {
    const d   = DB.dealers.find(d => d.id === Math.round(parseFloat(dn.dealerId)));
    const pur = DB.purchases.find(p => p.id === Math.round(parseFloat(dn.purchaseId)));
    return `<tr>
      <td><strong>${dn.dnNumber}</strong></td>
      <td>${fmtDate(dn.date)}</td>
      <td>${d?.name||'—'}</td>
      <td>${pur?.billNo||'—'}</td>
      <td style="color:var(--danger);font-weight:600">₹${fmt(dn.amount)}</td>
      <td><span class="badge badge-partial">${dn.reason}</span></td>
      <td style="color:var(--muted);font-size:0.82rem">${dn.notes||'—'}</td>
      <td><div class="action-btns">
        <button class="btn btn-outline btn-xs" onclick="openDebitNoteModal(${dn.id})">✏️ Edit</button>
        <button class="btn btn-danger btn-xs" onclick="deleteDebitNote(${dn.id})">🗑</button>
      </div></td>
    </tr>`;
  }).join('');
}

function exportDebitNotes() {
  if (!DB.debitNotes?.length) return toast('No debit notes to export.','error');
  const data = DB.debitNotes.map(dn => {
    const d   = DB.dealers.find(d => d.id === Math.round(parseFloat(dn.dealerId)));
    const pur = DB.purchases.find(p => p.id === Math.round(parseFloat(dn.purchaseId)));
    return { 'DN No *': dn.dnNumber, 'Dealer *': d?.name||'', 'Bill No': pur?.billNo||'', 'Date *': fmtDateExport(dn.date), 'Amount *': parseFloat(dn.amount), 'Reason *': dn.reason, 'Notes': dn.notes||'' };
  });
  exportStyledXLSX(data, 'DebitNotes_MauliEnt', 'Debit Notes');
}
