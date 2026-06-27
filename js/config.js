// ============================================================
// js/config.js — Supabase configuration
// Replace SUPABASE_URL and SUPABASE_ANON with your new project credentials
// ============================================================

const SUPABASE_URL  = 'https://cfzogwdrmbqzplfzfctm.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNmem9nd2RybWJxenBsZnpmY3RtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1NjU5NDQsImV4cCI6MjA5NjE0MTk0NH0._cYFi4u9R6kjfBH64MsWCCgtydZ5UfaWgW8bfGX339M';

// Table name mapping (JS camelCase key → Supabase snake_case table name)
const TABLE_MAP = {
  customers:    'customers',
  invoices:     'invoices',
  payments:     'payments',
  creditNotes:  'credit_notes',
  expenses:     'expenses',
  log:          'log',
  users:        'users',
  dealers:      'dealers',
  purchases:    'purchases',
  purchpayments:'purch_payments',
  debitNotes:   'debit_notes'
};

function tbl(key) { return TABLE_MAP[key] || key; }

// Collections to load from / save to Supabase
const FS_COLLECTIONS = [
  'customers','invoices','payments','creditNotes','expenses',
  'log','users','dealers','purchases','purchpayments','debitNotes'
];

// Keys that stay local only (not in Supabase)
const LOCAL_KEYS = {
  backupHistory: 'mauli_backup_history'
};

// ── In-memory database ──────────────────────────────────────
const DB = {
  customers:    [],
  invoices:     [],
  payments:     [],
  creditNotes:  [],
  expenses:     [],
  log:          [],
  users:        [],
  dealers:      [],
  purchases:    [],
  purchpayments:[],
  debitNotes:   [],
  backupHistory:[]
};

// Supabase client — set after init
let _db = null;

function setSupabaseDB(client) {
  _db = client;
}

// ── Unique ID ───────────────────────────────────────────────
let _idSeq = 0;
function uniqueId() {
  return Date.now() * 1000 + ((++_idSeq) % 1000);
}

// ── Button loading guard ────────────────────────────────────
function btnGuard(btnId) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = true;
  btn._origText = btn.innerHTML;
  btn.innerHTML = '<svg style="width:16px;height:16px;vertical-align:middle;animation:spin 0.8s linear infinite;margin-right:6px" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="28 56" stroke-linecap="round"/></svg>' + btn._origText;
}
function btnGuardReset(btnId) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = false;
  if (btn._origText !== undefined) { btn.innerHTML = btn._origText; delete btn._origText; }
}

// ── Supabase: Save collection ───────────────────────────────
async function save(key) {
  if (key === 'backupHistory') {
    try { localStorage.setItem(LOCAL_KEYS.backupHistory, JSON.stringify(DB.backupHistory)); } catch(e) {}
    return;
  }
  try { localStorage.setItem('mauli_' + key, JSON.stringify(DB[key])); } catch(e) {}
  if (!_db) { toast('⚠ Supabase not connected. Data saved locally.', 'error'); updateSyncStatus('error'); return; }
  const items = DB[key];
  if (!Array.isArray(items)) return;
  const table = tbl(key);
  updateSyncStatus('syncing');
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const seen = new Set();
      const deduped = items.filter(row => {
        const k = String(row.id);
        if (seen.has(k)) return false;
        seen.add(k); return true;
      });
      const CHUNK = 400;
      for (let i = 0; i < deduped.length; i += CHUNK) {
        const chunk = deduped.slice(i, i + CHUNK);
        const { error } = await _db.from(table).upsert(chunk, { onConflict: 'id' });
        if (error) throw new Error(error.message);
      }
      updateSyncStatus('synced');
      if (key === 'users') { try { localStorage.setItem('mauli_users_cache', JSON.stringify(DB.users)); } catch(e) {} }
      return;
    } catch(e) {
      if (e.message && (e.message.includes('schema cache') || e.message.includes('relation') || e.message.includes('42P01'))) {
        console.warn(`Table missing: "${key}" (${tbl(key)})`);
        updateSyncStatus('error'); return;
      }
      if (attempt < 3) { await new Promise(r => setTimeout(r, 1000 * attempt)); }
      else { updateSyncStatus('error'); toast(`❌ Save failed: ${e.message}`, 'error'); }
    }
  }
}

// ── Normalize IDs (fix Supabase float64 drift) ──────────────
function normalizeIds() {
  DB.customers.forEach(c => { if (c.id != null) c.id = Math.round(parseFloat(c.id)); });
  DB.invoices.forEach(i => {
    if (i.id != null)         i.id         = Math.round(parseFloat(i.id));
    if (i.customerId != null) i.customerId = Math.round(parseFloat(i.customerId));
  });
  DB.payments.forEach(p => {
    if (p.customerId != null) p.customerId = Math.round(parseFloat(p.customerId));
    if (p.invoiceId  != null) p.invoiceId  = Math.round(parseFloat(p.invoiceId));
  });
  (DB.creditNotes || []).forEach(cn => {
    if (cn.customerId != null) cn.customerId = Math.round(parseFloat(cn.customerId));
    if (cn.invoiceId  != null) cn.invoiceId  = Math.round(parseFloat(cn.invoiceId));
  });
  (DB.dealers || []).forEach(d => { if (d.id != null) d.id = Math.round(parseFloat(d.id)); });
  (DB.purchases || []).forEach(p => {
    if (p.id != null)       p.id       = Math.round(parseFloat(p.id));
    if (p.dealerId != null) p.dealerId = Math.round(parseFloat(p.dealerId));
  });
  (DB.purchpayments || []).forEach(pp => {
    if (pp.dealerId   != null) pp.dealerId   = Math.round(parseFloat(pp.dealerId));
    if (pp.purchaseId != null) pp.purchaseId = Math.round(parseFloat(pp.purchaseId));
  });
  (DB.debitNotes || []).forEach(dn => {
    if (dn.id         != null) dn.id         = Math.round(parseFloat(dn.id));
    if (dn.dealerId   != null) dn.dealerId   = Math.round(parseFloat(dn.dealerId));
    if (dn.purchaseId != null) dn.purchaseId = Math.round(parseFloat(dn.purchaseId));
  });
}

// ── Supabase: Load all collections ─────────────────────────
async function load() {
  try { DB.backupHistory = JSON.parse(localStorage.getItem(LOCAL_KEYS.backupHistory)) || []; } catch { DB.backupHistory = []; }
  if (!_db) { console.warn('Supabase not ready'); return; }
  try {
    updateSyncStatus('syncing');
    const missingTables = [];
    for (const key of FS_COLLECTIONS) {
      const PAGE = 1000;
      let allRows = [];
      let from = 0;
      let failed = false;
      while (true) {
        const { data, error } = await _db.from(tbl(key)).select('*').range(from, from + PAGE - 1);
        if (error) {
          if (error.message && (error.message.includes('schema cache') || error.message.includes('relation') || error.code === 'PGRST116' || error.code === '42P01')) {
            missingTables.push(key);
            console.warn(`Table missing: "${key}" (${tbl(key)})`);
          } else {
            throw new Error(`Load ${key}: ${error.message}`);
          }
          failed = true; break;
        }
        if (data && data.length > 0) allRows = allRows.concat(data);
        if (!data || data.length < PAGE) break;
        from += PAGE;
      }
      if (!failed) {
        const seen = new Set();
        DB[key] = allRows.filter(row => { const k = String(row.id); if (seen.has(k)) return false; seen.add(k); return true; });
      }
    }
    DB.log.sort((a, b) => new Date(b.time) - new Date(a.time));
    normalizeIds();
    updateSyncStatus(missingTables.length > 0 ? 'error' : 'synced');
    if (missingTables.length > 0) console.warn('Missing tables:', missingTables.map(k => tbl(k)));
  } catch(e) {
    console.error('Supabase load error:', e);
    updateSyncStatus('error');
    ['customers','invoices','payments','creditNotes','log'].forEach(k => {
      try { DB[k] = JSON.parse(localStorage.getItem('mauli_' + k)) || []; } catch { DB[k] = []; }
    });
  }
}

// ── Supabase: Delete a single document ─────────────────────
async function deleteDoc(key, id) {
  if (!_db) return;
  try {
    const { error } = await _db.from(tbl(key)).delete().eq('id', id);
    if (error) throw new Error(error.message);
  } catch(e) { console.error('Supabase delete error:', e); }
}

// ── Chunked save for large imports ─────────────────────────
async function saveChunked(key, newItems) {
  if (!_db) {
    try { localStorage.setItem('mauli_' + key, JSON.stringify(DB[key])); } catch(e) {}
    toast('⚠ Supabase not connected. Saved locally.', 'error'); return;
  }
  const CHUNK = 400;
  const total = newItems.length;
  updateSyncStatus('syncing');
  for (let i = 0; i < total; i += CHUNK) {
    const chunk = newItems.slice(i, i + CHUNK);
    const { error } = await _db.from(tbl(key)).upsert(chunk, { onConflict: 'id' });
    if (error) console.error('Chunked save error:', error.message);
    const pct = Math.min(100, Math.round(((i + chunk.length) / total) * 100));
    setImportProgress(40 + pct * 0.6, `Uploading… (${i + chunk.length} / ${total})`, `Batch ${Math.ceil((i + CHUNK) / CHUNK)} of ${Math.ceil(total / CHUNK)}`);
    await new Promise(r => setTimeout(r, 30));
  }
  updateSyncStatus('synced');
}

// ── Realtime listeners ──────────────────────────────────────
const _unsubscribers = [];

function startRealtimeListeners() {
  if (!_db) return;
  stopRealtimeListeners();
  const liveKeys = ['customers', 'invoices', 'payments', 'creditNotes'];
  liveKeys.forEach(key => {
    const channel = _db
      .channel('tbl-' + key)
      .on('postgres_changes', { event: '*', schema: 'public', table: tbl(key) }, async () => {
        const PAGE = 1000; let allRows = []; let from = 0;
        while (true) {
          const { data, error } = await _db.from(tbl(key)).select('*').range(from, from + PAGE - 1);
          if (error || !currentUser) break;
          if (data && data.length > 0) allRows = allRows.concat(data);
          if (!data || data.length < PAGE) break;
          from += PAGE;
        }
        if (currentUser && allRows.length > 0) {
          DB[key] = allRows; normalizeIds(); renderAll(); updateSyncStatus('synced');
        }
      })
      .subscribe(status => {
        if (status === 'SUBSCRIBED') updateSyncStatus('synced');
        else if (['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)) updateSyncStatus('syncing');
      });
    _unsubscribers.push(() => _db.removeChannel(channel));
  });
  if (currentUser?.role === 'dev') {
    const channel = _db.channel('tbl-log')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'log' }, async () => {
        const { data } = await _db.from('log').select('*');
        if (data) { DB.log = data.sort((a,b) => new Date(b.time) - new Date(a.time)); renderLog(); }
      }).subscribe();
    _unsubscribers.push(() => _db.removeChannel(channel));
  }
}

function stopRealtimeListeners() {
  _unsubscribers.forEach(u => u());
  _unsubscribers.length = 0;
}

// ── Sync status indicator ───────────────────────────────────
function updateSyncStatus(state) {
  const dot = document.getElementById('sync-dot');
  if (!dot) return;
  if (state === 'synced') {
    dot.style.background = 'var(--success)'; dot.style.animation = 'none'; dot.title = 'Supabase synced';
  } else if (state === 'syncing') {
    dot.style.background = 'var(--warning)'; dot.style.animation = 'none'; dot.title = 'Syncing…';
  } else if (state === 'error') {
    dot.style.background = 'var(--danger)'; dot.style.animation = 'pulse-red 1s infinite'; dot.title = 'Sync error';
  }
}
