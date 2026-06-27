// ============================================================
// tabs/overdue.js — Overdue invoices render
// ============================================================

function renderOverdue() {
  const today = new Date(); today.setHours(0,0,0,0);
  const overdue = DB.invoices.filter(inv => {
    const bal = parseFloat(inv.amount) - getPaidAmount(inv.id);
    return bal > 0 && parseLocalDate(inv.dueDate) < today;
  }).sort((a,b) => parseLocalDate(a.dueDate) - parseLocalDate(b.dueDate));

  const alertEl = document.getElementById('overdue-alert');
  if (alertEl) alertEl.style.display = overdue.length ? 'flex' : 'none';

  const tbody = document.getElementById('overdue-table');
  if (!tbody) return;
  if (!overdue.length) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="icon">✅</div><p>No overdue invoices!</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = overdue.map(inv => {
    const c         = DB.customers.find(c => String(c.id) === String(Math.round(parseFloat(inv.customerId))));
    const bal       = parseFloat(inv.amount) - getPaidAmount(inv.id);
    const daysOver  = Math.floor((today - parseLocalDate(inv.dueDate)) / 86400000);
    return `<tr>
      <td><strong>${inv.invNo}</strong></td>
      <td>${c?.name || '—'}</td>
      <td>${fmtDate(inv.dueDate)}</td>
      <td><span style="color:var(--danger);font-weight:700">${daysOver} days</span></td>
      <td style="color:var(--danger);font-weight:600">₹${fmt(bal)}</td>
      <td><div class="action-btns">
        <button class="btn btn-primary btn-xs" onclick="openPaymentModalForInvoice(${inv.id})">💳 Pay</button>
        <button class="btn btn-xs" style="background:#e74c3c20;color:var(--danger);border:1px solid #e74c3c40" onclick="openReminderModal(${inv.customerId})">🔔 Remind</button>
      </div></td>
    </tr>`;
  }).join('');
}
