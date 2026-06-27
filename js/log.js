// ============================================================
// js/log.js — Activity log writer
// ============================================================

async function addLog(action, detail, extra) {
  if (!currentUser) return;
  const entry = {
    id:     uniqueId(),
    time:   new Date().toISOString(),
    user:   currentUser.username,
    role:   currentUser.role,
    action,
    detail,
    ...(extra || {})
  };
  DB.log.unshift(entry);
  if (DB.log.length > 2000) DB.log = DB.log.slice(0, 2000);
  await save('log');
  renderLog();
}
