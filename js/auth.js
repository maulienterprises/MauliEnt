// ============================================================
// js/auth.js — Login, session, idle timer, role access
// ============================================================

let currentUser = null;

// ── Session tokens (tab-isolated via sessionStorage) ────────
function getSessionToken()     { return sessionStorage.getItem('mauli_session_token'); }
function setSessionToken(t)    { sessionStorage.setItem('mauli_session_token', t); }
function clearSessionToken()   { sessionStorage.removeItem('mauli_session_token'); }

function generateToken() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2,'0')).join('');
}

function requireSession() {
  if (!currentUser || !getSessionToken()) { signOut(); return false; }
  return true;
}

// ── Password hashing ─────────────────────────────────────────
async function pbkdf2Hash(password, saltHex) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const salt = saltHex
    ? new Uint8Array(saltHex.match(/.{2}/g).map(b => parseInt(b, 16)))
    : crypto.getRandomValues(new Uint8Array(16));
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 310000 }, keyMaterial, 256
  );
  const hashHex    = Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2,'0')).join('');
  const saltHexOut = Array.from(salt).map(b => b.toString(16).padStart(2,'0')).join('');
  return { hash: hashHex, salt: saltHexOut };
}

async function sha256Legacy(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

async function verifyPassword(password, user) {
  if (user.passwordHash && user.passwordHash.startsWith('pbkdf2:')) {
    const [, saltHex, storedHash] = user.passwordHash.split(':');
    const { hash } = await pbkdf2Hash(password, saltHex);
    return hash === storedHash;
  }
  // Legacy SHA-256 — verify then silently upgrade to PBKDF2
  const legacyHash = await sha256Legacy(password);
  if (legacyHash === user.passwordHash) {
    const { hash, salt } = await pbkdf2Hash(password, null);
    user.passwordHash = `pbkdf2:${salt}:${hash}`;
    save('users');
    return true;
  }
  return false;
}

// ── Lockout ──────────────────────────────────────────────────
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS   = 5 * 60 * 1000;

function getLockout(username)     { try { return JSON.parse(sessionStorage.getItem('mauli_lockout_' + username)) || { attempts:0, until:0 }; } catch { return { attempts:0, until:0 }; } }
function setLockout(username, d)  { sessionStorage.setItem('mauli_lockout_' + username, JSON.stringify(d)); }
function clearLockout(username)   { sessionStorage.removeItem('mauli_lockout_' + username); }

let lockoutCountdownInterval = null;

function showLockoutMessage(username) {
  const loginBtn  = document.getElementById('login-btn');
  const lockoutEl = document.getElementById('login-lockout');
  const errorEl   = document.getElementById('login-error');
  errorEl.style.display = 'none';
  if (lockoutCountdownInterval) clearInterval(lockoutCountdownInterval);
  lockoutCountdownInterval = setInterval(() => {
    const remaining = Math.max(0, Math.ceil((getLockout(username).until - Date.now()) / 1000));
    if (remaining <= 0) {
      clearInterval(lockoutCountdownInterval);
      lockoutEl.style.display = 'none';
      loginBtn.disabled = false; loginBtn.style.opacity = '1';
      lockoutEl.textContent = ''; clearLockout(username);
    } else {
      const m = Math.floor(remaining / 60), s = remaining % 60;
      lockoutEl.style.display = 'block';
      lockoutEl.textContent = `⛔ Too many attempts. Try again in ${m}:${String(s).padStart(2,'0')}`;
      loginBtn.disabled = true; loginBtn.style.opacity = '0.6';
    }
  }, 500);
}

// ── Load users (Supabase → users.json → localStorage cache) ─
async function loadUsersDB() {
  if (_db) {
    try {
      const { data, error } = await _db.from('users').select('*');
      if (!error && data && data.length > 0) {
        DB.users = data;
        try { localStorage.setItem('mauli_users_cache', JSON.stringify(data)); } catch(e) {}
        return;
      }
    } catch(e) { console.warn('Supabase users load failed:', e); }
  }
  if (DB.users && DB.users.length > 0) return;
  for (const filename of ['./users.json', './users.db']) {
    try {
      const resp = await fetch(filename + '?v=' + Date.now());
      if (resp.ok) {
        const data = await resp.json();
        if (Array.isArray(data) && data.length > 0) {
          DB.users = data;
          try { localStorage.setItem('mauli_users_cache', JSON.stringify(data)); } catch(e) {}
          if (_db) save('users');
          return;
        }
      }
    } catch(e) {}
  }
  try {
    const cached = JSON.parse(localStorage.getItem('mauli_users_cache') || '[]');
    if (cached.length > 0) { DB.users = cached; return; }
  } catch(e) {}
}

// ── Login ────────────────────────────────────────────────────
async function doLogin() {
  const username = document.getElementById('login-user').value.trim().toLowerCase();
  const password = document.getElementById('login-pass').value;
  if (!username || !password) return showLoginError();

  const loginBtn = document.getElementById('login-btn');
  loginBtn.disabled = true;
  loginBtn._origText = loginBtn.innerHTML;
  loginBtn.innerHTML = '<svg style="width:16px;height:16px;vertical-align:middle;animation:spin 0.8s linear infinite;margin-right:6px" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="28 56" stroke-linecap="round"/></svg>' + loginBtn._origText;

  const loginGuardTimer = setTimeout(() => {
    loginBtn.disabled = false;
    if (loginBtn._origText !== undefined) { loginBtn.innerHTML = loginBtn._origText; delete loginBtn._origText; }
  }, 5000);

  function resetLoginBtn() {
    clearTimeout(loginGuardTimer);
    loginBtn.disabled = false;
    if (loginBtn._origText !== undefined) { loginBtn.innerHTML = loginBtn._origText; delete loginBtn._origText; }
  }

  const lo = getLockout(username);
  if (lo.until > Date.now()) { resetLoginBtn(); showLockoutMessage(username); return; }

  await loadUsersDB();
  const user  = DB.users.find(u => u.username.toLowerCase() === username && u.active !== false);
  const valid = user ? await verifyPassword(password, user) : false;

  if (!valid) {
    const newAttempts = (lo.attempts || 0) + 1;
    resetLoginBtn();
    if (newAttempts >= MAX_ATTEMPTS) {
      setLockout(username, { attempts: newAttempts, until: Date.now() + LOCKOUT_MS });
      showLockoutMessage(username);
    } else {
      setLockout(username, { attempts: newAttempts, until: 0 });
      showLoginError(`Invalid username or password. (${newAttempts}/${MAX_ATTEMPTS} attempts)`);
    }
    return;
  }

  clearLockout(username);
  const token = generateToken();
  setSessionToken(token);
  try { sessionStorage.setItem('mauli_current_user', JSON.stringify({ id: user.id, firstName: user.firstName, lastName: user.lastName, username: user.username, role: user.role, tabAccess: user.tabAccess || null })); } catch(e) {}

  currentUser = user;
  document.getElementById('login-error').style.display = 'none';
  document.getElementById('login-lockout').style.display = 'none';
  if (lockoutCountdownInterval) clearInterval(lockoutCountdownInterval);
  document.getElementById('login-btn').disabled = false;
  document.getElementById('login-btn').style.opacity = '1';

  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  document.getElementById('topbar-name').textContent = window.innerWidth <= 600 ? user.firstName : user.firstName + (user.lastName ? ' ' + user.lastName : '');
  document.getElementById('topbar-role').textContent = roleLabel(user.role);

  const isDev = user.role === 'dev';
  document.querySelectorAll('.dev-only').forEach(el => el.style.display = isDev ? '' : 'none');
  const isMgr = user.role === 'dev' || user.role === 'admin';
  document.querySelectorAll('.mgr-only').forEach(el => el.style.display = isMgr ? '' : 'none');

  applyRoleAccess(user.role, user);
  await load();
  renderAll();
  startRealtimeListeners();
  startIdleTimer();
  addLog('login', `User "${user.username}" signed in`);
}

function showLoginError(msg) {
  const el = document.getElementById('login-error');
  el.textContent = msg || 'Invalid username or password.';
  el.style.display = 'block';
}

// ── Sign out ─────────────────────────────────────────────────
function signOut(reason) {
  if (currentUser) addLog('login', `User "${currentUser.username}" signed out${reason ? ' (' + reason + ')' : ''}`);
  currentUser = null;
  clearSessionToken();
  try { sessionStorage.removeItem('mauli_current_user'); } catch(e) {}
  stopIdleTimer();
  stopRealtimeListeners();
  document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
  const _idleOv = document.getElementById('idle-warning-overlay');
  if (_idleOv) _idleOv.style.display = 'none';
  const _staleBn = document.getElementById('stale-tab-banner');
  if (_staleBn) _staleBn.style.display = 'none';
  const _loginScr = document.getElementById('login-screen');
  if (_loginScr) {
    const _appEl = document.getElementById('app');
    if (_appEl) _appEl.style.display = 'none';
    _loginScr.style.display = 'flex';
    const _u = document.getElementById('login-user'); if (_u) _u.value = '';
    const _p = document.getElementById('login-pass'); if (_p) _p.value = '';
  } else {
    window.location.href = 'index.html';
  }
}

// ── Idle timer ───────────────────────────────────────────────
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const IDLE_WARNING_MS = 30 * 1000;
let idleTimer = null, idleWarnTimer = null, idleCountdown = null, idleWarningShown = false;
const IDLE_EVENTS = ['mousemove','mousedown','keydown','touchstart','scroll','click'];

function startIdleTimer() {
  IDLE_EVENTS.forEach(ev => window.addEventListener(ev, onUserActivity, { passive: true }));
  scheduleIdle();
}
function stopIdleTimer() {
  IDLE_EVENTS.forEach(ev => window.removeEventListener(ev, onUserActivity));
  clearTimeout(idleTimer); clearTimeout(idleWarnTimer); clearInterval(idleCountdown);
}
function onUserActivity() { if (!idleWarningShown) scheduleIdle(); }
function scheduleIdle() {
  clearTimeout(idleTimer); clearTimeout(idleWarnTimer);
  idleWarnTimer = setTimeout(showIdleWarning, IDLE_TIMEOUT_MS - IDLE_WARNING_MS);
  idleTimer     = setTimeout(() => signOut('idle timeout'), IDLE_TIMEOUT_MS);
}
function showIdleWarning() {
  idleWarningShown = true;
  let secs = 30;
  document.getElementById('idle-countdown').textContent = secs;
  document.getElementById('idle-warning-overlay').style.display = 'flex';
  clearInterval(idleCountdown);
  idleCountdown = setInterval(() => {
    secs--;
    document.getElementById('idle-countdown').textContent = secs;
    if (secs <= 0) clearInterval(idleCountdown);
  }, 1000);
}
function resetIdleTimer() {
  idleWarningShown = false;
  document.getElementById('idle-warning-overlay').style.display = 'none';
  clearInterval(idleCountdown);
  scheduleIdle();
  toast('Session extended.', 'success');
}

// ── Role access ──────────────────────────────────────────────
function roleLabel(r) { return { dev: 'Dev', admin: 'Admin', emp: 'Emp' }[r] || r; }

function applyRoleAccess(role, user) {
  const nav = document.getElementById('main-nav');
  const resolvedUser = user || currentUser;

  if (role === 'emp' || role === 'admin') {
    const defaultTabs = role === 'admin'
      ? ['dashboard','dealers','purchases','purchpayments','debitnotes','customers','invoices','payments','overdue','creditnotes','ledger','expenses']
      : ['invoices'];
    const tabAccess = (resolvedUser?.tabAccess && resolvedUser.tabAccess.length > 0)
      ? resolvedUser.tabAccess : defaultTabs;

    nav.querySelectorAll('.nav-btn').forEach(b => {
      if (b.classList.contains('dev-only')) { b.style.display = 'none'; return; }
      const onclick = b.getAttribute('onclick') || '';
      const match   = onclick.match(/'([a-zA-Z]+)'/);
      const tabKey  = match ? match[1] : null;
      if (!tabKey) return;
      if (b.classList.contains('mgr-only')) {
        b.style.display = (role === 'admin' && tabAccess.includes(tabKey)) ? '' : 'none'; return;
      }
      if (b.classList.contains('expenses-tab-btn')) {
        b.style.display = tabAccess.includes('expenses') ? '' : 'none'; return;
      }
      b.style.display = tabAccess.includes(tabKey) ? '' : 'none';
    });

    const firstTab = tabAccess[0] || (role === 'admin' ? 'dashboard' : 'invoices');
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    nav.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const panel = document.getElementById('tab-' + firstTab);
    if (panel) panel.classList.add('active');
    const btn = nav.querySelector(`[onclick*="'${firstTab}'"]`);
    if (btn) btn.classList.add('active');
  } else {
    // dev — full access, start on Dashboard
    nav.querySelectorAll('.expenses-tab-btn').forEach(b => b.style.display = '');
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    nav.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const dashPanel = document.getElementById('tab-dashboard');
    if (dashPanel) dashPanel.classList.add('active');
    const dashBtn = nav.querySelector("[onclick*=\"'dashboard'\"]");
    if (dashBtn) dashBtn.classList.add('active');
  }
}

// ── Session restore on page refresh ─────────────────────────
function initApp() {
  try { DB.backupHistory = JSON.parse(localStorage.getItem('mauli_backup_history')) || []; } catch { DB.backupHistory = []; }

  const token      = getSessionToken();
  const cachedUser = (() => { try { return JSON.parse(sessionStorage.getItem('mauli_current_user')); } catch { return null; } })();

  // No session — redirect to login
  if (!token || !cachedUser) {
    window.location.href = './index.html';
    return;
  }

  currentUser = cachedUser;

  // Wait for Supabase then boot
  const waitDB = setInterval(async () => {
    if (!_db) return;
    clearInterval(waitDB);

    // Safely update DOM — check elements exist first
    const nameEl = document.getElementById('topbar-name');
    const roleEl = document.getElementById('topbar-role');
    if (nameEl) nameEl.textContent = window.innerWidth <= 600 ? cachedUser.firstName : cachedUser.firstName + (cachedUser.lastName ? ' ' + cachedUser.lastName : '');
    if (roleEl) roleEl.textContent = roleLabel(cachedUser.role);

    const isDev = cachedUser.role === 'dev';
    document.querySelectorAll('.dev-only').forEach(el => el.style.display = isDev ? '' : 'none');
    if (isDev) document.querySelectorAll('.expenses-tab-btn').forEach(el => el.style.display = '');
    const isMgr = cachedUser.role === 'dev' || cachedUser.role === 'admin';
    document.querySelectorAll('.mgr-only').forEach(el => el.style.display = isMgr ? '' : 'none');

    applyRoleAccess(cachedUser.role, cachedUser);
    const appEl = document.getElementById('app');
    if (appEl) appEl.style.display = 'block';
    await load();
    renderAll();
    startRealtimeListeners();
    startIdleTimer();
  }, 100);
}