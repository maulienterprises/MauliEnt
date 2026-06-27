// ============================================================
// tabs/expenses.js — Expense CRUD, render, export
// ============================================================

function toggleExpOther() {
  const cat = document.getElementById('exp-category')?.value;
  const box = document.getElementById('exp-other-box');
  if (box) box.style.display = cat === 'Other' ? 'block' : 'none';
}

function openExpenseModal(id = null) {
  editingExpenseId = id;
  const exp = id ? (DB.expenses||[]).find(e => e.id === id) : null;
  document.getElementById('exp-modal-title').textContent = id ? 'Edit Expense' : 'Add Expense';
  document.getElementById('exp-date').value     = exp?.date     || today();
  document.getElementById('exp-category').value = exp?.category || 'Petrol';
  document.getElementById('exp-amount').value   = exp?.amount   || '';
  document.getElementById('exp-mode').value     = exp?.mode     || 'UPI';
  document.getElementById('exp-by').value       = exp?.by       || '';
  document.getElementById('exp-desc').value     = exp?.description || '';
  if (exp?.category === 'Other') {
    document.getElementById('exp-other-box').style.display = 'block';
    document.getElementById('exp-other-text').value = exp?.otherCategory || '';
  } else {
    document.getElementById('exp-other-box').style.display = 'none';
    document.getElementById('exp-other-text').value = '';
  }
  openModal('modal-expense');
}

async function saveExpense() {
  let category = document.getElementById('exp-category').value;
  if (category === 'Other') {
    const other = document.getElementById('exp-other-text').value.trim();
    if (!other) return toast('Please specify the category.', 'error');
    category = other;
  }
  const date   = document.getElementById('exp-date').value;
  const amount = parseFloat(document.getElementById('exp-amount').value);
  const mode   = document.getElementById('exp-mode').value;
  const by     = document.getElementById('exp-by').value.trim();
  const desc   = document.getElementById('exp-desc').value.trim();
  if (!date)              return toast('Date required.', 'error');
  if (!category)          return toast('Category required.', 'error');
  if (isNaN(amount)||amount<=0) return toast('Valid amount required.', 'error');
  if (!by)                return toast('Please enter who made the expense.', 'error');
  btnGuard('btn-save-expense');
  if (!DB.expenses) DB.expenses = [];
  const data = { date, category, description: desc, amount, mode, by };
  if (editingExpenseId) {
    const idx = DB.expenses.findIndex(e => e.id === editingExpenseId);
    DB.expenses[idx] = { ...DB.expenses[idx], ...data };
    await addLog('edit', `Edited expense: ${category} ₹${fmt(amount)} by ${by}`);
    toast('Expense updated!', 'success');
  } else {
    data.id = uniqueId();
    DB.expenses.push(data);
    await addLog('create', `Added expense: ${category} ₹${fmt(amount)} by ${by}`);
    toast('Expense saved!', 'success');
  }
  try {
    await save('expenses');
    closeModal('modal-expense');
    renderExpenses();
  } catch(e) {
    btnGuardReset('btn-save-expense');
    toast('❌ Failed to save expense: ' + e.message, 'error');
  }
}

async function deleteExpense(id) {
  const exp = (DB.expenses||[]).find(e => e.id === id);
  if (!await confirmDialog({ title:'Delete Expense', msg:`Delete "${exp?.category}" — ₹${fmt(exp?.amount)}?`, type:'danger', okLabel:'Delete Expense' })) return;
  await deleteDoc('expenses', id);
  DB.expenses = (DB.expenses||[]).filter(e => e.id !== id);
  await addLog('delete', `Deleted expense: ${exp?.category} ₹${fmt(exp?.amount)}`);
  toast('Expense deleted.', 'error');
  renderExpenses();
}

async function deleteAllExpenses() {
  if (!await confirmDialog({ title:'Delete All Expenses', msg:'This will permanently delete all expense records from Supabase. This cannot be undone.', type:'danger', okLabel:'Delete All' })) return;
  if (_db) { try { await _db.from('expenses').delete().neq('id',0); } catch(e) { console.error(e); } }
  DB.expenses = [];
  await addLog('delete', 'Deleted ALL expenses');
  toast('All expenses deleted.', 'error');
  renderExpenses();
}

function clearExpDateFilter() {
  const f = document.getElementById('exp-date-from'); if (f) f.value='';
  const t = document.getElementById('exp-date-to');   if (t) t.value='';
  renderExpenses();
}

function renderExpenses() {
  if (!DB.expenses) DB.expenses = [];
  populateFYFilter('exp-fy-filter', DB.expenses.map(e => e.date));
  const selectedFY = document.getElementById('exp-fy-filter')?.value || 'all';
  const search     = document.getElementById('exp-search')?.value.toLowerCase() || '';
  const catF       = document.getElementById('exp-cat-filter')?.value || '';
  const modeF      = document.getElementById('exp-mode-filter')?.value || '';
  const dateFrom   = document.getElementById('exp-date-from')?.value || '';
  const dateTo     = document.getElementById('exp-date-to')?.value || '';
  const tbody      = document.getElementById('exp-table');
  if (!tbody) return;

  const validCategories = ['Petrol','Hotel','Electricity','Professional Fees','Repair & Maintenance'];

  let list = DB.expenses.filter(e => {
    if (selectedFY !== 'all') { try { if (getFYTag(e.date)!==selectedFY) return false; } catch { return false; } }
    if (![e.category, e.description, e.by, e.mode].join(' ').toLowerCase().includes(search)) return false;
    if (catF) {
      if (catF === 'Other') { if (validCategories.includes(e.category)) return false; }
      else { if (e.category !== catF) return false; }
    }
    if (modeF   && e.mode !== modeF) return false;
    if (dateFrom && e.date < dateFrom) return false;
    if (dateTo   && e.date > dateTo)   return false;
    return true;
  }).sort((a,b) => new Date(b.date) - new Date(a.date));

  const total = list.reduce((s,e) => s + parseFloat(e.amount||0), 0);
  const countEl = document.getElementById('exp-stat-count');
  const totalEl = document.getElementById('exp-stat-total');
  if (countEl) countEl.textContent = list.length;
  if (totalEl) totalEl.textContent = '₹' + fmt(total);

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="icon">💸</div><p>No expenses found.</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = list.map(e => `<tr>
    <td>${fmtDate(e.date)}</td>
    <td><span class="badge badge-partial">${e.category}</span></td>
    <td style="color:var(--muted)">${e.description||'—'}</td>
    <td style="color:var(--danger);font-weight:600">₹${fmt(e.amount)}</td>
    <td>${e.mode}</td>
    <td>${e.by||'—'}</td>
    <td><div class="action-btns">
      <button class="btn btn-outline btn-xs" onclick="openExpenseModal(${e.id})">✏️ Edit</button>
      <button class="btn btn-danger btn-xs" onclick="deleteExpense(${e.id})">🗑</button>
    </div></td>
  </tr>`).join('');
}

function exportExpenses() {
  if (!DB.expenses?.length) return toast('No expenses to export.','error');
  const data = DB.expenses.map(e => ({
    'Date *': fmtDateExport(e.date), 'Category *': e.category, 'Description': e.description||'',
    'Amount *': parseFloat(e.amount), 'Mode *': e.mode, 'DoneBy': e.by||''
  }));
  exportStyledXLSX(data, 'Expenses_MauliEnt', 'Expenses');
}
