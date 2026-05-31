// FylePro — shared API client + auth helpers.
// Talks to the Node/Express backend. Stores a JWT in localStorage and
// attaches it as a Bearer token. Falls back gracefully so the static
// prototype still renders if the backend is unavailable.

(function () {
  const TOKEN_KEY = 'fylepro.token';
  const REG_KEY = 'fylepro.registrations';

  function getToken() {
    try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; }
  }
  function setToken(t) {
    try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch (e) {}
  }

  async function api(pathname, opts = {}) {
    const headers = Object.assign({}, opts.headers || {});
    const token = getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const isForm = opts.body instanceof FormData;
    if (!isForm && opts.body && typeof opts.body !== 'string') {
      headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(opts.body);
    }
    const res = await fetch('/api' + pathname, Object.assign({ credentials: 'include' }, opts, { headers }));
    const ct = res.headers.get('content-type') || '';
    const payload = ct.includes('application/json') ? await res.json() : await res.blob();
    if (!res.ok) {
      const msg = (payload && payload.error) || ('Request failed (' + res.status + ')');
      throw new Error(msg);
    }
    return payload;
  }

  async function login(loginId, password) {
    const data = await api('/auth/login', { method: 'POST', body: { loginId, password } });
    setToken(data.token);
    // shell-compatible session
    const u = data.user;
    localStorage.setItem('fylepro.session', JSON.stringify({
      userId: u.userId, loginId: u.loginId, name: u.fullName, role: u.role,
      company: 'Workspace', initials: (u.fullName || 'FP').split(/\s+/).slice(0, 2).map(s => s[0]).join('').toUpperCase(),
    }));
    await refreshRegistrations();
    return data;
  }

  async function refreshRegistrations() {
    try {
      const { registrations } = await api('/auth/registrations');
      localStorage.setItem(REG_KEY, JSON.stringify(registrations || []));
      if (registrations && registrations[0]) {
        if (!localStorage.getItem('fylepro.entity')) localStorage.setItem('fylepro.entity', registrations[0].id);
      }
      return registrations;
    } catch (e) { return []; }
  }

  function getRegistrations() {
    try { return JSON.parse(localStorage.getItem(REG_KEY) || '[]'); } catch (e) { return []; }
  }

  function currentRegistration() {
    const regs = getRegistrations();
    const id = localStorage.getItem('fylepro.entity');
    return regs.find(r => r.id === id) || regs[0] || null;
  }

  function logout() {
    setToken(null);
    ['fylepro.session', 'fylepro.entity', REG_KEY].forEach(k => localStorage.removeItem(k));
    api('/auth/logout', { method: 'POST' }).catch(() => {});
    window.location.href = 'login.html';
  }

  function requireSession() {
    if (!getToken()) { window.location.href = 'login.html'; return false; }
    return true;
  }

  // ── GSTR-1 module API ──
  const gstr1 = {
    sections: () => api('/gstr1/sections'),
    templateUrl: (gstin, period) => '/api/gstr1/template?gstin=' + encodeURIComponent(gstin || '') + '&period=' + encodeURIComponent(period || ''),
    sampleUrl: (type) => '/api/gstr1/sample/' + (type === 'einvoice' ? 'einvoice' : 'books'),
    reconReportUrl: (reconId) => '/api/gstr1/reconciliations/' + reconId + '/report',
    validationReportUrl: (datasetId) => '/api/gstr1/datasets/' + datasetId + '/validation-report',
    upload: (file, registrationId, period, source) => {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('registrationId', registrationId);
      fd.append('period', period);
      fd.append('source', source || 'books');
      return api('/gstr1/datasets', { method: 'POST', body: fd });
    },
    datasets: (registrationId, period) => api('/gstr1/datasets?registrationId=' + registrationId + (period ? '&period=' + period : '')),
    dataset: (id) => api('/gstr1/datasets/' + id),
    reconcile: (baseDatasetId, compareDatasetId) => api('/gstr1/reconcile', { method: 'POST', body: { baseDatasetId, compareDatasetId } }),
    generate: (datasetId) => api('/gstr1/generate', { method: 'POST', body: { datasetId } }),
    jsonUrl: (filingId) => '/api/gstr1/filings/' + filingId + '/json',
    push: (filingId) => api('/gstr1/filings/' + filingId + '/push', { method: 'POST' }),
  };

  window.FP = {
    api, login, logout, requireSession, refreshRegistrations,
    getRegistrations, currentRegistration, getToken, gstr1,
  };
})();
