// Password reset form (single-use token from the email link).
(async () => {
  const { $, setBusy, errorHTML } = PawPal;
  await PawPal.booted;
  const token = PawPal.params.get('token');
  if (!token) $('#resetMsg').innerHTML = errorHTML('This reset link is incomplete. Request a new one from the log in page.');
  $('#resetForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const a = $('#pw1').value; const b = $('#pw2').value;
    if (a.length < 8 || !/[A-Za-z]/.test(a) || !/\d/.test(a)) return void ($('#resetMsg').innerHTML = errorHTML('Use at least 8 characters with a letter and a number.'));
    if (a !== b) return void ($('#resetMsg').innerHTML = errorHTML('The two passwords don\'t match.'));
    const btn = $('#resetBtn'); setBusy(btn, true, 'Saving…');
    try { await PawPalAPI.post('/auth/reset-password', { token, password: a }); location.href = 'login.html?reset=1'; }
    catch (err) { setBusy(btn, false); $('#resetMsg').innerHTML = `${errorHTML(err.message)}<p class="small" style="margin-top:8px"><a href="login.html?mode=forgot">Request a new reset link</a></p>`; }
  });
})();
