// Log in, sign up, forgot password, resend verification.
(async () => {
  const { $, $$, params, setBusy, errorHTML, esc, icons } = PawPal;
  let role = params.get('role') === 'staff' ? 'staff' : 'user';
  let pendingEmail = '';
  const panels = { login: '#loginForm', signup: '#signupForm', forgot: '#forgotForm', sent: '#sentPanel', code: '#codeForm' };
  const okHTML = (msg) => `<div class="alert alert-success" role="status">${icons.checkCircle}<div>${esc(msg)}</div></div>`;

  function show(name) {
    Object.entries(panels).forEach(([k, sel]) => { $(sel).hidden = k !== name; });
    $('#roleSeg').hidden = name !== 'login';
    const first = $(`${panels[name]} input`);
    if (first) first.focus();
  }
  function setRole(r) {
    role = r;
    $$('#roleSeg button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.role === r)));
    $('#loginTitle').textContent = r === 'staff' ? 'Shelter staff log in' : 'Welcome back';
    $('#loginSub').textContent = r === 'staff' ? 'Manage pets, applications and enquiries for your shelter.' : 'Log in to see your matches, favourites and applications.';
    $('#toSignup').hidden = r === 'staff';
  }
  $('#roleSeg').addEventListener('click', (e) => { const b = e.target.closest('[data-role]'); if (b) setRole(b.dataset.role); });
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-show]'); if (b) { e.preventDefault(); show(b.dataset.show); } });

  const u = await PawPal.booted;
  const next = params.get('next');
  const safeNext = next && /^[a-z-]+\.html(\?[\w=&%.-]*)?(#[\w-]*)?$/i.test(next) ? next : null; // only local pages
  if (u) { location.replace(safeNext || (PawPal.isStaffUser(u) ? 'index.html' : 'dashboard.html')); return; }

  setRole(role);
  if (params.get('mode') === 'signup') show('signup');
  if (params.get('mode') === 'forgot') show('forgot');
  if (params.get('verified') === '1') $('#loginMsg').innerHTML = okHTML('Email verified — you can log in now.');
  if (params.get('reset') === '1') $('#loginMsg').innerHTML = okHTML('Password updated — log in with your new password.');
  try {
    const cfg = await PawPalAPI.get('/config');
    const local = /^(localhost|127\.)/.test(location.hostname);
    $('#demoBox').hidden = !local;
    if (cfg.emailMode === 'dev' && local) $('#devHint').hidden = false;
  } catch { /* ignore */ }

  $('#demoBox').addEventListener('click', (e) => {
    const b = e.target.closest('[data-demo]');
    if (!b) return;
    const [email, pw, r] = b.dataset.demo.split('|');
    show('login'); setRole(r); $('#lEmail').value = email; $('#lPassword').value = pw;
    $('#loginForm').requestSubmit();
  });

  // ---- log in ----
  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('#lEmail').value.trim(); const password = $('#lPassword').value;
    $('#loginMsg').innerHTML = '';
    if (!email || !password) { $('#loginMsg').innerHTML = errorHTML('Enter your email and password.'); return; }
    const btn = $('#loginBtn'); setBusy(btn, true, 'Logging in…');
    try {
      const res = await PawPalAPI.post('/auth/login', { email, password, role, remember: $('#lRemember').checked });
      if (res.twoFactorRequired) { setBusy(btn, false); $('#lPassword').value = ''; $('#codeMsg').innerHTML = ''; show('code'); return; }
      location.href = res.twoFactorSetupRequired ? res.redirect : safeNext || res.redirect;
    } catch (err) {
      setBusy(btn, false);
      if (err.data?.code === 'EMAIL_NOT_VERIFIED') {
        pendingEmail = err.data.email;
        $('#loginMsg').innerHTML = `<div class="alert alert-warn" role="alert">${icons.mail}<div>Please verify your email first. <button type="button" class="link-btn" id="resendInline">Send a new link</button></div></div>`;
        $('#resendInline').addEventListener('click', resend);
      } else $('#loginMsg').innerHTML = errorHTML(err.message);
    }
  });

  // ---- two-step sign-in: code from the authenticator app, or a backup code ----
  $('#codeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = $('#tfCode').value.trim();
    if (!code) { $('#codeMsg').innerHTML = errorHTML('Enter the 6-digit code from your app.'); return; }
    const btn = $('#codeBtn'); setBusy(btn, true, 'Checking…');
    try {
      const res = await PawPalAPI.post('/auth/2fa/verify', { code });
      location.href = res.twoFactorSetupRequired ? res.redirect : safeNext || res.redirect;
    } catch (err) {
      setBusy(btn, false);
      $('#tfCode').select();
      $('#codeMsg').innerHTML = errorHTML(err.message);
      if (err.status === 401) setTimeout(() => show('login'), 1800); // pending sign-in expired
    }
  });
  // Submit automatically once 6 digits are typed
  $('#tfCode').addEventListener('input', (e) => { if (/^\d{6}$/.test(e.target.value.trim())) $('#codeForm').requestSubmit(); });

  // ---- sign up ----
  $('#sPassword').addEventListener('input', (e) => {
    const v = e.target.value;
    const s = !v ? 0 : [v.length >= 8, /[A-Za-z]/.test(v) && /\d/.test(v), v.length >= 12, /[^A-Za-z0-9]/.test(v)].filter(Boolean).length;
    $('#pwMeter').dataset.s = String(s);
  });
  $('#signupForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('#sName').value.trim(); const email = $('#sEmail').value.trim(); const password = $('#sPassword').value;
    const problems = [];
    if (name.length < 2) problems.push('Enter your full name.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) problems.push('Enter a valid email address.');
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) problems.push('Use at least 8 characters with a letter and a number.');
    if (!$('#sTerms').checked) problems.push('Please accept the terms and privacy policy.');
    if (problems.length) { $('#signupMsg').innerHTML = errorHTML(problems.join(' ')); return; }
    const btn = $('#signupBtn'); setBusy(btn, true, 'Creating account…');
    try {
      await PawPalAPI.post('/auth/register', { name, email, password });
      pendingEmail = email;
      $('#sentText').textContent = `We've sent a verification link to ${email}. Click it to activate your account — it expires in 24 hours.`;
      show('sent');
    } catch (err) { $('#signupMsg').innerHTML = errorHTML(err.message); }
    finally { setBusy(btn, false); }
  });

  async function resend() {
    try {
      const r = await PawPalAPI.post('/auth/resend-verification', { email: pendingEmail || $('#lEmail').value.trim() });
      PawPal.toast(r.message);
    } catch (err) { PawPal.toast(err.message, 'error'); }
  }
  $('#resendBtn').addEventListener('click', resend);

  // ---- forgot ----
  $('#forgotForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('#fEmail').value.trim();
    if (!email) { $('#forgotMsg').innerHTML = errorHTML('Enter your email address.'); return; }
    const btn = $('#forgotBtn'); setBusy(btn, true, 'Sending…');
    try { const r = await PawPalAPI.post('/auth/forgot-password', { email }); $('#forgotMsg').innerHTML = okHTML(r.message); }
    catch (err) { $('#forgotMsg').innerHTML = errorHTML(err.message); }
    finally { setBusy(btn, false); }
  });
})();
