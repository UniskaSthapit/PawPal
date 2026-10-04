// ============================================================
// api.js — the only place the website talks to the server.
// Every page uses: PawPalAPI.get('/pets'), PawPalAPI.post('/auth/login', {...}), etc.
// ============================================================
const PawPalAPI = (() => {
  async function request(method, path, body) {
    let res;
    try {
      res = await fetch('/api' + path, {
        method,
        credentials: 'same-origin',
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw Object.assign(new Error('Cannot reach the PawPal server. Check your connection and try again.'), { status: 0 });
    }
    if (res.status === 204) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || `Request failed (${res.status}).`);
      err.status = res.status;
      err.data = data;
      // An administrator requires 2FA for staff and this account hasn't set it up: go to the setup screen
      if (data.code === 'TWO_FACTOR_SETUP_REQUIRED' && !/settings\.html$/.test(location.pathname)) location.href = 'settings.html#twofactor';
      throw err;
    }
    return data;
  }

  const qs = (params = {}) => {
    const s = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString();
    return s ? `?${s}` : '';
  };

  return {
    get: (path, params) => request('GET', path + qs(params)),
    post: (path, body = {}) => request('POST', path, body),
    put: (path, body = {}) => request('PUT', path, body),
    patch: (path, body = {}) => request('PATCH', path, body),
    del: (path) => request('DELETE', path),
    qs,
  };
})();
