// ============================================================
// tabs/creditnotes.js — Credit Note CRUD, render, export
// ============================================================

function openCNModal(id = null) {
  editingCNId = id;
  const cn = id ? (DB.creditNotes||[]).find(c => c.id === id) : null;
  document.getElementById('cn-modal-title').textContent = id ? 'Edit Credit Note' : 'New Credit Note';
  document.getElementById('cn-number').value = cn?.cnNumber || '';
  document.getElementById('cn-date').value   = cn?.date     || today();
  document.getElementById('cn-amount').value = cn?.amount   || '';
  document.getElementById('cn-reason').value = cn?.reason   || 'Return';
  document.getElementById('cn-notes').value  = cn?.notes    || '';
  const sorted = [...DB.customers].sort((a,b) => a.name.localeCompare(b.name,'en-IN'));
  const cnCustSel = document.getElementById('cn-customer');
  cnCustSel.innerHTML = '<option value="">-- Select Customer --</option>' +
    sorted.map(c => `<option value="${c.id}" ${cn?.customerId === c.id ? 'selected' : ''}>${c.name}</option>`).join('');
  populateCNInvoices(cn?.invoiceId);
  document.getElementById('cn-balance').textContent = '';
  openModal('modal-creditnote');
}

function openCNModalForInvoice(invoiceId) {
  const inv = DB.invoices.find(i => i.id === invoiceId);
  if (!inv) return;
  editingCNId = null;
  document.getElementById('cn-modal-title').textContent = 'New Credit Note';
  document.getElementById('cn-number').value = '';
  document.getElementById('cn-date').value   = today();
  document.getElementById('cn-amount').value = '';
  document.getElementById('cn-reason').value = 'Return';
  document.getElementById('cn-notes').value  = '';
  const sorted = [...DB.customers].sort((a,b) => a.name.localeCompare(b.name,'en-IN'));
  const cnCustSel = document.getElementById('cn-customer');
  cnCustSel.innerHTML = '<option value="">-- Select Customer --</option>' +
    sorted.map(c => `<option value="${c.id}" ${inv.customerId === c.id ? 'selected' : ''}>${c.name}</option>`).join('');
  cnCustSel.value = String(inv.customerId);
  populateCNInvoices(inv.id);
  updateCNBalance();
  openModal('modal-creditnote');
}

function populateCNInvoices(selectedInvId) {
  const custId = parseInt(document.getElementById('cn-customer').value);
  const sel    = document.getElementById('cn-invoice');
  if (!custId) { sel.innerHTML = '<option value="">-- Select Invoice --</option>'; return; }
  const invs = getAllInvoicesForCustomer(custId);
  sel.innerHTML = '<option value="">-- Select Invoice --</option>' +
    invs.map(i => {
      const bal = parseFloat(i.amount) - getPaidAmount(i.id);
      return `<option value="${i.id}" ${i.id === selectedInvId ? 'selected' : ''}>${i.invNo} — ₹${fmt(i.amount)} (bal ₹${fmt(bal)})</option>`;
    }).join('');
  if (selectedInvId) sel.value = String(selectedInvId);
  updateCNBalance();
}

function updateCNBalance() {
  const invId = parseInt(document.getElementById('cn-invoice').value);
  const el    = document.getElementById('cn-balance');
  if (!invId || !el) return;
  const inv = DB.invoices.find(i => i.id === invId);
  if (!inv) { el.textContent = ''; return; }
  const bal = parseFloat(inv.amount) - getPaidAmount(invId);
  el.textContent = `Invoice balance: ₹${fmt(bal)}`;
  el.style.color = bal > 0 ? 'var(--accent)' : 'var(--success)';
}

async function saveCreditNote() {
  const customerId = parseInt(document.getElementById('cn-customer').value);
  const invoiceId  = parseInt(document.getElementById('cn-invoice').value);
  const cnNumber   = document.getElementById('cn-number').value.trim();
  const date       = document.getElementById('cn-date').value;
  const amount     = parseFloat(document.getElementById('cn-amount').value);
  const reason     = document.getElementById('cn-reason').value;
  const notes      = document.getElementById('cn-notes').value.trim();

  if (!customerId)              return toast('Select a customer.', 'error');
  if (!invoiceId)               return toast('Select an invoice.', 'error');
  if (!cnNumber)                return toast('Credit Note number required.', 'error');
  if (!date)                    return toast('Date required.', 'error');
  if (isNaN(amount)||amount<=0) return toast('Valid amount required.', 'error');

  btnGuard('btn-save-creditnote');
  const data = { customerId, invoiceId, cnNumber, date, amount, reason, notes };
  if (!DB.creditNotes) DB.creditNotes = [];

  if (editingCNId) {
    const idx = DB.creditNotes.findIndex(cn => cn.id === editingCNId);
    DB.creditNotes[idx] = { ...DB.creditNotes[idx], ...data };
    await addLog('edit', `Edited Credit Note ${cnNumber} ₹${fmt(amount)}`);
    toast('Credit note updated!', 'success');
  } else {
    data.id = uniqueId();
    DB.creditNotes.push(data);
    const inv = DB.invoices.find(i => i.id === invoiceId);
    const c   = DB.customers.find(c => c.id === customerId);
    await addLog('create', `Created Credit Note ${cnNumber} ₹${fmt(amount)} for ${inv?.invNo} (${c?.name})`);
    toast('Credit note saved!', 'success');
  }
  try {
    await save('creditNotes');
    closeModal('modal-creditnote');
    renderCreditNotes();
    renderInvoices();
  } catch(e) {
    btnGuardReset('btn-save-creditnote');
    toast('❌ Failed to save credit note: ' + e.message, 'error');
  }
}

// ── Edit Credit Note ─────────────────────────────────────────
function openEditCNModal(id) {
  editingCNId = id;
  const cn = (DB.creditNotes||[]).find(c => c.id === id);
  if (!cn) return;
  const sorted = [...DB.customers].sort((a,b) => a.name.localeCompare(b.name,'en-IN'));
  const sel = document.getElementById('ecn-customer');
  sel.innerHTML = '<option value="">-- Select Customer --</option>' +
    sorted.map(c => `<option value="${c.id}" ${cn.customerId === c.id ? 'selected' : ''}>${c.name}</option>`).join('');
  sel.value = String(cn.customerId);
  populateEditCNInvoices(cn.invoiceId);
  document.getElementById('ecn-number').value = cn.cnNumber || '';
  document.getElementById('ecn-date').value   = cn.date     || today();
  document.getElementById('ecn-amount').value = cn.amount   || '';
  document.getElementById('ecn-reason').value = cn.reason   || 'Return';
  document.getElementById('ecn-notes').value  = cn.notes    || '';
  openModal('modal-edit-creditnote');
}

function populateEditCNInvoices(selectedInvId) {
  const custId = parseInt(document.getElementById('ecn-customer').value);
  const sel    = document.getElementById('ecn-invoice');
  if (!custId) { sel.innerHTML = '<option value="">-- Select Invoice --</option>'; return; }
  const invs = getAllInvoicesForCustomer(custId);
  sel.innerHTML = '<option value="">-- Select Invoice --</option>' +
    invs.map(i => {
      const bal = parseFloat(i.amount) - getPaidAmount(i.id);
      return `<option value="${i.id}" ${i.id === selectedInvId ? 'selected' : ''}>${i.invNo} — ₹${fmt(i.amount)} (bal ₹${fmt(bal)})</option>`;
    }).join('');
  if (selectedInvId) sel.value = String(selectedInvId);
  updateEditCNBalance();
}

function updateEditCNBalance() {
  const invId = parseInt(document.getElementById('ecn-invoice').value);
  const el    = document.getElementById('ecn-balance');
  if (!invId || !el) return;
  const inv = DB.invoices.find(i => i.id === invId);
  if (!inv) { el.textContent = ''; return; }
  const bal = parseFloat(inv.amount) - getPaidAmount(invId);
  el.textContent = `Invoice balance: ₹${fmt(bal)}`;
  el.style.color = bal > 0 ? 'var(--accent)' : 'var(--success)';
}

async function saveEditCN() {
  const customerId = parseInt(document.getElementById('ecn-customer').value);
  const invoiceId  = parseInt(document.getElementById('ecn-invoice').value);
  const cnNumber   = document.getElementById('ecn-number').value.trim();
  const date       = document.getElementById('ecn-date').value;
  const amount     = parseFloat(document.getElementById('ecn-amount').value);
  const reason     = document.getElementById('ecn-reason').value;
  const notes      = document.getElementById('ecn-notes').value.trim();
  if (!customerId||!invoiceId||!cnNumber||!date||isNaN(amount)||amount<=0) return toast('All required fields must be filled.','error');
  btnGuard('btn-save-edit-cn');
  const idx = (DB.creditNotes||[]).findIndex(cn => cn.id === editingCNId);
  if (idx === -1) { btnGuardReset('btn-save-edit-cn'); return toast('Credit note not found.','error'); }
  DB.creditNotes[idx] = { ...DB.creditNotes[idx], customerId, invoiceId, cnNumber, date, amount, reason, notes };
  await addLog('edit', `Edited Credit Note ${cnNumber}`);
  try {
    await save('creditNotes');
    toast('Credit note updated!', 'success');
    closeModal('modal-edit-creditnote');
    renderCreditNotes(); renderInvoices();
  } catch(e) {
    btnGuardReset('btn-save-edit-cn');
    toast('❌ Failed to save: ' + e.message, 'error');
  }
}

async function deleteCreditNote(id) {
  const cn = (DB.creditNotes||[]).find(c => c.id === id);
  const inv = DB.invoices.find(i => i.id === cn?.invoiceId);
  if (!await confirmDialog({ title:'Delete Credit Note', msg:`Delete CN ${cn?.cnNumber}?\nInvoice: ${inv?.invNo || '—'}\nAmount: ₹${fmt(cn?.amount)}\n\nThis will restore the invoice balance.`, type:'danger', okLabel:'Delete Credit Note' })) return;
  await deleteDoc('creditNotes', id);
  DB.creditNotes = (DB.creditNotes||[]).filter(c => c.id !== id);
  await addLog('delete', `Deleted Credit Note ${cn?.cnNumber}`);
  toast('Credit note deleted.', 'error');
  renderCreditNotes(); renderInvoices();
}

function clearCNDateFilter() {
  const f = document.getElementById('cn-date-from'); if (f) f.value='';
  const t = document.getElementById('cn-date-to');   if (t) t.value='';
  renderCreditNotes();
}
function clearCNAmtFilter() {
  const mn = document.getElementById('cn-amt-min'); if (mn) mn.value='';
  const mx = document.getElementById('cn-amt-max'); if (mx) mx.value='';
  renderCreditNotes();
}

function renderCreditNotes() {
  if (!DB.creditNotes) DB.creditNotes = [];
  populateFYFilter('cn-fy-filter', DB.creditNotes.map(cn => cn.date));
  const selectedFY = document.getElementById('cn-fy-filter')?.value || 'all';
  const search     = document.getElementById('cn-search')?.value.toLowerCase() || '';
  const custF      = document.getElementById('cn-cust-filter')?.value || '';
  const reasonF    = document.getElementById('cn-reason-filter')?.value || '';
  const dateFrom   = document.getElementById('cn-date-from')?.value || '';
  const dateTo     = document.getElementById('cn-date-to')?.value || '';
  const amtMin     = parseFloat(document.getElementById('cn-amt-min')?.value) || null;
  const amtMax     = parseFloat(document.getElementById('cn-amt-max')?.value) || null;
  const tbody      = document.getElementById('cn-table');
  if (!tbody) return;

  let list = DB.creditNotes.filter(cn => {
    if (selectedFY !== 'all') { try { if (getFYTag(cn.date) !== selectedFY) return false; } catch { return false; } }
    const c   = DB.customers.find(c => c.id === cn.customerId);
    const inv = DB.invoices.find(i => i.id === cn.invoiceId);
    if (![cn.cnNumber, c?.name, inv?.invNo, cn.reason, cn.notes].join(' ').toLowerCase().includes(search)) return false;
    if (custF   && String(Math.round(parseFloat(cn.customerId))) !== custF && String(cn.customerId) !== custF) return false;
    if (reasonF && cn.reason !== reasonF) return false;
    if (dateFrom && cn.date < dateFrom) return false;
    if (dateTo   && cn.date > dateTo)   return false;
    const amt = parseFloat(cn.amount);
    if (amtMin !== null && amt < amtMin) return false;
    if (amtMax !== null && amt > amtMax) return false;
    return true;
  }).sort((a,b) => new Date(b.date) - new Date(a.date));

  const total = list.reduce((s, cn) => s + parseFloat(cn.amount), 0);
  const countEl = document.getElementById('cn-stat-count');
  const totalEl = document.getElementById('cn-stat-total');
  if (countEl) countEl.textContent = list.length;
  if (totalEl) totalEl.textContent = '₹' + fmt(total);

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="icon">📝</div><p>No credit notes found.</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = list.map(cn => {
    const c   = DB.customers.find(c => c.id === cn.customerId);
    const inv = DB.invoices.find(i => i.id === cn.invoiceId);
    return `<tr>
      <td><strong>${cn.cnNumber}</strong></td>
      <td>${fmtDate(cn.date)}</td>
      <td>${c?.name || '—'}</td>
      <td>${inv?.invNo || '—'}</td>
      <td style="color:var(--danger)">₹${fmt(cn.amount)}</td>
      <td><span class="badge badge-partial">${cn.reason}</span></td>
      <td style="color:var(--muted);font-size:0.82rem">${cn.notes || '—'}</td>
      <td><div class="action-btns">
        <button class="btn btn-outline btn-xs" onclick="openEditCNModal(${cn.id})">✏️ Edit</button>
        <button class="btn btn-danger btn-xs" onclick="deleteCreditNote(${cn.id})">🗑</button>
      </div></td>
    </tr>`;
  }).join('');
}

function exportCreditNotes() {
  if (!DB.creditNotes?.length) return toast('No credit notes to export.','error');
  const data = DB.creditNotes.map(cn => {
    const c   = DB.customers.find(c => c.id === cn.customerId);
    const inv = DB.invoices.find(i => i.id === cn.invoiceId);
    return { 'CN No *': cn.cnNumber, 'Customer *': c?.name||'', 'Invoice No *': inv?.invNo||'', 'Date *': fmtDateExport(cn.date), 'Amount *': parseFloat(cn.amount), 'Reason *': cn.reason, 'Notes': cn.notes||'' };
  });
  exportStyledXLSX(data, 'CreditNotes_MauliEnt', 'Credit Notes');
}
