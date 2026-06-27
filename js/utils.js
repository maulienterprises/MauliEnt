// ============================================================
// js/utils.js — Shared utility functions
// ============================================================

// ── Format helpers ──────────────────────────────────────────
function fmt(n) {
  return parseFloat(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function today() {
  return new Date().toISOString().split('T')[0];
}

function fmtDate(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return d; }
}

// Convert YYYY-MM-DD → DD-MM-YYYY for exports
function fmtDateExport(d) {
  if (!d) return '';
  const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? m[3] + '-' + m[2] + '-' + m[1] : d;
}

// Parse YYYY-MM-DD as LOCAL date (avoids UTC/IST timezone shift)
function parseLocalDate(dateStr) {
  if (!dateStr) return new Date(NaN);
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(dateStr);
}

// Handle Excel date serial numbers or various string formats
function fmtExcelDate(v) {
  if (!v) return today();
  if (typeof v === 'number') {
    const d = new Date((v - 25569) * 86400 * 1000);
    return d.toISOString().split('T')[0];
  }
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) return mdy[3] + '-' + mdy[1].padStart(2,'0') + '-' + mdy[2].padStart(2,'0');
  const dmy = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dmy) return dmy[3] + '-' + dmy[2].padStart(2,'0') + '-' + dmy[1].padStart(2,'0');
  return s;
}

// Sort invoice numbers numerically: INV-2425-1, INV-2425-10, INV-2425-157
function invNoSortKey(invNo) {
  return String(invNo || '').split('-').map((p, i) => {
    const n = parseInt(p);
    return isNaN(n) ? p.toLowerCase() : String(n).padStart(10, '0');
  }).join('-');
}

// ── Financial Year helpers ──────────────────────────────────
function getFYTag(dateStr) {
  // Returns e.g. "2425" for FY 2024-25 (Apr 2024 – Mar 2025)
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const fyStart = m >= 4 ? y : y - 1;
  return String(fyStart).slice(-2) + String(fyStart + 1).slice(-2);
}

function populateFYFilter(selectId, dates) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const fySet = new Set();
  dates.forEach(d => { try { if (d) fySet.add(getFYTag(d)); } catch(e) {} });
  const fyList = Array.from(fySet).sort().reverse();
  const prev = sel.value;
  sel.innerHTML = '<option value="all">All Years</option>' +
    fyList.map(fy => `<option value="${fy}">F.Y. 20${fy.slice(0,2)}-${fy.slice(2)}</option>`).join('');
  sel.value = (prev === 'all' || prev === '') ? 'all' : (fyList.includes(prev) ? prev : 'all');
}

function getNextReceiptNo(dateStr) {
  const fyTag  = getFYTag(dateStr);
  const prefix = 'RC-' + fyTag + '-';
  const seen   = new Set();
  let max = 0;
  DB.payments.forEach(p => {
    if (!p.receiptNo) return;
    const rn = String(p.receiptNo);
    if (seen.has(rn)) return;
    seen.add(rn);
    if (rn.startsWith(prefix)) {
      const n = parseInt(rn.slice(prefix.length)) || 0;
      if (n > max) max = n;
    }
  });
  return prefix + String(max + 1).padStart(4, '0');
}

// ── Toast notification ──────────────────────────────────────
function toast(msg, type = 'info') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast ${type} show`;
  setTimeout(() => t.className = 'toast', 3000);
}

// ── Modal helpers ───────────────────────────────────────────
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
  document.querySelectorAll('#' + id + ' button[id^="btn-save"]').forEach(btn => btnGuardReset(btn.id));
}

// ── Confirm dialog ──────────────────────────────────────────
function confirmDialog({ title = 'Are you sure?', msg = '', type = 'danger', okLabel = 'Confirm', cancelLabel = 'Cancel' } = {}) {
  return new Promise(resolve => {
    const overlay   = document.getElementById('confirm-overlay');
    const iconEl    = document.getElementById('confirm-icon');
    const titleEl   = document.getElementById('confirm-title');
    const msgEl     = document.getElementById('confirm-msg');
    const okBtn     = document.getElementById('confirm-ok-btn');
    const cancelBtn = document.getElementById('confirm-cancel-btn');
    const icons     = { danger: '🗑️', warning: '⚠️', info: 'ℹ️' };
    iconEl.textContent = icons[type] || '⚠️';
    iconEl.className   = 'confirm-icon ' + (type || 'warning');
    titleEl.textContent = title;
    msgEl.textContent   = msg;
    cancelBtn.textContent = cancelLabel;
    okBtn.textContent = okLabel;
    okBtn.className   = 'btn ' + (type === 'danger' ? 'btn-danger' : 'btn-primary');
    overlay.classList.add('open');
    function finish(result) {
      overlay.classList.remove('open');
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      overlay.removeEventListener('click', onBackdrop);
      resolve(result);
    }
    function onOk()      { finish(true);  }
    function onCancel()  { finish(false); }
    function onBackdrop(e) { if (e.target === overlay) finish(false); }
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    overlay.addEventListener('click', onBackdrop);
  });
}

// ── Live clock in topbar ────────────────────────────────────
function startClock() {
  const label = document.getElementById('sync-label');
  if (!label) return;
  function tick() {
    const now = new Date();
    const d = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const t = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    label.textContent = d + '  ' + t;
  }
  tick();
  setInterval(tick, 1000);
}

// ── Reload stale data banner ────────────────────────────────
function reloadStaleData() {
  document.getElementById('stale-tab-banner').style.display = 'none';
  toast('Data is live via Supabase.', 'info');
}

// ── Export helpers ──────────────────────────────────────────
function exportXLSX(data, filename) {
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Data');
  XLSX.writeFile(wb, filename + '.xlsx');
}

function exportStyledXLSX(data, filename, sheetLabel) {
  if (!data || !data.length) return;
  const ACCENT   = 'FF1A6FD4', ACCENT2 = 'FF1355A8', WHITE = 'FFFFFFFF';
  const ROW_EVEN = 'FFF0F4FA', ROW_ODD  = 'FFFFFFFF';
  const BORDER_C = 'FFCBD5E1', TEXT    = 'FF1E293B';
  const headers = Object.keys(data[0]);
  const aoa = [headers, ...data.map(r => headers.map(h => r[h]))];
  const ws  = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = headers.map(h => {
    const maxData = data.reduce((m, r) => Math.max(m, String(r[h] || '').length), 0);
    return { wch: Math.min(50, Math.max(h.length + 2, maxData + 2)) };
  });
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };
  const range = XLSX.utils.decode_range(ws['!ref']);
  for (let R = range.s.r; R <= range.e.r; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      if (!ws[addr]) ws[addr] = { t: 's', v: '' };
      const thin = { style: 'thin', color: { rgb: BORDER_C } };
      const border = { top: thin, bottom: thin, left: thin, right: thin };
      if (R === 0) {
        ws[addr].s = { fill: { patternType: 'solid', fgColor: { rgb: ACCENT } }, font: { bold: true, color: { rgb: WHITE }, name: 'Arial', sz: 10 }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border: { top: thin, bottom: { style: 'medium', color: { rgb: ACCENT2 } }, left: thin, right: thin } };
      } else {
        ws[addr].s = { fill: { patternType: 'solid', fgColor: { rgb: R % 2 === 0 ? ROW_EVEN : ROW_ODD } }, font: { name: 'Arial', sz: 9, color: { rgb: TEXT } }, alignment: { horizontal: 'left', vertical: 'center' }, border };
      }
    }
  }
  // Format date columns
  headers.map((h, i) => /date/i.test(h) ? i : -1).filter(i => i >= 0).forEach(C => {
    for (let R = 1; R <= range.e.r; R++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      if (ws[addr] && ws[addr].v) {
        const m = String(ws[addr].v).match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (m) { ws[addr].t = 's'; ws[addr].v = m[3] + '-' + m[2] + '-' + m[1]; delete ws[addr].z; }
      }
    }
  });
  ws['!sheetView'] = [{ state: 'normal', showGridLines: false }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetLabel || 'Data');
  XLSX.writeFile(wb, filename + '_' + new Date().toISOString().slice(0, 10) + '.xlsx');
}

// ── Print window builder ────────────────────────────────────
const MAULI_LETTERHEAD = {
  name:    'Mauli Enterprises',
  address: 'Sonar Galli, At Po. Tal. Lanja, Ratnagiri, Maharashtra - 416701',
  gstin:   '27EQLPK0131H1ZZ',
  email:   'maulienterprises125@gmail.com',
  phone:   '7972848641'
};

function buildPrintWindow(htmlContent, customerEmail, customerPhone) {
  const win = window.open('', '_blank', 'width=800,height=900');
  const emailBtn = customerEmail
    ? `<button onclick="sendEmail()" class="act-btn email-btn">✉ Email to Customer</button>`
    : `<button disabled class="act-btn email-btn" style="opacity:0.45;cursor:not-allowed">✉ Email to Customer</button>`;
  const waBtn = customerPhone
    ? `<button onclick="sendWhatsApp()" class="act-btn wa-btn">📲 WhatsApp</button>`
    : `<button disabled class="act-btn wa-btn" style="opacity:0.45;cursor:not-allowed">📲 WhatsApp</button>`;
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
  <title>MAULI ENTERPRISES</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    html,body{height:100%}
    body{font-family:'Segoe UI',Arial,sans-serif;color:#1e293b;padding:28px;font-size:13px;display:flex;flex-direction:column;min-height:100vh}
    .print-body{flex:1}
    .header{display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #1a6fd4;padding-bottom:14px;margin-bottom:18px}
    .co-name{font-size:20px;margin-bottom:2px;font-family:'Arial Narrow',Arial,sans-serif;letter-spacing:0.03em}
    .co-name .m{font-weight:700;color:#000}.co-name .e{font-weight:400;color:#9c1c1c}
    .co-prop{font-size:11px;color:#64748b;line-height:1.5;margin-bottom:1px}
    .co-sub{font-size:11px;color:#64748b;line-height:1.7}
    .logo{width:56px;height:56px;border-radius:8px;object-fit:contain}
    .section-title{font-size:15px;font-weight:700;color:#1355a8;margin:16px 0 10px;padding-bottom:4px;border-bottom:1px solid #cbd5e1}
    table{width:100%;border-collapse:collapse;margin-bottom:16px;font-size:12px}
    th{background:#e8f0fc;color:#1a4a8a;padding:8px 10px;text-align:left;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:0.4px}
    td{padding:8px 10px;border-bottom:1px solid #e2e8f0;vertical-align:middle}
    tr:last-child td{border-bottom:none}
    .badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700}
    .paid{background:#2ecc7120;color:#16a34a}.pending{background:#f39c1220;color:#d97706}.overdue{background:#e74c3c20;color:#dc2626}.partial{background:#4f8ef720;color:#1a6fd4}
    .total-row{background:#f8faff;font-weight:700}
    .footer{border-top:1px solid #cbd5e1;padding-top:10px;font-size:11px;color:#64748b;text-align:center;margin-top:auto}
    .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;font-size:12px}
    .info-box{background:#f8faff;border:1px solid #e2e8f0;border-radius:8px;padding:10px 14px}
    .info-box label{font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.4px;display:block;margin-bottom:3px}
    .info-box strong{font-size:13px;color:#1e293b}
    .action-bar{display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap}
    .wa-note{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:9px 14px;font-size:11.5px;color:#15803d;margin-bottom:16px;display:none;line-height:1.6}
    .act-btn{border:none;border-radius:8px;padding:9px 18px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit}
    .print-btn{background:#16a34a;color:#fff}.email-btn{background:#1a6fd4;color:#fff}.wa-btn{background:#25d366;color:#fff}
    @page{size:A4;margin:18mm 15mm}
    @media print{.action-bar,.wa-note{display:none}body{padding:0;display:block}.footer{position:fixed;bottom:0;left:0;right:0;border-top:1px solid #cbd5e1;padding:8px 15mm;background:#fff;margin:0}}
  </style></head><body><div class="print-body">
  <div class="action-bar">
    <button onclick="window.print()" class="act-btn print-btn">🖨 Print / Save PDF</button>
    ${emailBtn}${waBtn}
  </div>
  <div class="wa-note" id="wa-note">ℹ️ <strong>Step 1:</strong> Save as PDF via Print → "Save as PDF".<br><strong>Step 2:</strong> WhatsApp will open — attach and send.</div>
  ${htmlContent}
  </div>
  <script>
    var _email=${customerEmail ? JSON.stringify(customerEmail) : 'null'};
    var _phone=${customerPhone ? JSON.stringify(String(customerPhone).replace(/\\D/g,'')) : 'null'};
    function sendEmail(){if(!_email)return alert('No email on record.');window.open('mailto:'+_email+'?subject='+encodeURIComponent('Document from MAULI ENTERPRISES')+'&body='+encodeURIComponent('Dear Customer,\\n\\nPlease find your document from Mauli Enterprises attached.\\n\\nRegards,\\nMauli Enterprises'));}
    function sendWhatsApp(){if(!_phone)return alert('No phone on record.');document.getElementById('wa-note').style.display='block';setTimeout(function(){window.open('https://wa.me/'+_phone+'?text='+encodeURIComponent('Dear Customer,\\n\\nPlease find your document from *MAULI ENTERPRISES* attached.\\n\\nThank you,\\nMauli Enterprises'),'_blank');},800);}
  <\/script>
  </body></html>`);
  win.document.close();
}

// ── Import modal helpers ────────────────────────────────────
function showImportLoading(icon, label, sub) {
  document.getElementById('import-upload-area').style.display = 'none';
  document.getElementById('import-footer').style.display = 'none';
  document.getElementById('import-loading').style.display = 'block';
  document.getElementById('import-loading-icon').textContent = icon;
  document.getElementById('import-loading-label').textContent = label;
  document.getElementById('import-loading-sub').textContent = sub;
  setImportProgress(0);
}
function setImportProgress(pct, label, sub) {
  document.getElementById('import-progress-bar').style.width = pct + '%';
  document.getElementById('import-progress-text').textContent = Math.round(pct) + '%';
  if (label) document.getElementById('import-loading-label').textContent = label;
  if (sub)   document.getElementById('import-loading-sub').textContent = sub;
}
function resetImportModal() {
  document.getElementById('import-upload-area').style.display = '';
  document.getElementById('import-footer').style.display = '';
  document.getElementById('import-loading').style.display = 'none';
  document.getElementById('import-file').value = '';
  setImportProgress(0);
}

// ── Toggle customer filter clear button ─────────────────────
function toggleCustClear(selectId, btnId) {
  const sel = document.getElementById(selectId);
  const btn = document.getElementById(btnId);
  if (sel && btn) btn.style.display = sel.value ? 'inline-flex' : 'none';
}
