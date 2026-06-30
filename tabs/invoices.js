// ============================================================
// tabs/invoices.js — Invoice CRUD, status, render, export
// ============================================================

function getLastPaymentDate(invoiceId) {
  const invIdStr = String(invoiceId);
  const payments = DB.payments
    .filter(p => String(p.invoiceId) === invIdStr && p.method !== 'Cancelled' && p.method !== 'Cash Discount')
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  return payments.length ? payments[0].date : null;
}

function getPaidAmount(invoiceId) {
  const invIdStr = String(invoiceId);
  const payments = DB.payments
    .filter(p => String(p.invoiceId) === invIdStr && p.method !== 'Cancelled' && p.method !== 'Cash Discount')
    .reduce((s, p) => s + parseFloat(p.amount), 0);
  const discounts = DB.payments
    .filter(p => String(p.invoiceId) === invIdStr && p.method === 'Cash Discount')
    .reduce((s, p) => s + parseFloat(p.amount), 0);
  const discountFallback = discounts === 0
    ? DB.payments
        .filter(p => String(p.invoiceId) === invIdStr && p.method !== 'Cancelled' && p.method !== 'Cash Discount' && parseFloat(p.cashDisc) > 0)
        .reduce((s, p) => s + parseFloat(p.cashDisc), 0)
    : 0;
  const credits = (DB.creditNotes || [])
    .filter(cn => String(cn.invoiceId) === invIdStr)
    .reduce((s, cn) => s + parseFloat(cn.amount), 0);
  return payments + discounts + discountFallback + credits;
}

function getInvoiceStatus(inv) {
  const paid   = getPaidAmount(inv.id);
  const amount = parseFloat(inv.amount);
  const today  = new Date(); today.setHours(0,0,0,0);
  const due    = parseLocalDate(inv.dueDate);
  if (paid >= amount)  return 'paid';
  if (due < today)     return 'overdue';
  if (paid > 0)        return 'partial';
  return 'pending';
}

function getAllInvoicesForCustomer(custId) {
  const custIdInt = Math.round(parseFloat(custId));
  return DB.invoices.filter(i => {
    const cid = i.customerId;
    if (cid == null) return false;
    if (Math.round(parseFloat(cid)) === custIdInt) return true;
    if (String(cid).trim() === String(custId).trim()) return true;
    return false;
  }).sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
}

function getPendingInvoicesForCustomer(custId) {
  return getAllInvoicesForCustomer(custId).filter(i => getInvoiceStatus(i) !== 'paid');
}

function openInvoiceModal(id = null) {
  editingInvoiceId = id;
  const inv = id ? DB.invoices.find(i => i.id === id) : null;
  document.getElementById('inv-modal-title').textContent = id ? 'Edit Invoice' : 'New Invoice';
  document.getElementById('im-invno').value   = inv?.invNo || '';
  document.getElementById('im-date').value    = inv?.date  || today();
  document.getElementById('im-due').value     = inv?.dueDate || '';
  document.getElementById('im-due').dataset.manuallySet = id ? 'true' : 'false';
  document.getElementById('im-amount').value  = inv?.amount || '';
  document.getElementById('im-desc').value    = inv?.description || '';
  document.getElementById('inv-dup-warn').style.display = 'none';
  document.getElementById('dup-global').style.display   = 'none';
  populateInvoiceCustomers(inv?.customerId);
  openModal('modal-invoice');
}

function populateInvoiceCustomers(selectedId) {
  const sel    = document.getElementById('im-customer');
  const sorted = [...DB.customers].sort((a,b) => a.name.localeCompare(b.name,'en-IN'));
  sel.innerHTML = '<option value="">-- Select Customer --</option>' +
    sorted.map(c => `<option value="${c.id}" ${c.id === selectedId ? 'selected' : ''}>${c.name}</option>`).join('');
}

function checkDupInvoice() {
  const val   = document.getElementById('im-invno').value.trim();
  const isDup = val && DB.invoices.some(i => i.invNo === val && i.id !== editingInvoiceId);
  document.getElementById('inv-dup-warn').style.display = isDup ? 'block' : 'none';
  document.getElementById('dup-global').style.display   = isDup ? 'block' : 'none';
}

function autoFillDueDate() {
  const dateVal = document.getElementById('im-date').value;
  const dueEl   = document.getElementById('im-due');
  if (!dateVal || dueEl.dataset.manuallySet === 'true') return;
  const custId = Number(document.getElementById('im-customer').value);
  const cust   = DB.customers.find(c => c.id === custId);
  const days   = cust?.creditDays ?? 60;
  const d = new Date(dateVal);
  d.setDate(d.getDate() + days);
  dueEl.value = d.toISOString().split('T')[0];
}

async function saveInvoice() {
  const customerIdRaw = document.getElementById('im-customer').value;
  const customerId    = Number(customerIdRaw);
  const invNo         = document.getElementById('im-invno').value.trim();
  const date          = document.getElementById('im-date').value;
  const dueDate       = document.getElementById('im-due').value;
  const amount        = parseFloat(document.getElementById('im-amount').value);
  const description   = document.getElementById('im-desc').value.trim();

  if (!customerId)              return toast('Select a customer.', 'error');
  if (!invNo)                   return toast('Invoice number required.', 'error');
  if (!date)                    return toast('Invoice date required.', 'error');
  if (!dueDate)                 return toast('Due date required.', 'error');
  if (isNaN(amount)||amount<=0) return toast('Valid amount required.', 'error');
  if (DB.invoices.some(i => i.invNo === invNo && i.id !== editingInvoiceId)) return toast('Duplicate invoice number!', 'error');

  btnGuard('btn-save-invoice');
  const data = { customerId, invNo, date, dueDate, amount, description };

  if (editingInvoiceId) {
    const idx    = DB.invoices.findIndex(i => i.id === editingInvoiceId);
    const oldInv = DB.invoices[idx];
    const oldAmt = parseFloat(oldInv.amount);
    const wasPaid = getInvoiceStatus(oldInv) === 'paid';
    const c = DB.customers.find(c => String(c.id) === String(Math.round(parseFloat(customerId))));
    DB.invoices[idx] = { ...oldInv, ...data };
    let logMsg = `${wasPaid ? 'Correction' : 'Edited'} invoice ${invNo} (${c?.name || 'Customer #' + customerId})`;
    if (Math.abs(oldAmt - amount) > 0.01) logMsg += ` | Amount: ₹${fmt(oldAmt)} → ₹${fmt(amount)}`;
    await addLog(wasPaid ? 'correction' : 'edit', logMsg);
    toast('Invoice updated!', 'success');
  } else {
    data.id = Date.now();
    DB.invoices.push(data);
    const c = DB.customers.find(c => String(c.id) === String(Math.round(parseFloat(customerId))));
    await addLog('create', `Created invoice ${invNo} ₹${fmt(amount)} for ${c?.name || 'Customer #' + customerId}`);
    toast('Invoice saved!', 'success');
  }
  try {
    await save('invoices');
    closeModal('modal-invoice');
    document.getElementById('dup-global').style.display = 'none';
    renderInvoices();
    renderDashboard();
  } catch(e) {
    btnGuardReset('btn-save-invoice');
    toast('❌ Failed to save invoice: ' + e.message, 'error');
  }
}

async function deleteInvoice(id) {
  const inv = DB.invoices.find(i => i.id === id);
  if (!await confirmDialog({ title: 'Delete Invoice', msg: `Delete invoice ${inv?.invNo}?\n\nAll associated payments and credit notes will also be removed.`, type: 'danger', okLabel: 'Delete Invoice' })) return;
  const payIds = DB.payments.filter(p => p.invoiceId === id).map(p => p.id);
  const cnIds  = (DB.creditNotes||[]).filter(cn => cn.invoiceId === id).map(cn => cn.id);
  for (const pid of payIds) await deleteDoc('payments', pid);
  for (const cid of cnIds)  await deleteDoc('creditNotes', cid);
  await deleteDoc('invoices', id);
  DB.invoices    = DB.invoices.filter(i => i.id !== id);
  DB.payments    = DB.payments.filter(p => p.invoiceId !== id);
  DB.creditNotes = (DB.creditNotes||[]).filter(cn => cn.invoiceId !== id);
  await addLog('delete', `Deleted invoice ${inv?.invNo}`);
  toast('Invoice deleted.', 'error');
  renderInvoices();
  renderDashboard();
}

function clearInvDateFilter() {
  const f = document.getElementById('inv-date-from');
  const t = document.getElementById('inv-date-to');
  if (f) f.value = '';
  if (t) t.value = '';
  renderInvoices();
}

function clearInvAmtFilter() {
  const mn = document.getElementById('inv-amt-min');
  const mx = document.getElementById('inv-amt-max');
  if (mn) mn.value = '';
  if (mx) mx.value = '';
  renderInvoices();
}

function renderInvoices() {
  populateFYFilter('inv-fy-filter', DB.invoices.map(i => i.date));
  const selectedFY  = document.getElementById('inv-fy-filter')?.value || 'all';
  const search      = document.getElementById('inv-search')?.value.toLowerCase() || '';
  const custFilter2 = document.getElementById('inv-cust-filter')?.value || '';
  const statusF     = document.getElementById('inv-status-filter')?.value || '';
  const dateFrom    = document.getElementById('inv-date-from')?.value || '';
  const dateTo      = document.getElementById('inv-date-to')?.value || '';
  const amtMin      = parseFloat(document.getElementById('inv-amt-min')?.value) || null;
  const amtMax      = parseFloat(document.getElementById('inv-amt-max')?.value) || null;
  const tbody       = document.getElementById('inv-table');
  if (!tbody) return;

  const label = document.getElementById('inv-date-label');
  if (label) {
    if (dateFrom || dateTo) label.textContent = `Showing: ${dateFrom ? 'from ' + fmtDate(dateFrom) : ''} ${dateTo ? 'to ' + fmtDate(dateTo) : ''}`;
    else if (selectedFY !== 'all') label.textContent = 'F.Y. 20' + selectedFY.slice(0,2) + '-' + selectedFY.slice(2);
    else label.textContent = 'Showing all invoices';
  }

  let list = DB.invoices.filter(inv => {
    if (selectedFY !== 'all') { try { if (getFYTag(inv.date) !== selectedFY) return false; } catch { return false; } }
    const c = DB.customers.find(c => String(c.id) === String(Math.round(parseFloat(inv.customerId))));
    if (![inv.invNo, c?.name, inv.description].join(' ').toLowerCase().includes(search)) return false;
    if (custFilter2 && String(Math.round(parseFloat(inv.customerId))) !== custFilter2 && String(inv.customerId) !== custFilter2) return false;
    if (statusF && getInvoiceStatus(inv) !== statusF) return false;
    if (dateFrom && inv.date < dateFrom) return false;
    if (dateTo   && inv.date > dateTo)   return false;
    const amt = parseFloat(inv.amount);
    if (amtMin !== null && amt < amtMin) return false;
    if (amtMax !== null && amt > amtMax) return false;
    return true;
  }).sort((a,b) => { const ka=invNoSortKey(a.invNo),kb=invNoSortKey(b.invNo); return ka<kb?-1:ka>kb?1:0; });

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state"><div class="icon">🧾</div><p>No invoices found.</p></div></td></tr>`;
    return;
  }

  const statusMap = { paid:'badge-paid', pending:'badge-pending', partial:'badge-partial', overdue:'badge-overdue' };
  const isDev = currentUser?.role === 'dev';
  tbody.innerHTML = list.map(inv => {
    const c      = DB.customers.find(c => String(c.id) === String(Math.round(parseFloat(inv.customerId))));
    const paid   = getPaidAmount(inv.id);
    const bal    = parseFloat(inv.amount) - paid;
    const status = getInvoiceStatus(inv);
    const hasCN  = (DB.creditNotes||[]).some(cn => cn.invoiceId === inv.id);
    return `<tr>
      <td><strong>${inv.invNo}</strong>${hasCN ? ' <span title="Has credit note" style="color:var(--accent);font-size:0.7rem">CN</span>' : ''}</td>
      <td>${c?.name || '—'}</td>
      <td>${fmtDate(inv.date)}</td>
      <td>${fmtDate(inv.dueDate)}</td>
      <td>₹${fmt(inv.amount)}</td>
      <td style="color:var(--success)">₹${fmt(paid)}</td>
      <td style="color:${bal>0?'var(--danger)':'var(--success)'}">₹${fmt(bal)}</td>
      <td><span class="badge ${statusMap[status]}">${status}</span></td>
      <td><div class="action-btns">
        ${isDev || status !== 'paid' ? `<button class="btn btn-outline btn-xs" onclick="openInvoiceModal(${inv.id})">✏️ Edit</button>` : ''}
        <button class="btn btn-primary btn-xs" onclick="openPaymentModalForInvoice(${inv.id})">💳 Receipt</button>
        <button class="btn btn-xs" style="background:#4f8ef720;color:var(--accent);border:1px solid #4f8ef740" onclick="openCNModalForInvoice(${inv.id})">📝 Credit Note</button>
        <button class="btn btn-danger btn-xs" onclick="deleteInvoice(${inv.id})">🗑</button>
      </div></td>
    </tr>`;
  }).join('');
}

function exportInvoices() {
  const selectedFY  = document.getElementById('inv-fy-filter')?.value || 'all';
  const search      = document.getElementById('inv-search')?.value.toLowerCase() || '';
  const custFilter2 = document.getElementById('inv-cust-filter')?.value || '';
  const statusF     = document.getElementById('inv-status-filter')?.value || '';
  const dateFrom    = document.getElementById('inv-date-from')?.value || '';
  const dateTo      = document.getElementById('inv-date-to')?.value || '';
  const amtMin      = parseFloat(document.getElementById('inv-amt-min')?.value) || null;
  const amtMax      = parseFloat(document.getElementById('inv-amt-max')?.value) || null;
  let list = DB.invoices.filter(inv => {
    if (selectedFY !== 'all') { try { if (getFYTag(inv.date)!==selectedFY) return false; } catch { return false; } }
    const c = DB.customers.find(c => String(c.id) === String(Math.round(parseFloat(inv.customerId))));
    if (![inv.invNo, c?.name, inv.description].join(' ').toLowerCase().includes(search)) return false;
    if (custFilter2 && String(Math.round(parseFloat(inv.customerId))) !== custFilter2 && String(inv.customerId) !== custFilter2) return false;
    if (statusF && getInvoiceStatus(inv) !== statusF) return false;
    if (dateFrom && inv.date < dateFrom) return false;
    if (dateTo   && inv.date > dateTo)   return false;
    const amt = parseFloat(inv.amount);
    if (amtMin !== null && amt < amtMin) return false;
    if (amtMax !== null && amt > amtMax) return false;
    return true;
  }).sort((a,b)=>{ const ka=invNoSortKey(a.invNo),kb=invNoSortKey(b.invNo); return ka<kb?-1:ka>kb?1:0; });
  if (!list.length) return toast('No invoices to export.','error');
  const data = list.map(inv => {
    const c = DB.customers.find(c => String(c.id) === String(Math.round(parseFloat(inv.customerId))));
    return { 'CustomerName *': c?.name||'', 'InvoiceNo *': inv.invNo, 'InvoiceDate *': fmtDateExport(inv.date), 'DueDate': fmtDateExport(inv.dueDate), 'Amount *': parseFloat(inv.amount), 'Description': inv.description||'' };
  });
  exportStyledXLSX(data, 'Invoices_MauliEnt', 'Invoices');
}

function exportUnpaidInvoices() {
  const data = DB.invoices.filter(i => getInvoiceStatus(i) !== 'paid').map(inv => {
    const c = DB.customers.find(c => c.id === inv.customerId);
    return { InvoiceNo: inv.invNo, Customer: c?.name, Date: inv.date, DueDate: inv.dueDate, Amount: inv.amount, Paid: getPaidAmount(inv.id), Balance: parseFloat(inv.amount) - getPaidAmount(inv.id), Status: getInvoiceStatus(inv) };
  });
  exportXLSX(data, 'Unpaid_Invoices_MauliEnt');
}

function exportOverdueExcel() {
  const today = new Date(); today.setHours(0,0,0,0);
  const data = DB.invoices.filter(inv => {
    const bal = parseFloat(inv.amount) - getPaidAmount(inv.id);
    return bal > 0 && parseLocalDate(inv.dueDate) < today;
  }).map(inv => {
    const c = DB.customers.find(c => c.id === inv.customerId);
    return { InvoiceNo: inv.invNo, Customer: c?.name, Phone: c?.phone, DueDate: inv.dueDate, DaysOverdue: Math.floor((today - parseLocalDate(inv.dueDate))/86400000), Balance: parseFloat(inv.amount) - getPaidAmount(inv.id) };
  });
  exportXLSX(data, 'Overdue_MauliEnt');
}

// ── Import modal ─────────────────────────────────────────────
let importType = null;

function openImportModal(type) {
  importType = type;
  const titles = { customers:'Import Customers from Excel', invoices:'Import Invoices from Excel', receipts:'Import Receipts from Excel', payments:'Import Receipts from Excel', creditnotes:'Import Credit Notes from Excel', expenses:'Import Expenses from Excel', dealers:'Import Dealers from Excel', purchases:'Import Purchases from Excel', purchpayments:'Import Purchase Payments from Excel', debitnotes:'Import Debit Notes from Excel' };
  const cols   = { customers:'Required: Name*, Phone*, Email, Company, Pincode, Address, GST, CreditDays, WhatsappReminder, EmailReminder', invoices:'Required: CustomerName*, InvoiceNo*, InvoiceDate*, DueDate, Amount*, Description', receipts:'Required: Receipt No*, Customer*, Amount*, Payment Date*, Mode of Payment*, Invoice No*, Cash Disc, Adjust Amt, Reference/UTR, Notes', payments:'Required: Receipt No*, Customer*, Amount*, Payment Date*, Mode of Payment*, Invoice No*, Cash Disc, Adjust Amt, Reference/UTR, Notes', creditnotes:'Required: CN No*, Customer*, Invoice No*, Date*, Amount*, Reason*, Notes', expenses:'Required: Date*, Category*, Description, Amount*, Mode*, DoneBy', dealers:'Required: Name*, Phone*, Email, Company, Pincode, Address, GST, CreditDays', purchases:'Required: DealerName*, BillNo*, BillDate*, DueDate, Amount*, Description', purchpayments:'Required: Receipt No*, Dealer*, Amount*, Payment Date*, Mode*, Bill No*, Reference/UTR, Notes', debitnotes:'Required: DN No*, Dealer*, Bill No, Date*, Amount*, Reason*, Notes' };
  document.getElementById('import-title').textContent = titles[type] || 'Import from Excel';
  document.getElementById('import-cols').textContent  = cols[type]   || '';
  document.getElementById('import-file').value = '';
  resetImportModal();
  openModal('modal-import');
}

async function handleImport(input) {
  const file = input.files[0];
  if (!file) return;
  showImportLoading('📂', 'Reading file…', 'Parsing your Excel sheet');
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      setImportProgress(10, 'Parsing rows…', 'Building data from columns');
      await new Promise(r => setTimeout(r, 40));
      const wb   = XLSX.read(e.target.result, { type: 'array' });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json(ws);
      const rows = rawRows.map(r => {
        const n = {};
        for (const k of Object.keys(r)) n[k.replace(/\s*\*\s*$/, '').trim()] = r[k];
        return n;
      }).filter(r => {
        const name = String(r['Name']||r['CustomerName']||r['DealerName']||r['InvoiceNo']||r['BillNo']||r['Receipt No']||r['CN No']||r['Date']||'');
        return name && !name.startsWith('⚠') && !name.toLowerCase().startsWith('columns marked');
      });
      setImportProgress(25, `Processing ${rows.length} rows…`, 'Validating records');
      await new Promise(r => setTimeout(r, 40));
      let count = 0;

      if (importType === 'customers') {
        const newItems = []; let idBase = Date.now();
        for (const r of rows) {
          const name = String(r.Name || '').trim();
          const phone = String(r.Phone || '').trim();
          if (!name || !phone || phone === 'nan') continue;
          const wa = String(r.WhatsappReminder||'').trim().toLowerCase();
          const em = String(r.EmailReminder||'').trim().toLowerCase();
          const item = { id: Math.round(idBase++), name, phone, email: r.Email||'', company: r.Company||'', city: String(r.Pincode||'').replace(/\.0$/,''), address: r.Address||'', gst: r.GST||'', creditDays: parseInt(r.CreditDays)||60, whatsapp: wa==='yes', emailRem: em==='yes' };
          DB.customers.push(item); newItems.push(item); count++;
        }
        setImportProgress(40, `Uploading ${count} customers…`, '');
        await saveChunked('customers', newItems);
        addLog('create', `Imported ${count} customers from Excel`);

      } else if (importType === 'invoices') {
        const newItems = []; let idBase = Date.now();
        for (const r of rows) {
          if (!r.CustomerName || !r.InvoiceNo) continue;
          const c = DB.customers.find(c => c.name.toLowerCase() === String(r.CustomerName).toLowerCase());
          if (!c) continue;
          const item = { id: Math.round(idBase++), customerId: c.id, invNo: String(r.InvoiceNo), date: fmtExcelDate(r.InvoiceDate), dueDate: fmtExcelDate(r.DueDate), amount: parseFloat(r.Amount)||0, description: r.Description||'' };
          DB.invoices.push(item); newItems.push(item); count++;
        }
        DB.invoices.sort((a,b) => { const ka=invNoSortKey(a.invNo),kb=invNoSortKey(b.invNo); return ka<kb?-1:ka>kb?1:0; });
        setImportProgress(40, `Uploading ${count} invoices…`, '');
        await saveChunked('invoices', newItems);
        addLog('create', `Imported ${count} invoices from Excel`);

      } else if (importType === 'payments' || importType === 'receipts') {
        const groups = {};
        for (const r of rows) {
          const rcpt = String(r['Receipt No'] || '').trim();
          if (!rcpt) continue;
          if (!groups[rcpt]) groups[rcpt] = [];
          groups[rcpt].push(r);
        }
        const newItems = []; let idBase = Date.now();
        for (const [rcptNo, rrows] of Object.entries(groups)) {
          const first = rrows[0];
          const custName = String(first['Customer']||'').trim();
          const c = DB.customers.find(c => c.name.toLowerCase() === custName.toLowerCase());
          if (!c) { toast(`Customer not found: "${custName}" — skipping`, 'error'); continue; }
          const groupId = 'grp_' + Math.round(idBase);
          const date = fmtExcelDate(first['Payment Date']);
          const method = String(first['Mode of Payment']||'Cash').trim();
          const ref  = String(first['Reference/UTR']||'').trim();
          const notes = String(first['Notes']||'').trim();
          let totalReceived = 0;
          for (const rr of rrows) { const adj = parseFloat(rr['Adjust Amt']); const amt = parseFloat(rr['Amount']||0); totalReceived += isNaN(adj) ? amt : adj; }
          for (const rr of rrows) {
            const invNo = String(rr['Invoice No']||'').trim();
            const inv = DB.invoices.find(i => i.invNo === invNo);
            if (!inv) continue;
            const adj = parseFloat(rr['Adjust Amt']); const rowAmt = parseFloat(rr['Amount']||0);
            const allocAmt = isNaN(adj) ? rowAmt : adj;
            const cashDisc = parseFloat(rr['Cash Disc'])||0;
            idBase++;
            const mainEntry = { id: idBase, groupId, customerId: c.id, invoiceId: inv.id, amount: allocAmt, date, method, ref, notes, cashDisc, totalReceived, receiptNo: rcptNo };
            DB.payments.push(mainEntry); newItems.push(mainEntry); count++;
            if (cashDisc > 0) {
              idBase++;
              const discEntry = { id: idBase, groupId, customerId: c.id, invoiceId: inv.id, amount: cashDisc, date, method: 'Cash Discount', ref:'', notes:`Cash Discount on ${invNo}`, cashDisc, totalReceived, receiptNo: rcptNo };
              DB.payments.push(discEntry); newItems.push(discEntry);
            }
          }
        }
        setImportProgress(40, `Uploading ${count} receipt rows…`, '');
        await saveChunked('payments', newItems);
        addLog('create', `Imported receipt rows from Excel`);

      } else if (importType === 'creditnotes') {
        const newItems = []; let idBase = Date.now();
        for (const r of rows) {
          const cnNo = String(r['CN No']||'').trim();
          const custName = String(r['Customer']||'').trim();
          const invNo = String(r['Invoice No']||'').trim();
          if (!cnNo || !custName || !invNo) continue;
          const c = DB.customers.find(c => c.name.toLowerCase() === custName.toLowerCase());
          if (!c) continue;
          const inv = DB.invoices.find(i => i.invNo === invNo);
          if (!inv) continue;
          const item = { id: Math.round(idBase++), customerId: c.id, invoiceId: inv.id, cnNumber: cnNo, date: fmtExcelDate(r['Date']), amount: parseFloat(r['Amount'])||0, reason: String(r['Reason']||'Other').trim(), notes: String(r['Notes']||'').trim() };
          if (!DB.creditNotes) DB.creditNotes = [];
          DB.creditNotes.push(item); newItems.push(item); count++;
        }
        setImportProgress(40, `Uploading ${count} credit notes…`, '');
        await saveChunked('creditNotes', newItems);
        addLog('create', `Imported ${count} credit notes from Excel`);

      } else if (importType === 'expenses') {
        const newItems = []; let idBase = Date.now();
        const validCategories = ['Petrol','Hotel','Electricity','Professional Fees','Repair & Maintenance','Other'];
        const validModes = ['UPI','Cash','Self'];
        for (const r of rows) {
          const date = fmtExcelDate(r['Date']); let cat = String(r['Category']||'').trim();
          const amount = parseFloat(r['Amount']||0); let mode = String(r['Mode']||'UPI').trim();
          if (!date || !cat || !amount) continue;
          if (!validCategories.includes(cat)) cat = 'Other';
          if (!validModes.includes(mode)) mode = 'UPI';
          const item = { id: Math.round(idBase++), date, category: cat, description: String(r['Description']||'').trim(), amount, mode, by: String(r['DoneBy']||'').trim() };
          if (!DB.expenses) DB.expenses = [];
          DB.expenses.push(item); newItems.push(item); count++;
        }
        setImportProgress(40, `Uploading ${count} expenses…`, '');
        await saveChunked('expenses', newItems);
        addLog('create', `Imported ${count} expenses from Excel`);
      }

      const displayType = (importType === 'receipts' || importType === 'payments') ? 'receipts' : importType;
      setImportProgress(100, '✅ Done!', `${count} ${displayType} imported`);
      await new Promise(r => setTimeout(r, 700));
      closeModal('modal-import'); resetImportModal(); renderAll();
      toast(`✅ Imported ${count} ${displayType}!`, 'success');
    } catch(err) {
      resetImportModal();
      toast('Import failed: ' + err.message, 'error');
    }
  };
  reader.readAsArrayBuffer(file);
}

async function downloadTemplate(type) {
  const localTypes = [];
  if (localTypes.includes(type)) { _generateTemplateLocally(type); return; }
  const ACCENT = 'FF1A6FD4'; const WHITE = 'FFFFFFFF'; const WARN = 'FFFFF3CD';
  const styleHdr = (ws, headers) => {
    headers.forEach((h, i) => {
      const cell = ws[XLSX.utils.encode_cell({r:0,c:i})];
      if (!cell) return;
      cell.s = { fill:{patternType:'solid',fgColor:{rgb:ACCENT}}, font:{bold:true,color:{rgb:WHITE},name:'Arial',sz:10}, alignment:{horizontal:'center'} };
    });
  };
  const maps = {
    customers:    { file:'MauliEnt_Customers_Template.xlsx' },
    invoices:     { file:'MauliEnt_Invoices_Template.xlsx' },
    receipts:     { file:'MauliEnt_Receipts_Template.xlsx' },
    payments:     { file:'MauliEnt_Receipts_Template.xlsx' },
    creditnotes:  { file:'MauliEnt_CreditNotes_Template.xlsx' },
    expenses:     { file:'MauliEnt_Expenses_Template.xlsx' },
    dealers:      { file:'MauliEnt_Dealers_Template.xlsx' },
    purchases:    { file:'MauliEnt_Purchases_Template.xlsx' },
    purchpayments:{ file:'MauliEnt_Purchase_Payments_Template.xlsx' },
    debitnotes:   { file:'MauliEnt_DebitNotes_Template.xlsx' }
  };
  const m = maps[type];
  if (!m) return;
  try {
    const resp = await fetch(`./templates/${m.file}`);
    if (!resp.ok) throw new Error('not found');
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = m.file;
    a.click(); URL.revokeObjectURL(url);
    toast('Template downloaded ✓', 'success');
  } catch(e) {
    toast(`Template file not found: ${m.file}`, 'error');
  }
}

function _generateTemplateLocally(type) {
  const ACCENT = 'FF1A6FD4'; const WHITE = 'FFFFFFFF';
  const defs = {
    dealers:      { headers:['Name *','Phone *','Email','Company','Pincode','Address','GST','CreditDays'], file:'MauliEnt_Dealers_Template.xlsx', sheet:'Dealers' },
    purchases:    { headers:['DealerName *','BillNo *','BillDate *','DueDate','Amount *','Description'], file:'MauliEnt_Purchases_Template.xlsx', sheet:'Purchases' },
    purchpayments:{ headers:['Receipt No *','Dealer *','Amount *','Payment Date *','Mode *','Bill No *','Reference/UTR','Notes'], file:'MauliEnt_Payments_Template.xlsx', sheet:'Purchase Payments' },
    debitnotes:   { headers:['DN No *','Dealer *','Bill No','Date *','Amount *','Reason *','Notes'], file:'MauliEnt_DebitNotes_Template.xlsx', sheet:'Debit Notes' }
  };
  const m = defs[type];
  if (!m) return;
  const ws = XLSX.utils.aoa_to_sheet([m.headers, ['⚠  Columns marked * are MANDATORY.']]);
  m.headers.forEach((h,i) => {
    const cell = ws[XLSX.utils.encode_cell({r:0,c:i})];
    if (cell) cell.s = { fill:{patternType:'solid',fgColor:{rgb:ACCENT}}, font:{bold:true,color:{rgb:WHITE},name:'Arial',sz:10}, alignment:{horizontal:'center'} };
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, m.sheet);
  XLSX.writeFile(wb, m.file);
  toast('Template downloaded ✓', 'success');
}
