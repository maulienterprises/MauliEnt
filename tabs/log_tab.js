// ============================================================
// tabs/log_tab.js — Activity Log tab render and export
// ============================================================

function renderLog() {
  const container = document.getElementById('log-container');
  if (!container) return;
  const logs = DB.log || [];
  if (!logs.length) {
    container.innerHTML = `<div class="empty-state"><div class="icon">📋</div><p>No activity log yet.</p></div>`;
    return;
  }
  container.innerHTML = logs.slice(0, 200).map(entry => {
    const actionColors = { login:'var(--accent)', create:'var(--success)', edit:'var(--warning)', delete:'var(--danger)', correction:'var(--warning)' };
    const color = actionColors[entry.action] || 'var(--muted)';
    return `<div class="log-entry ${entry.action}" style="border-left-color:${color}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
        <div>
          <span style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:${color};background:${color}15;padding:1px 7px;border-radius:6px">${entry.action}</span>
          &nbsp;
          <span style="font-size:0.83rem">${entry.detail}</span>
        </div>
        <div class="log-time" style="white-space:nowrap">
          <span style="color:var(--muted);font-size:0.72rem">${entry.user || '?'}</span>
          &nbsp;·&nbsp;
          <span class="log-time">${fmtDate(entry.time)}</span>
        </div>
      </div>
    </div>`;
  }).join('');
}

function exportLog() {
  if (!DB.log?.length) return toast('No log entries to export.', 'error');
  const data = DB.log.map(e => ({ Time: e.time, User: e.user, Role: e.role, Action: e.action, Detail: e.detail }));
  exportStyledXLSX(data, 'ActivityLog_MauliEnt', 'Activity Log');
}

async function clearLog() {
  if (!await confirmDialog({ title:'Clear Activity Log', msg:'This will permanently delete all activity log entries. This cannot be undone.', type:'danger', okLabel:'Clear Log' })) return;
  if (_db) { try { await _db.from('log').delete().neq('id', 0); } catch(e) { console.error(e); } }
  DB.log = [];
  toast('Log cleared.', 'info');
  renderLog();
}
