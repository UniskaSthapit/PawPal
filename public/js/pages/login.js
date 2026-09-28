// Login / sign up / forgot password with role-based routing and email verification.
(() => {
  const { $, params, setBusy, esc } = PawPal;
  let mode = params.get('mode') === 'signup' ? 'signup' : 'login';
  let role = params.get('role') === 'staff' ? 'staff' : 'user';
  let lastEmail = '';
  const form = $('#authForm');
  const alertBox = $('#formAlert');

  // Only allow redirects to our own pages
  const nextUrl = () => {
    const n = params.get('next') || '';
    return /^[a-z-]+\.html(\?[\w=&%.-]*)?$/i.test(n) ? n : null;
  };
  const STAFF_PAGES = ['index.html', 'pets.html', 'add-pet.html', 'applications.html', 'analytics.html', 'settings.html'];
  const goTo = (u, fallback) => {
    const n = nextUrl();
    const isStaffPage = n && STAFF_PAGES.includes(n.split('?')[0]);
    location.href = n && (u.role === 'staff') === isStaffPage ? n : fallback;
  };

  function showAlert(type, html) {
    alertBox.className = `pp-alert pp-alert-${type}`;
    alertBox.innerHTML = `<span>${html}</span>`;
    alertBox.hidden = false;
  }
  const hideAlert = () => { alertBox.hidden = true; };
  const clearErrors = () => form.querySelectorAll('.field-error').forEach((el) => el.classList.remove('field-error'));
  const markError = (id) => $(id).classList.add('field-error');

  function render() {
    const isLogin = mode === 'login';
    const isSignup = mode === 'signup';
    const isForgot = mode === 'forgot';
    $('#roleUser').classList.toggle('active', role === 'user');
    $('#roleStaff').classList.toggle('active', role === 'staff');
    $('#roleUser').setAttribute('aria-selected', role === 'user');
    $('#roleStaff').setAttribute('aria-selected', role === 'staff');
    $('#nameField').classList.toggle('hidden', !isSignup);
    $('#confirmField').classList.toggle('hidden', !isSignup);
    $('#pwHint').classList.toggle('hidden', !isSignup);
    $('#passwordField').classList.toggle('hidden', isForgot);
    $('#rememberRow').classList.toggle('hidden', !isLogin);
    $('#orDivider').classList.toggle('hidden', role === 'staff' && !isForgot);
    $('#modeToggle').classList.toggle('hidden', role === 'staff' && !isForgot);
    $('#staffNote').classList.toggle('hidden', role !== 'staff');
    $('#passwordInput').autocomplete = isSignup ? 'new-password' : 'current-password';

    const copy = {
      login: [role === 'staff' ? 'Staff sign in' : 'Welcome Back', role === 'staff' ? 'Sign in to the PawPal shelter portal.' : 'Sign in to continue your journey with PawPal.', 'Log In', "Don't have an account? ", 'Create New Account'],
      signup: ['Create Account', 'Join PawPal to apply for pets and track your adoption.', 'Create Account', 'Already have an account? ', 'Back to Log In'],
      forgot: ['Reset your password', "Enter your account email and we'll send you a reset link.", 'Send reset link', 'Remembered it? ', 'Back to Log In'],
    }[mode];
    [$('#authTitle').textContent, $('#authSub').textContent, $('#submitBtn').textContent, $('#modeToggleText').textContent, $('#modeToggleBtn').textContent] = copy;
    document.title = `PawPal — ${copy[0]}`;
  }

  function setMode(m) { mode = m; hideAlert(); clearErrors(); render(); }

  async function showCheckEmail(email) {
    lastEmail = email;
    $('#sentTo').textContent = email;
    $('#formView').hidden = true;
    $('#checkEmailView').hidden = false;
    const cfg = await PawPalAPI.get('/config').catch(() => ({}));
    $('#devMailNote').hidden = cfg.emailMode !== 'dev-mailbox';
  }

  // ---- events ----
  document.querySelector('.role-switcher').addEventListener('click', (e) => {
    const b = e.target.closest('[data-role]');
    if (!b) return;
    role = b.dataset.role;
    if (role === 'staff' && mode === 'signup') mode = 'login';
    hideAlert(); render();
  });
  $('#modeToggleBtn').addEventListener('click', () => setMode(mode === 'login' ? 'signup' : 'login'));
  $('#forgotBtn').addEventListener('click', () => setMode('forgot'));
  $('#rememberInput').addEventListener('change', (e) => $('#rememberCheck').classList.toggle('checked', e.target.checked));
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-eye]');
    if (!b) return;
    const input = $('#' + b.dataset.eye);
    input.type = input.type === 'password' ? 'text' : 'password';
    b.setAttribute('aria-label', input.type === 'password' ? 'Show password' : 'Hide password');
  });
  $('#backToLogin').addEventListener('click', () => { $('#checkEmailView').hidden = true; $('#formView').hidden = false; setMode('login'); });
  $('#resendBtn').addEventListener('click', async (e) => {
    setBusy(e.target, true, 'Sending…');
    try { const r = await PawPalAPI.post('/auth/resend-verification', { email: lastEmail }); PawPal.toast(r.message); }
    catch (err) { PawPal.toast(err.message, 'error'); }
    setBusy(e.target, false);
  });
  alertBox.addEventListener('click', async (e) => {
    if (!e.target.closest('#resendInline')) return;
    await PawPalAPI.post('/auth/resend-verification', { email: lastEmail }).catch(() => {});
    showCheckEmail(lastEmail);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert(); clearErrors();
    const name = $('#nameInput').value.trim();
    const email = $('#emailInput').value.trim();
    const password = $('#passwordInput').value;
    const confirm = $('#confirmInput').value;
    lastEmail = email;

    // quick checks before calling the server
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { markError('#emailInput'); return showAlert('error', 'Please enter a valid email address.'); }
    if (mode === 'signup') {
      if (name.length < 2) { markError('#nameInput'); return showAlert('error', 'Please enter your full name.'); }
      if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) { markError('#passwordInput'); return showAlert('error', 'Password must be at least 8 characters and include a letter and a number.'); }
      if (password !== confirm) { markError('#confirmInput'); return showAlert('error', 'The two passwords do not match.'); }
    }
    if (mode === 'login' && !password) { markError('#passwordInput'); return showAlert('error', 'Please enter your password.'); }

    const btn = $('#submitBtn');
    setBusy(btn, true, mode === 'login' ? 'Logging in…' : mode === 'signup' ? 'Creating account…' : 'Sending…');
    try {
      if (mode === 'login') {
        const r = await PawPalAPI.post('/auth/login', { email, password, role, remember: $('#rememberInput').checked });
        goTo(r.user, r.redirect);
        return;
      }
      if (mode === 'signup') {
        await PawPalAPI.post('/auth/register', { name, email, password });
        form.reset();
        showCheckEmail(email);
      } else {
        const r = await PawPalAPI.post('/auth/forgot-password', { email });
        showAlert('success', `${esc(r.message)} The link expires in 1 hour.`);
      }
    } catch (err) {
      if (err.data?.code === 'EMAIL_NOT_VERIFIED') {
        showAlert('error', `Please verify your email before logging in. <button type="button" class="pp-link-btn" id="resendInline">Send a new verification link</button>`);
      } else {
        if (err.status === 401) markError('#passwordInput');
        showAlert('error', esc(err.message));
      }
    }
    setBusy(btn, false);
  });

  // ---- start ----
  if (params.get('verified') === '1') showAlert('success', 'Your email is verified. Log in to get started.');
  if (params.get('reset') === '1') showAlert('success', 'Your password was updated. Log in with your new password.');
  if (params.get('next')) showAlert('info', 'Please log in to continue.');
  if (params.get('email')) $('#emailInput').value = params.get('email');
  render();
  PawPal.ready.then((u) => { if (u) goTo(u, u.role === 'staff' ? 'index.html' : 'my-applications.html'); });
})();
