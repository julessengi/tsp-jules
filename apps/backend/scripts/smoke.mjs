const baseUrl = process.env.API_BASE_URL || 'http://127.0.0.1:3001/api/v1';
const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;

if (!email || !password) {
  throw new Error('BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD are required for smoke tests.');
}

async function request(path, options = {}) {
  const response = await fetch(baseUrl + path, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
  });
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  return { response, body };
}

const ready = await request('/health/ready');
if (!ready.response.ok || ready.body?.services?.postgres !== 'ok' || ready.body?.services?.redis !== 'ok') {
  throw new Error('Readiness check failed: ' + ready.response.status + ' ' + JSON.stringify(ready.body));
}

const login = await request('/auth/login', {
  method: 'POST',
  body: JSON.stringify({ email, password }),
});
if (!login.response.ok || !login.body?.accessToken || !login.body?.refreshToken) {
  throw new Error('Login smoke test failed: ' + login.response.status + ' ' + JSON.stringify(login.body));
}

const adminHeaders = { authorization: 'Bearer ' + login.body.accessToken };
const me = await request('/auth/me', { headers: adminHeaders });
if (!me.response.ok || me.body?.email !== email) {
  throw new Error('Authenticated profile check failed: ' + me.response.status);
}

const audit = await request('/admin/audit?take=5', { headers: adminHeaders });
if (!audit.response.ok || !Array.isArray(audit.body)) {
  throw new Error('ADMIN audit authorization check failed: ' + audit.response.status);
}

const viewerEmail = 'ci-viewer-' + Date.now() + '@tsp.local';
const viewerPassword = 'CI-only-Viewer-Password-123456!';
const viewerCreated = await request('/admin/users', {
  method: 'POST',
  headers: adminHeaders,
  body: JSON.stringify({ email: viewerEmail, name: 'CI Viewer', password: viewerPassword }),
});
if (viewerCreated.response.status !== 201 || viewerCreated.body?.role !== 'VIEWER') {
  throw new Error('ADMIN user provisioning failed: ' + viewerCreated.response.status);
}

const viewerLogin = await request('/auth/login', {
  method: 'POST',
  body: JSON.stringify({ email: viewerEmail, password: viewerPassword }),
});
if (!viewerLogin.response.ok || !viewerLogin.body?.accessToken) {
  throw new Error('VIEWER login smoke test failed: ' + viewerLogin.response.status);
}

const denied = await request('/admin/audit', {
  headers: { authorization: 'Bearer ' + viewerLogin.body.accessToken },
});
if (denied.response.status !== 403) {
  throw new Error('VIEWER must be denied ADMIN audit access; received ' + denied.response.status);
}

const refresh = await request('/auth/refresh', {
  method: 'POST',
  body: JSON.stringify({ refreshToken: login.body.refreshToken }),
});
if (!refresh.response.ok || !refresh.body?.refreshToken) {
  throw new Error('Refresh rotation failed: ' + refresh.response.status);
}

const logout = await request('/auth/logout', {
  method: 'POST',
  headers: { authorization: 'Bearer ' + refresh.body.accessToken },
  body: JSON.stringify({ refreshToken: refresh.body.refreshToken }),
});
if (!logout.response.ok) {
  throw new Error('Logout failed: ' + logout.response.status);
}

const reused = await request('/auth/refresh', {
  method: 'POST',
  body: JSON.stringify({ refreshToken: refresh.body.refreshToken }),
});
if (reused.response.status !== 401) {
  throw new Error('Revoked refresh token was not rejected: ' + reused.response.status);
}

console.log('SMOKE PASS: PostgreSQL, Redis, readiness, JWT authentication, ADMIN user provisioning, ADMIN allow, VIEWER deny, refresh rotation and logout.');
