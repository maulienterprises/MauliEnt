// ============================================================
// tabs/customers.js — Customer CRUD, render, export
// ============================================================

function getCustomerBalance(id) {
  const invs = DB.invoices.filter(i => i.customerId === id);
  return invs.reduce((s, i) => s + (parseFloat(i.amount) - getPaidAmount(i.id)), 0);
}

function getCustomerStatus(id) {
  const invs = DB.invoices.filter(i => i.customerId === id);
  if (!invs.length) return 'paid';
  const today = new Date(); today.setHours(0,0,0,0);
  if (invs.some(i => { const bal = parseFloat(i.amount) - getPaidAmount(i.id); return bal > 0 && parseLocalDate(i.dueDate) < today; })) return 'overdue';
  if (invs.some(i => { const paid = getPaidAmount(i.id); return paid > 0 && paid < parseFloat(i.amount); })) return 'partial';
  if (invs.some(i => getPaidAmount(i.id) < parseFloat(i.amount))) return 'pending';
  return 'paid';
}

function openCustomerModal(id = null) {
  editingCustomerId = id;
  const c = id ? DB.customers.find(c => c.id === id) : null;
  document.getElementById('cust-modal-title').textContent = id ? 'Edit Customer' : 'Add Customer';
  document.getElementById('cm-name').value        = c?.name || '';
  document.getElementById('cm-company').value     = c?.company || '';
  document.getElementById('cm-phone').value       = c?.phone || '';
  document.getElementById('cm-email').value       = c?.email || '';
  document.getElementById('cm-city').value        = c?.city || '';
  document.getElementById('cm-gst').value         = c?.gst || '';
  document.getElementById('cm-address').value     = c?.address || '';
  document.getElementById('cm-whatsapp').checked  = c?.whatsapp || false;
  document.getElementById('cm-email-rem').checked = c?.emailRem || false;
  document.getElementById('cm-credit-days').value = c?.creditDays ?? 60;
  openModal('modal-customer');
}

async function saveCustomer() {
  const name  = document.getElementById('cm-name').value.trim();
  const phone = document.getElementById('cm-phone').value.trim();
  if (!name)  return toast('Name is required.', 'error');
  if (!phone) return toast('Phone is required.', 'error');
  btnGuard('btn-save-customer');
  const data = {
    name, phone,
    company:    document.getElementById('cm-company').value.trim(),
    email:      document.getElementById('cm-email').value.trim(),
    city:       document.getElementById('cm-city').value.trim(),
    gst:        document.getElementById('cm-gst').value.trim(),
    address:    document.getElementById('cm-address').value.trim(),
    whatsapp:   document.getElementById('cm-whatsapp').checked,
    emailRem:   document.getElementById('cm-email-rem').checked,
    creditDays: parseInt(document.getElementById('cm-credit-days').value) || 60
  };
  if (editingCustomerId) {
    const idx = DB.customers.findIndex(c => c.id === editingCustomerId);
    const oldName = DB.customers[idx]?.name;
    DB.customers[idx] = { ...DB.customers[idx], ...data };
    await addLog('edit', `Edited customer: ${name}${oldName && oldName !== name ? ` (was: ${oldName})` : ''}`);
    toast('Customer updated!', 'success');
  } else {
    data.id = Date.now();
    DB.customers.push(data);
    await addLog('create', `Added customer: ${name} | Total: ${DB.customers.length}`);
    toast('Customer added!', 'success');
  }
  try {
    await save('customers');
    closeModal('modal-customer');
    renderCustomers();
    updateCustomerDropdowns();
  } catch(e) {
    btnGuardReset('btn-save-customer');
    toast('❌ Failed to save: ' + e.message, 'error');
  }
}

async function deleteCustomer(id) {
  const c = DB.customers.find(c => c.id === id);
  if (!await confirmDialog({ title: 'Delete Customer', msg: `Delete "${c?.name}"?\n\nThis will also permanently remove all their invoices and payments.`, type: 'danger', okLabel: 'Delete Customer' })) return;
  const invIds = DB.invoices.filter(i => i.customerId === id).map(i => i.id);
  const payIds = DB.payments.filter(p => p.customerId === id).map(p => p.id);
  const cnIds  = (DB.creditNotes||[]).filter(cn => cn.customerId === id).map(cn => cn.id);
  for (const iid of invIds) await deleteDoc('invoices', iid);
  for (const pid of payIds) await deleteDoc('payments', pid);
  for (const cid of cnIds)  await deleteDoc('creditNotes', cid);
  await deleteDoc('customers', id);
  DB.invoices    = DB.invoices.filter(i => i.customerId !== id);
  DB.payments    = DB.payments.filter(p => p.customerId !== id);
  DB.creditNotes = (DB.creditNotes||[]).filter(cn => cn.customerId !== id);
  DB.customers   = DB.customers.filter(c => c.id !== id);
  await addLog('delete', `Deleted customer: ${c?.name}`);
  toast('Customer deleted.', 'error');
  renderAll();
}

function renderCustomers() {
  const search = document.getElementById('cust-search')?.value.toLowerCase() || '';
  const tbody  = document.getElementById('cust-table');
  if (!tbody) return;
  let list = DB.customers.filter(c => {
    const match = [c.name, c.phone, c.email, c.city, c.company].join(' ').toLowerCase().includes(search);
    if (!match) return false;
    if (custFilter === 'all') return true;
    return getCustomerStatus(c.id) === custFilter;
  }).sort((a, b) => a.name.localeCompare(b.name, 'en-IN'));

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state"><div class="icon">👥</div><p>No customers found.</p></div></td></tr>`;
    return;
  }
  const statusMap = { paid:'badge-paid', pending:'badge-pending', partial:'badge-partial', overdue:'badge-overdue' };
  tbody.innerHTML = list.map((c, i) => {
    const bal    = getCustomerBalance(c.id);
    const status = getCustomerStatus(c.id);
    return `<tr>
      <td>${i+1}</td>
      <td><strong>${c.name}</strong>${c.company ? `<br><small style="color:var(--muted)">${c.company}</small>` : ''}</td>
      <td>${c.phone}</td>
      <td>${c.email || '—'}</td>
      <td>${c.city || '—'}</td>
      <td style="color:${bal>0?'var(--danger)':'var(--success)'}">₹${fmt(bal)}</td>
      <td>${c.whatsapp ? '📱' : ''}${c.emailRem ? '✉️' : ''}</td>
      <td><span class="badge ${statusMap[status]}">${status}</span></td>
      <td><div class="action-btns">
        <button class="btn btn-outline btn-xs" onclick="openCustomerModal(${c.id})">✏️ Edit</button>
        <button class="btn btn-xs" style="background:#e74c3c20;color:var(--danger);border:1px solid #e74c3c40" onclick="openReminderModal(${c.id})">🔔 Remind</button>
        <button class="btn btn-danger btn-xs" onclick="deleteCustomer(${c.id})">🗑</button>
      </div></td>
    </tr>`;
  }).join('');
}

function updateCustomerDropdowns() {
  const sorted = [...DB.customers].sort((a, b) => a.name.localeCompare(b.name, 'en-IN'));
  const custOpts = '<option value="">All Customers</option>' + sorted.map(c => `<option value="${String(c.id)}">${c.name}</option>`).join('');
  ['inv-cust-filter','pay-cust-filter','cn-cust-filter'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = custOpts;
  });
  updateLedgerDropdown();
}

// ── Reminder ─────────────────────────────────────────────────
function openReminderModal(customerId) {
  reminderTarget = DB.customers.find(c => c.id === customerId);
  if (!reminderTarget) return;
  document.getElementById('reminder-modal-title').textContent = `Send Reminder — ${reminderTarget.name}`;
  const bal = getCustomerBalance(reminderTarget.id);
  document.getElementById('reminder-customer-info').innerHTML =
    `<strong>${reminderTarget.name}</strong>${reminderTarget.company ? ` · ${reminderTarget.company}` : ''}` +
    `<br><span style="color:var(--muted)">${reminderTarget.phone || '—'}${reminderTarget.email ? '  ·  ' + reminderTarget.email : ''}</span>` +
    `<span style="float:right;color:var(--danger);font-weight:700">Total Due: ₹${fmt(bal)}</span>`;
  const unpaid = DB.invoices.filter(i => {
    const b = parseFloat(i.amount) - getPaidAmount(i.id);
    return i.customerId === reminderTarget.id && b > 0;
  });
  const listEl = document.getElementById('reminder-invoice-list');
  if (!unpaid.length) {
    listEl.innerHTML = `<p style="color:var(--success);text-align:center;padding:12px">No outstanding invoices ✅</p>`;
    document.getElementById('reminder-total-row').textContent = '';
  } else {
    listEl.innerHTML = unpaid.map(inv => {
      const due = parseFloat(inv.amount) - getPaidAmount(inv.id);
      return `<label style="display:flex;align-items:center;gap:10px;padding:7px 6px;border-bottom:1px solid var(--border);cursor:pointer;font-size:0.83rem">
        <input type="checkbox" class="reminder-inv-chk" data-id="${inv.id}" checked style="accent-color:var(--accent);width:15px;height:15px" onchange="updateReminderTotal()">
        <span style="flex:1"><strong>${inv.invNo}</strong> · ${fmtDate(inv.date)} · Due: ${fmtDate(inv.dueDate)}</span>
        <span style="color:var(--danger);font-weight:600;white-space:nowrap">₹${fmt(due)}</span>
      </label>`;
    }).join('');
    updateReminderTotal();
  }
  openModal('modal-reminder');
}

function reminderSelectAll()  { document.querySelectorAll('.reminder-inv-chk').forEach(c => c.checked = true);  updateReminderTotal(); }
function reminderSelectNone() { document.querySelectorAll('.reminder-inv-chk').forEach(c => c.checked = false); updateReminderTotal(); }
function updateReminderTotal() {
  let total = 0;
  document.querySelectorAll('.reminder-inv-chk:checked').forEach(chk => {
    const inv = DB.invoices.find(i => i.id == chk.dataset.id);
    if (inv) total += parseFloat(inv.amount) - getPaidAmount(inv.id);
  });
  const count = document.querySelectorAll('.reminder-inv-chk:checked').length;
  document.getElementById('reminder-total-row').textContent =
    count ? `Selected ${count} invoice${count>1?'s':''} — Total Due: ₹${fmt(total)}` : 'No invoices selected';
}

function buildReminderMessage() {
  const selected = [];
  document.querySelectorAll('.reminder-inv-chk:checked').forEach(chk => {
    const inv = DB.invoices.find(i => i.id == chk.dataset.id);
    if (inv) selected.push(inv);
  });
  if (!selected.length) { toast('Please select at least one invoice.', 'error'); return null; }
  const totalDue = selected.reduce((s, inv) => s + (parseFloat(inv.amount) - getPaidAmount(inv.id)), 0);
  const lines = selected.map(inv => {
    const due = parseFloat(inv.amount) - getPaidAmount(inv.id);
    return `  • Inv# ${inv.invNo}  |  Date: ${inv.date}  |  Amt: ₹${fmt(inv.amount)}  |  Due: ₹${fmt(due)}`;
  }).join('\n');
  return `Dear ${reminderTarget.name},\n\nThis is a payment reminder from Mauli Enterprises.\n\nOutstanding Invoice${selected.length>1?'s':''}:\n${lines}\n\nTotal Amount Due: ₹${fmt(totalDue)}\n\nKindly arrange the payment at the earliest.\n\nThank you,\nMauli Enterprises`;
}

function sendReminderWhatsApp() {
  if (!reminderTarget?.phone) return toast('No phone number on record.', 'error');
  const msg = buildReminderMessage();
  if (!msg) return;
  const phone = reminderTarget.phone.replace(/\D/g,'');
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
  addLog('edit', `WhatsApp reminder sent to ${reminderTarget.name}`);
  closeModal('modal-reminder');
}

function sendReminderEmail() {
  if (!reminderTarget?.email) return toast('No email address on record.', 'error');
  const msg = buildReminderMessage();
  if (!msg) return;
  window.open(`mailto:${reminderTarget.email}?subject=${encodeURIComponent('Payment Reminder — Mauli Enterprises')}&body=${encodeURIComponent(msg)}`, '_blank');
  addLog('edit', `Email reminder sent to ${reminderTarget.name}`);
  closeModal('modal-reminder');
}

function sendWhatsApp() { sendReminderWhatsApp(); }
function sendEmail()    { sendReminderEmail(); }

// ── Export ───────────────────────────────────────────────────
function exportCustomers() {
  const search = document.getElementById('cust-search')?.value.toLowerCase() || '';
  let list = DB.customers.filter(c => {
    const match = [c.name, c.phone, c.email, c.city, c.company].join(' ').toLowerCase().includes(search);
    if (!match) return false;
    if (custFilter === 'all') return true;
    return getCustomerStatus(c.id) === custFilter;
  }).sort((a,b) => a.name.localeCompare(b.name,'en-IN'));
  if (!list.length) return toast('No customers to export.','error');
  const data = list.map(c => ({
    'Name *':           c.name,
    'Phone *':          c.phone,
    'Email':            c.email || '',
    'Company':          c.company || '',
    'Pincode':          c.city || '',
    'Address':          c.address || '',
    'GST':              c.gst || '',
    'CreditDays':       c.creditDays || 60,
    'WhatsappReminder': c.whatsapp ? 'yes' : 'no',
    'EmailReminder':    c.emailRem  ? 'yes' : 'no'
  }));
  exportStyledXLSX(data, 'Customers_MauliEnt', 'Customers');
}
