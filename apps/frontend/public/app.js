const API = '/api/v1';
const $ = (selector) => document.querySelector(selector);
const state = { accessToken: sessionStorage.getItem('tsp_access') || '', refreshToken: sessionStorage.getItem('tsp_refresh') || '', user: null, toastTimer: null };

function saveSession(data) {
  state.accessToken = data.accessToken;
  state.refreshToken = data.refreshToken;
  state.user = data.user;
  sessionStorage.setItem('tsp_access', data.accessToken);
  sessionStorage.setItem('tsp_refresh', data.refreshToken);
}
function clearSession() {
  state.accessToken = ''; state.refreshToken = ''; state.user = null;
  sessionStorage.removeItem('tsp_access'); sessionStorage.removeItem('tsp_refresh');
}
function toast(message, error = false) {
  const node = $('#toast'); node.textContent = message; node.classList.toggle('error', error); node.classList.remove('hidden');
  clearTimeout(state.toastTimer); state.toastTimer = setTimeout(() => node.classList.add('hidden'), 3600);
}
async function request(path, options = {}, retry = true) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (state.accessToken) headers.Authorization = 'Bearer ' + state.accessToken;
  const response = await fetch(API + path, { ...options, headers });
  if (response.status === 401 && retry && state.refreshToken && path !== '/auth/login' && path !== '/auth/refresh') {
    const refreshed = await fetch(API + '/auth/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: state.refreshToken }) });
    if (refreshed.ok) { saveSession(await refreshed.json()); return request(path, options, false); }
    clearSession(); showLogin();
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || payload.error || 'La requête a échoué (' + response.status + ').');
  return payload;
}
function showLogin() {
  $('#login-view').classList.remove('hidden'); $('#workspace').classList.add('hidden'); $('#password').value = '';
}
function showWorkspace() {
  $('#login-view').classList.add('hidden'); $('#workspace').classList.remove('hidden');
  const user = state.user || {};
  $('#user-name').textContent = user.name || user.email || 'Utilisateur';
  $('#user-role').textContent = user.role || 'VIEWER';
  $('#user-avatar').textContent = (user.name || user.email || 'T').trim().charAt(0).toUpperCase();
  document.querySelectorAll('.admin-only').forEach((el) => el.classList.toggle('hidden', user.role !== 'ADMIN'));
  $('#today-date').textContent = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full' }).format(new Date());
  navigate('overview'); refreshHealth();
}
function navigate(view) {
  if (view !== 'overview' && state.user?.role !== 'ADMIN') return;
  document.querySelectorAll('.view').forEach((el) => el.classList.add('hidden'));
  document.querySelectorAll('.nav-item').forEach((el) => el.classList.toggle('active', el.dataset.view === view));
  $('#view-' + view).classList.remove('hidden');
  const labels = { overview: ['TABLEAU DE BORD', 'Vue générale'], users: ['ADMINISTRATION', 'Utilisateurs'], audit: ['TRAÇABILITÉ', "Journal d'audit"] };
  $('#page-kicker').textContent = labels[view][0]; $('#page-title').textContent = labels[view][1];
  $('#notice').classList.add('hidden');
  if (view === 'users') loadUsers(); if (view === 'audit') loadAudit();
}
async function refreshHealth() {
  const live = await fetch(API + '/health/live').then((r) => r.ok ? r.json() : Promise.reject()).catch(() => null);
  $('#api-status').textContent = live ? 'En ligne' : 'Indisponible';
  $('#api-detail').textContent = live ? 'API NestJS · ' + live.mode : 'Impossible de joindre le backend';
  const ready = await fetch(API + '/health/ready').then(async (r) => ({ ok: r.ok, data: await r.json().catch(() => ({})) })).catch(() => ({ ok: false, data: {} }));
  const services = ready.data.services || {};
  setMetric('db-status', services.postgres === 'ok', 'Connectivité PostgreSQL', services.postgres);
  setMetric('redis-status', services.redis === 'ok', 'Cache Redis', services.redis);
  $('#profile-status').textContent = 'Actif'; $('#profile-detail').textContent = state.user?.role + ' · session authentifiée';
  $('#health-badge').textContent = ready.ok ? 'Tous les services prêts' : 'Services incomplets';
  $('#health-badge').className = 'pill ' + (ready.ok ? 'pill-good' : 'pill-bad');
  const rows = [['API NestJS', live ? 'ok' : 'down', live?.mode || 'Indisponible'], ['PostgreSQL', services.postgres === 'ok' ? 'ok' : 'down', services.postgres || 'Non connecté'], ['Redis', services.redis === 'ok' ? 'ok' : 'down', services.redis || 'Non connecté']];
  $('#service-list').innerHTML = rows.map(([name, status, detail]) => '<div class="service-row ' + (status === 'ok' ? '' : 'down') + '"><span class="service-led"></span><span>' + escapeHtml(name) + '</span><small>' + escapeHtml(detail) + '</small></div>').join('');
}
function setMetric(id, good, detail, value) {
  $('#' + id).textContent = good ? 'Connecté' : 'Indisponible';
  $('#' + id).style.color = good ? 'var(--green)' : 'var(--red)';
  $('#' + id.replace('-status', '-detail')).textContent = detail + ' · ' + (value || 'non disponible');
}
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
function dateTime(value) { if (!value) return '—'; const date = new Date(value); return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(date); }
async function loadUsers() {
  $('#users-body').innerHTML = '<tr><td colspan="4" class="empty-cell">Chargement…</td></tr>';
  try {
    const users = await request('/admin/users?take=100');
    $('#users-body').innerHTML = users.map((u) => '<tr><td><b>' + escapeHtml(u.name) + '</b><br><small>' + escapeHtml(u.email) + '</small></td><td><span class="role-tag">' + escapeHtml(u.role) + '</span></td><td>' + (u.isActive ? 'Actif' : 'Désactivé') + '</td><td>' + dateTime(u.createdAt) + '</td></tr>').join('') || '<tr><td colspan="4" class="empty-cell">Aucun compte.</td></tr>';
  } catch (error) { $('#users-body').innerHTML = '<tr><td colspan="4" class="empty-cell">' + escapeHtml(error.message) + '</td></tr>'; }
}
async function loadAudit() {
  $('#audit-body').innerHTML = '<tr><td colspan="4" class="empty-cell">Chargement…</td></tr>';
  try {
    const events = await request('/admin/audit?take=100');
    $('#audit-body').innerHTML = events.map((e) => '<tr><td>' + dateTime(e.createdAt) + '</td><td><b>' + escapeHtml(e.action) + '</b></td><td>' + escapeHtml(e.target) + '</td><td>' + escapeHtml(e.ipAddress || '—') + '</td></tr>').join('') || '<tr><td colspan="4" class="empty-cell">Aucun événement enregistré.</td></tr>';
  } catch (error) { $('#audit-body').innerHTML = '<tr><td colspan="4" class="empty-cell">' + escapeHtml(error.message) + '</td></tr>'; }
}
$('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault(); $('#login-error').textContent = '';
  const button = event.currentTarget.querySelector('button'); button.disabled = true; button.firstElementChild.textContent = 'Connexion…';
  try { const data = await request('/auth/login', { method: 'POST', body: JSON.stringify({ email: $('#email').value.trim(), password: $('#password').value }) }, false); saveSession(data); showWorkspace(); }
  catch (error) { $('#login-error').textContent = error.message; }
  finally { button.disabled = false; button.firstElementChild.textContent = 'Accéder à mon espace'; }
});
$('#logout-button').addEventListener('click', async () => {
  try { if (state.refreshToken) await request('/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken: state.refreshToken }) }); } catch {}
  clearSession(); showLogin();
});
document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => navigate(button.dataset.view)));
$('#refresh-users').addEventListener('click', loadUsers); $('#refresh-audit').addEventListener('click', loadAudit);
$('#user-form').addEventListener('submit', async (event) => {
  event.preventDefault(); $('#user-error').textContent = '';
  const form = new FormData(event.currentTarget);
  try {
    await request('/admin/users', { method: 'POST', body: JSON.stringify({ name: form.get('name'), email: form.get('email'), password: form.get('password'), role: form.get('role') }) });
    event.currentTarget.reset(); toast('Compte créé avec succès.'); loadUsers();
  } catch (error) { $('#user-error').textContent = error.message; }
});
async function restoreSession() {
  if (!state.accessToken && !state.refreshToken) return showLogin();
  try {
    if (!state.accessToken && state.refreshToken) {
      const response = await fetch(API + '/auth/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: state.refreshToken }) });
      if (!response.ok) throw new Error('Session expirée'); saveSession(await response.json());
    }
    state.user = await request('/auth/me');
    showWorkspace();
  } catch { clearSession(); showLogin(); }
}
restoreSession();