// ============================================================
// tabs/backup.js — Backup, restore, clear data
// ============================================================

async function downloadFullBackup() {
  if (typeof JSZip === 'undefined') return toast('JSZip library not loaded.', 'error');
  const zip = new JSZip();
  const timestamp = new Date().toLocaleString('en-IN', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit', hour12:false }).replace(/[/:, ]+/g, '_');
  const collections = ['customers','invoices','payments','creditNotes','expenses','log','users','dealers','purchases','purchpayments','debitNotes'];
  collections.forEach(key => {
    const data = DB[key] || [];
    zip.file(`${key}.json`, JSON.stringify(data, null, 2));
  });
  zip.file('meta.json', JSON.stringify({ version:'2.0', created: new Date().toISOString(), app:'MauliEnt' }, null, 2));
  const blob = await zip.generateAsync({ type:'blob' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `Backup_MauliEnt_${timestamp}.zip`;
  a.click(); URL.revokeObjectURL(url);
  const entry = { id: Date.now(), date: new Date().toISOString(), label:'Full Backup', size: Math.round(blob.size/1024) + 'KB', user: currentUser?.username || '?' };
  DB.backupHistory.unshift(entry);
  if (DB.backupHistory.length > 20) DB.backupHistory = DB.backupHistory.slice(0, 20);
  try { localStorage.setItem('mauli_backup_history', JSON.stringify(DB.backupHistory)); } catch(e) {}
  await addLog('edit', `Downloaded full backup`);
  renderBackupHistory();
  toast('Backup downloaded!', 'success');
}

function downloadSingleBackup(key) {
  const data = DB[key] || [];
  const blob = new Blob([JSON.stringify(data, null, 2)], { type:'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `${key}_${new Date().toISOString().slice(0,10)}.json`;
  a.click(); URL.revokeObjectURL(url);
  toast(`${key} exported as JSON.`, 'success');
}

async function restoreBackup(input) {
  const file = input.files[0];
  if (!file) return;
  if (!file.name.endsWith('.zip')) return toast('Please select a valid .zip backup file.', 'error');
  if (!await confirmDialog({ title:'Restore Backup', msg:`This will overwrite ALL current data with data from "${file.name}".\n\nThis action cannot be undone. Are you sure?`, type:'danger', okLabel:'Restore Backup' })) { input.value = ''; return; }
  try {
    if (typeof JSZip === 'undefined') throw new Error('JSZip not loaded');
    const zip  = await JSZip.loadAsync(file);
    const keys = ['customers','invoices','payments','creditNotes','expenses','log','users','dealers','purchases','purchpayments','debitNotes'];
    let restored = 0;
    for (const key of keys) {
      const f = zip.file(key + '.json');
      if (f) {
        const content = await f.async('string');
        DB[key] = JSON.parse(content);
        await save(key);
        restored++;
      }
    }
    normalizeIds();
    renderAll();
    await addLog('edit', `Restored backup from file: ${file.name} (${restored} collections)`);
    toast(`✅ Restored ${restored} collections from backup!`, 'success');
  } catch(e) {
    toast('❌ Restore failed: ' + e.message, 'error');
  }
  input.value = '';
}

async function clearCollection(key) {
  const labels = { customers:'all Customers', invoices:'all Invoices', payments:'all Receipts', creditNotes:'all Credit Notes', expenses:'all Expenses', dealers:'all Dealers', purchases:'all Purchases', purchpayments:'all Purchase Payments', debitNotes:'all Debit Notes' };
  const label = labels[key] || key;
  if (!await confirmDialog({ title:`Delete ${label}`, msg:`This will permanently delete ${label} from Supabase.\n\nThis cannot be undone.`, type:'danger', okLabel:`Delete ${label}` })) return;
  if (_db) { try { await _db.from(tbl(key)).delete().neq('id', 0); } catch(e) { console.error('Supabase delete error:', e); } }
  DB[key] = [];
  try { localStorage.removeItem('mauli_' + key); } catch(e) {}
  await addLog('delete', `Cleared collection: ${key}`);
  toast(`${label} deleted from Supabase.`, 'error');
  renderAll();
}

async function clearTestData() {
  if (!await confirmDialog({ title:'Delete Everything', msg:'This will permanently delete ALL data (except user accounts) from Supabase.\n\nThis cannot be undone.', type:'danger', okLabel:'Delete Everything' })) return;
  const keys = ['customers','invoices','payments','creditNotes','expenses','dealers','purchases','purchpayments','debitNotes','log'];
  for (const key of keys) {
    if (_db) { try { await _db.from(tbl(key)).delete().neq('id', 0); } catch(e) { console.error(e); } }
    DB[key] = [];
  }
  await addLog('delete', 'Cleared ALL data (except users)');
  toast('All data deleted!', 'error');
  renderAll();
}

function renderBackupHistory() {
  const container = document.getElementById('backup-history-list');
  if (!container) return;
  const history = DB.backupHistory || [];
  if (!history.length) {
    container.innerHTML = `<div class="empty-state"><div class="icon">📋</div><p>No backup history.</p></div>`;
    return;
  }
  container.innerHTML = history.map(entry => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border)">
      <div>
        <div style="font-size:0.85rem;font-weight:600">${entry.label || 'Backup'}</div>
        <div style="font-size:0.75rem;color:var(--muted)">${fmtDate(entry.date)} &nbsp;|&nbsp; ${entry.user||'—'} &nbsp;|&nbsp; ${entry.size||'?'}</div>
      </div>
    </div>`).join('');
}
