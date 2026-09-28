// Reset password page (link from the password reset email).
(() => {
  const { $, params, setBusy, esc } = PawPal;
  const alertBox = $('#resetAlert');
  const show = (type, msg) => { alertBox.className = `pp-alert pp-alert-${type}`; alertBox.innerHTML = `<span>${msg}</span>`; alertBox.hidden = false; };
  const token = params.get('token');
  if (!token) { show('error', 'This reset link is incomplete. Please request a new one from the <a href="login.html">log in page</a>.'); $('#resetForm').hidden = true; }
  $('#resetForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pw = $('#newPw').value;
    if (pw.length < 8 || !/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return show('error', 'Password must be at least 8 characters and include a letter and a number.');
    if (pw !== $('#newPw2').value) return show('error', 'The two passwords do not match.');
    setBusy($('#resetBtn'), true, 'Updating…');
    try {
      await PawPalAPI.post('/auth/reset-password', { token, password: pw });
      location.href = 'login.html?reset=1';
    } catch (err) { show('error', esc(err.message)); setBusy($('#resetBtn'), false); }
  });
})();
