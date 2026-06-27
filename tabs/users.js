// ============================================================
// tabs/users.js — User management (dev only)
// ============================================================

function openUserForm(id = null) {
  editingUserId = id;
  const u = id ? DB.users.find(u => u.id === id) : null;
  document.getElementById('user-form-title').textContent = id ? '✏️ Edit User' : '➕ Add New User';
  document.getElementById('uf-firstname').value = u?.firstName || '';
  document.getElementById('uf-lastname').value  = u?.lastName  || '';
  document.getElementById('uf-username').value  = u?.username  || '';
  document.getElementById('uf-role').value      = u?.role      || '';
  document.getElementById('uf-status').value    = u?.active !== false ? 'true' : 'false';
  document.getElementById('uf-password').value  = '';
  document.getElementById('uf-confirm').value   = '';
  // Tab access
  document.querySelectorAll('.tab-access-cb').forEach(cb => {
    cb.checked = u?.tabAccess ? u.tabAccess.includes(cb.value) : false;
  });
  toggleTabAccessSection();
  document.getElementById('user-form-section').style.display = 'block';
  document.getElementById('user-form-section').scrollIntoView({ behavior:'smooth' });
}

function closeUserForm() {
  editingUserId = null;
  document.getElementById('user-form-section').style.display = 'none';
  btnGuardReset('btn-save-user');
}

function toggleTabAccessSection() {
  const role = document.getElementById('uf-role').value;
  const sec  = document.getElementById('uf-tab-access-section');
  const lbl  = document.getElementById('uf-tab-access-label');
  if (role === 'emp' || role === 'admin') {
    sec.style.display = 'block';
    lbl.textContent   = role === 'admin' ? '(Admin sees all by default)' : '(Select which tabs Employee can access)';
  } else {
    sec.style.display = 'none';
  }
}

async function saveUserFromApp() {
  const firstName = document.getElementById('uf-firstname').value.trim();
  const lastName  = document.getElementById('uf-lastname').value.trim();
  const username  = document.getElementById('uf-username').value.trim().toLowerCase();
  const role      = document.getElementById('uf-role').value;
  const password  = document.getElementById('uf-password').value;
  const confirm   = document.getElementById('uf-confirm').value;
  const active    = document.getElementById('uf-status').value === 'true';
  const tabAccess = Array.from(document.querySelectorAll('.tab-access-cb:checked')).map(cb => cb.value);

  if (!firstName)  return toast('First name required.', 'error');
  if (!username)   return toast('Username required.', 'error');
  if (!role)       return toast('Select a role.', 'error');
  if (/\s/.test(username)) return toast('Username cannot contain spaces.', 'error');
  if (!editingUserId && !password) return toast('Password required for new user.', 'error');
  if (password && password.length < 6) return toast('Password must be at least 6 characters.', 'error');
  if (password && password !== confirm) return toast('Passwords do not match.', 'error');
  if (DB.users.some(u => u.username.toLowerCase() === username && u.id !== editingUserId))
    return toast('Username already exists.', 'error');

  btnGuard('btn-save-user');
  const data = { firstName, lastName, username, role, active, tabAccess: (role === 'emp' || role === 'admin') ? tabAccess : null };
  if (password) {
    const { hash, salt } = await pbkdf2Hash(password, null);
    data.passwordHash = `pbkdf2:${salt}:${hash}`;
  }
  if (editingUserId) {
    const idx = DB.users.findIndex(u => u.id === editingUserId);
    DB.users[idx] = { ...DB.users[idx], ...data };
    await addLog('edit', `Edited user: ${username} (${role})`);
    toast('User updated!', 'success');
  } else {
    data.id = uniqueId();
    DB.users.push(data);
    await addLog('create', `Created user: ${username} (${role})`);
    toast('User created!', 'success');
  }
  try {
    await save('users');
    closeUserForm();
    renderUsersTable();
  } catch(e) {
    btnGuardReset('btn-save-user');
    toast('❌ Failed to save user: ' + e.message, 'error');
  }
}

async function deleteUser(id) {
  if (id === currentUser?.id) return toast('You cannot delete your own account.', 'error');
  const u = DB.users.find(u => u.id === id);
  if (!await confirmDialog({ title:'Delete User', msg:`Delete user "${u?.username}"? This cannot be undone.`, type:'danger', okLabel:'Delete User' })) return;
  await deleteDoc('users', id);
  DB.users = DB.users.filter(u => u.id !== id);
  await addLog('delete', `Deleted user: ${u?.username}`);
  toast('User deleted.', 'error');
  renderUsersTable();
}

async function toggleUserStatus(id) {
  const u = DB.users.find(u => u.id === id);
  if (!u) return;
  if (id === currentUser?.id) return toast('You cannot deactivate your own account.', 'error');
  u.active = !u.active;
  await save('users');
  await addLog('edit', `${u.active ? 'Activated' : 'Deactivated'} user: ${u.username}`);
  renderUsersTable();
  toast(`User ${u.active ? 'activated' : 'deactivated'}.`, u.active ? 'success' : 'info');
}

function renderUsersTable() {
  const tbody = document.getElementById('users-table-body');
  if (!tbody) return;
  if (!DB.users.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="icon">👤</div><p>No users found.</p></div></td></tr>`;
    return;
  }
  const roleColors = { dev:'var(--danger)', admin:'var(--accent)', emp:'var(--success)' };
  tbody.innerHTML = DB.users.map((u, i) => `<tr>
    <td>${i+1}</td>
    <td><strong>${u.firstName} ${u.lastName||''}</strong></td>
    <td><code style="background:var(--input-bg);padding:2px 8px;border-radius:4px;font-size:0.82rem">${u.username}</code></td>
    <td><span style="background:${roleColors[u.role]}20;color:${roleColors[u.role]};border:1px solid ${roleColors[u.role]}40;padding:2px 10px;border-radius:10px;font-size:0.75rem;font-weight:700">${u.role}</span></td>
    <td><span style="font-size:0.75rem;color:var(--muted)">${u.tabAccess?.length ? u.tabAccess.join(', ') : (u.role === 'dev' ? 'All' : 'Default')}</span></td>
    <td><span class="chip ${u.active!==false?'chip-active':'chip-inactive'}">${u.active!==false?'Active':'Inactive'}</span></td>
    <td><div class="action-btns">
      <button class="btn btn-outline btn-xs" onclick="openUserForm(${u.id})">✏️ Edit</button>
      ${u.id !== currentUser?.id ? `<button class="btn btn-xs" style="background:${u.active!==false?'#f39c1215':'#2ecc7115'};color:${u.active!==false?'var(--warning)':'var(--success)'};border:1px solid ${u.active!==false?'#f39c1240':'#2ecc7140'}" onclick="toggleUserStatus(${u.id})">${u.active!==false?'🔒 Disable':'✅ Enable'}</button>` : ''}
      ${u.id !== currentUser?.id ? `<button class="btn btn-danger btn-xs" onclick="deleteUser(${u.id})">🗑</button>` : '<span style="color:var(--muted);font-size:0.75rem;padding:0 4px">— (you)</span>'}
    </div></td>
  </tr>`).join('');
}