// ============================================================
// tabs/dashboard.js — Dashboard stats, yearwise summary
// ============================================================

function renderDashboard() {
  // ── Sales side stats ──────────────────────────────────────
  const totalInvoiced  = DB.invoices.reduce((s,i) => s + parseFloat(i.amount||0), 0);
  const totalReceived  = DB.payments.filter(p => p.method!=='Cancelled'&&p.method!=='Cash Discount').reduce((s,p) => s + parseFloat(p.amount||0), 0);
  const totalDiscount  = DB.payments.filter(p => p.method==='Cash Discount').reduce((s,p) => s + parseFloat(p.amount||0), 0);
  const totalCN        = (DB.creditNotes||[]).reduce((s,cn) => s + parseFloat(cn.amount||0), 0);
  const totalOutstanding = totalInvoiced - totalReceived - totalDiscount - totalCN;

  const el = id => document.getElementById(id);
  if (el('stat-customers'))  el('stat-customers').textContent  = DB.customers.length;
  if (el('stat-invoiced'))   el('stat-invoiced').textContent   = '₹' + fmt(totalInvoiced);
  if (el('stat-received'))   el('stat-received').textContent   = '₹' + fmt(totalReceived + totalDiscount + totalCN);
  if (el('stat-outstanding'))el('stat-outstanding').textContent= '₹' + fmt(Math.max(0, totalOutstanding));

  // ── Yearwise Sales Summary ────────────────────────────────
  const fyMap = {};
  DB.invoices.forEach(inv => {
    try {
      const fy = getFYTag(inv.date);
      if (!fyMap[fy]) fyMap[fy] = { invoiced:0, received:0 };
      fyMap[fy].invoiced += parseFloat(inv.amount||0);
      fyMap[fy].received += getPaidAmount(inv.id);
    } catch(e) {}
  });
  const fySorted = Object.keys(fyMap).sort().reverse();
  let cumulativeOS = 0;
  const fyRowsReversed = fySorted.map(fy => {
    const { invoiced, received } = fyMap[fy];
    const fyOS = invoiced - received;
    cumulativeOS += fyOS;
    return { fy, invoiced, received, fyOS, cumulativeOS: cumulativeOS };
  });
  const yearwiseTbody = el('dash-yearwise');
  if (yearwiseTbody) {
    if (!fySorted.length) {
      yearwiseTbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:16px">No invoices yet.</td></tr>`;
    } else {
      yearwiseTbody.innerHTML = fyRowsReversed.map(r => `<tr>
        <td><strong>F.Y. 20${r.fy.slice(0,2)}-${r.fy.slice(2)}</strong></td>
        <td>₹${fmt(r.invoiced)}</td>
        <td style="color:var(--success)">₹${fmt(r.received)}</td>
        <td style="color:${r.fyOS>0?'var(--danger)':'var(--success)'}">₹${fmt(r.fyOS)}</td>
        <td style="color:${r.cumulativeOS>0?'var(--danger)':'var(--success)'}">₹${fmt(r.cumulativeOS)}</td>
      </tr>`).join('');
    }
  }

  // ── Yearwise Purchase Summary ─────────────────────────────
  const purFyMap = {};
  DB.purchases.forEach(pur => {
    try {
      const fy = getFYTag(pur.date || pur.billDate);
      if (!purFyMap[fy]) purFyMap[fy] = { purchased:0, paid:0 };
      purFyMap[fy].purchased += parseFloat(pur.amount||0);
      purFyMap[fy].paid      += getPurchasePaidAmount(pur.id);
    } catch(e) {}
  });
  const purFySorted = Object.keys(purFyMap).sort().reverse();
  let purCumulOS = 0;
  const purFyRows = purFySorted.map(fy => {
    const { purchased, paid } = purFyMap[fy];
    const fyOS = purchased - paid;
    purCumulOS += fyOS;
    return { fy, purchased, paid, fyOS, cumulativeOS: purCumulOS };
  });
  const purYearwiseTbody = el('dash-yearwise-purchases');
  if (purYearwiseTbody) {
    if (!purFySorted.length) {
      purYearwiseTbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:16px">No purchases yet.</td></tr>`;
    } else {
      purYearwiseTbody.innerHTML = purFyRows.map(r => `<tr>
        <td><strong>F.Y. 20${r.fy.slice(0,2)}-${r.fy.slice(2)}</strong></td>
        <td>₹${fmt(r.purchased)}</td>
        <td style="color:var(--success)">₹${fmt(r.paid)}</td>
        <td style="color:${r.fyOS>0?'var(--danger)':'var(--success)'}">₹${fmt(r.fyOS)}</td>
        <td style="color:${r.cumulativeOS>0?'var(--danger)':'var(--success)'}">₹${fmt(r.cumulativeOS)}</td>
      </tr>`).join('');
    }
  }

  // ── Recent Invoices ───────────────────────────────────────
  const recent = [...DB.invoices].sort((a,b) => new Date(b.date) - new Date(a.date)).slice(0,5);
  const recentTbody = el('dash-recent');
  if (recentTbody) {
    const statusMap = { paid:'badge-paid', pending:'badge-pending', partial:'badge-partial', overdue:'badge-overdue' };
    recentTbody.innerHTML = !recent.length
      ? `<tr><td colspan="3" style="text-align:center;color:var(--muted);padding:12px">No invoices yet.</td></tr>`
      : recent.map(inv => {
          const c = DB.customers.find(c => String(c.id) === String(Math.round(parseFloat(inv.customerId))));
          const status = getInvoiceStatus(inv);
          return `<tr><td><strong>${inv.invNo}</strong><br><small style="color:var(--muted)">${c?.name||'—'}</small></td><td>₹${fmt(inv.amount)}</td><td><span class="badge ${statusMap[status]}">${status}</span></td></tr>`;
        }).join('');
  }

  // ── Overdue summary ───────────────────────────────────────
  const todayD = new Date(); todayD.setHours(0,0,0,0);
  const overdue = DB.invoices.filter(inv => {
    const bal = parseFloat(inv.amount) - getPaidAmount(inv.id);
    return bal > 0 && parseLocalDate(inv.dueDate) < todayD;
  }).sort((a,b) => parseLocalDate(a.dueDate) - parseLocalDate(b.dueDate)).slice(0,5);

  const overdueTbody = el('dash-overdue');
  if (overdueTbody) {
    overdueTbody.innerHTML = !overdue.length
      ? `<tr><td colspan="3" style="text-align:center;color:var(--success);padding:12px">✅ No overdue invoices!</td></tr>`
      : overdue.map(inv => {
          const c        = DB.customers.find(c => String(c.id) === String(Math.round(parseFloat(inv.customerId))));
          const bal      = parseFloat(inv.amount) - getPaidAmount(inv.id);
          const daysOver = Math.floor((todayD - parseLocalDate(inv.dueDate)) / 86400000);
          return `<tr>
            <td><strong>${inv.invNo}</strong><br><small style="color:var(--muted)">${c?.name||'—'}</small></td>
            <td><span style="color:var(--danger);font-weight:700">${daysOver}d</span></td>
            <td style="color:var(--danger)">₹${fmt(bal)}</td>
          </tr>`;
        }).join('');
  }
}
