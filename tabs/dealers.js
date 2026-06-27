// ============================================================
// tabs/dealers.js — Dealers CRUD
// ============================================================

function openDealerModal(id = null) {
  editingDealerId = id;
  const d = id ? DB.dealers.find(d => d.id === id) : null;
  document.getElementById('dealer-modal-title').textContent = id ? 'Edit Dealer' : 'Add Dealer';
  document.getElementById('dl-name').value        = d?.name       || '';
  document.getElementById('dl-phone').value       = d?.phone      || '';
  document.getElementById('dl-email').value       = d?.email      || '';
  document.getElementById('dl-company').value     = d?.company    || '';
  document.getElementById('dl-city').value        = d?.city       || '';
  document.getElementById('dl-gst').value         = d?.gst        || '';
  document.getElementById('dl-address').value     = d?.address    || '';
  document.getElementById('dl-creditdays').value  = d?.creditDays ?? 30;
  openModal('modal-dealer');
}

async function saveDealer() {
  const name  = document.getElementById('dl-name').value.trim();
  const phone = document.getElementById('dl-phone').value.trim();
  if (!name)  return toast('Dealer name is required.', 'error');
  if (!phone) return toast('Phone is required.', 'error');
  btnGuard('btn-save-dealer');
  const data = {
    name, phone,
    email:      document.getElementById('dl-email').value.trim(),
    company:    document.getElementById('dl-company').value.trim(),
    city:       document.getElementById('dl-city').value.trim(),
    gst:        document.getElementById('dl-gst').value.trim(),
    address:    document.getElementById('dl-address').value.trim(),
    creditDays: parseInt(document.getElementById('dl-creditdays').value) || 30
  };
  if (editingDealerId) {
    const idx = DB.dealers.findIndex(d => d.id === editingDealerId);
    DB.dealers[idx] = { ...DB.dealers[idx], ...data };
    await addLog('edit', `Edited dealer: ${name}`);
    toast('Dealer updated!', 'success');
  } else {
    data.id = uniqueId();
    DB.dealers.push(data);
    await addLog('create', `Added dealer: ${name}`);
    toast('Dealer added!', 'success');
  }
  try {
    await save('dealers');
    closeModal('modal-dealer');
    renderDealers();
    updatePurDealerDropdowns();
  } catch(e) {
    btnGuardReset('btn-save-dealer');
    toast('❌ Failed to save dealer: ' + e.message, 'error');
  }
}

async function deleteDealer(id) {
  const d = DB.dealers.find(d => d.id === id);
  if (!await confirmDialog({ title:'Delete Dealer', msg:`Delete "${d?.name}"?\n\nThis will also remove their purchases, payments, and debit notes.`, type:'danger', okLabel:'Delete Dealer' })) return;
  const purIds = DB.purchases.filter(p => p.dealerId === id).map(p => p.id);
  for (const pid of purIds) { await deleteDoc('purchases', pid); }
  DB.purchpayments = DB.purchpayments.filter(pp => pp.dealerId !== id);
  DB.debitNotes    = (DB.debitNotes||[]).filter(dn => dn.dealerId !== id);
  DB.purchases     = DB.purchases.filter(p => p.dealerId !== id);
  await deleteDoc('dealers', id);
  DB.dealers = DB.dealers.filter(d => d.id !== id);
  await save('purchpayments'); await save('debitNotes');
  await addLog('delete', `Deleted dealer: ${d?.name}`);
  toast('Dealer deleted.', 'error');
  renderDealers();
}

function renderDealers() {
  const search = document.getElementById('dealer-search')?.value.toLowerCase() || '';
  const tbody  = document.getElementById('dealer-table');
  if (!tbody) return;
  let list = DB.dealers.filter(d =>
    [d.name, d.phone, d.email, d.city, d.company, d.gst].join(' ').toLowerCase().includes(search)
  ).sort((a,b) => a.name.localeCompare(b.name,'en-IN'));
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state"><div class="icon">🏪</div><p>No dealers found.</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = list.map((d, i) => `<tr>
    <td>${i+1}</td>
    <td><strong>${d.name}</strong>${d.company ? `<br><small style="color:var(--muted)">${d.company}</small>` : ''}</td>
    <td>${d.phone}</td>
    <td>${d.email||'—'}</td>
    <td>${d.city||'—'}</td>
    <td>${d.company||'—'}</td>
    <td>${d.gst||'—'}</td>
    <td>${d.creditDays||30}</td>
    <td><div class="action-btns">
      <button class="btn btn-outline btn-xs" onclick="openDealerModal(${d.id})">✏️ Edit</button>
      <button class="btn btn-danger btn-xs" onclick="deleteDealer(${d.id})">🗑</button>
    </div></td>
  </tr>`).join('');
}

function exportDealers() {
  if (!DB.dealers.length) return toast('No dealers to export.','error');
  const data = DB.dealers.map(d => ({
    'Name *': d.name, 'Phone *': d.phone, 'Email': d.email||'', 'Company': d.company||'',
    'Pincode': d.city||'', 'Address': d.address||'', 'GST': d.gst||'', 'CreditDays': d.creditDays||30
  }));
  exportStyledXLSX(data, 'Dealers_MauliEnt', 'Dealers');
}

function updatePurDealerDropdowns() {
  const sorted = [...DB.dealers].sort((a,b) => a.name.localeCompare(b.name,'en-IN'));
  const opts   = '<option value="">All Dealers</option>' + sorted.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
  ['pur-dealer-filter','pp-dealer-filter','dn-dealer-filter'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = opts;
  });
  const modalOpts = '<option value="">-- Select Dealer --</option>' + sorted.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
  ['pur-dealer-id','pp-dealer-id','dn-dealer-id'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = modalOpts;
  });
}
