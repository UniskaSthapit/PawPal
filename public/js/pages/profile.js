// Profile: details, SMS phone verification, lifestyle preferences, password.
(async () => {
  const { $, esc, icons, setBusy, errorHTML, toast } = PawPal;
  await PawPal.booted;
  const okHTML = (m) => `<div class="alert alert-success">${icons.checkCircle}<div>${esc(m)}</div></div>`;
  let me;
  try { me = await PawPalAPI.get('/users/me'); } catch (err) { $('#main').insertAdjacentHTML('afterbegin', errorHTML(err.message)); return; }
  const user = me.user;
  $('#pName').value = user.name; $('#pEmail').value = user.email; $('#pAddress').value = user.address || '';
  $('#emailBadge').innerHTML = user.emailVerified ? `<span class="badge badge-sage">${icons.check}Email verified</span>` : '<span class="badge badge-honey">Email not verified</span>';
  const phoneBadge = (u) => { $('#phoneBadge').innerHTML = u.phoneVerified ? `<span class="badge badge-sage">${icons.check}Verified ${esc(u.phone)}</span>` : '<span class="badge">Not verified</span>'; };
  phoneBadge(user);
  if (user.phone) {
    const m = user.phone.match(/^(\+(?:61|64|44|1|91|977|65))(\d+)$/);
    if (m) { $('#cc').value = m[1]; $('#phoneNum').value = m[2]; } else $('#phoneNum').value = user.phone;
  }
  if (PawPal.isStaffUser(user)) $('#preferences').hidden = true;

  // Lifestyle preferences
  const renderPrefs = (understood, text) => {
    $('#prefBody').innerHTML = understood.length ? `${text ? `<p class="ai-demo-input">“${esc(text)}”</p>` : ''}<div class="understood" style="margin-top:12px">${understood.map((x) => `<span class="badge badge-honey">${esc(x)}</span>`).join('')}</div>
      <div class="row" style="margin-top:14px"><button class="btn btn-sm btn-ghost" id="clearPrefs" style="color:var(--danger)">${icons.trash}Clear my lifestyle profile</button></div>`
      : `<p class="muted">You haven't told PawPal about your lifestyle yet. <a href="ai-matching.html">Describe it now</a> to get personalised matches and new-match alerts.</p>`;
  };
  renderPrefs(me.understood, me.preferencesText);
  document.addEventListener('click', async (e) => {
    if (!e.target.closest('#clearPrefs')) return;
    if (!(await PawPal.confirm({ title: 'Clear your lifestyle profile?', message: 'Your dashboard recommendations and new-match alerts will stop until you describe your lifestyle again.', confirmText: 'Clear', danger: true }))) return;
    try { await PawPalAPI.patch('/users/me', { preferences: null }); renderPrefs([], ''); toast('Lifestyle profile cleared'); } catch (err) { toast(err.message, 'error'); }
  });

  // Details
  // Email settings (in-app notifications are always kept)
  const appEmails = $('#prefAppEmails');
  appEmails.checked = me.user.emailPrefs?.applications !== false;
  appEmails.addEventListener('change', async () => {
    appEmails.disabled = true;
    try {
      await PawPalAPI.patch('/users/me', { emailPrefs: { applications: appEmails.checked } });
      toast(appEmails.checked ? 'You\'ll get emails about your applications' : 'Application emails turned off — you\'ll still see updates in PawPal', appEmails.checked ? 'success' : 'info');
    } catch (err) { appEmails.checked = !appEmails.checked; toast(err.message, 'error'); }
    appEmails.disabled = false;
  });

  $('#detailsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#detailsBtn'); setBusy(btn, true, 'Saving…');
    try { const r = await PawPalAPI.patch('/users/me', { name: $('#pName').value, address: $('#pAddress').value }); $('#detailsMsg').innerHTML = okHTML(r.message); }
    catch (err) { $('#detailsMsg').innerHTML = errorHTML(err.message); }
    setBusy(btn, false);
  });

  // Phone verification
  let cooldown;
  const startCooldown = () => {
    let s = 60; const b = $('#resendCode'); b.disabled = true;
    clearInterval(cooldown);
    cooldown = setInterval(() => { s--; b.textContent = s > 0 ? `Resend in ${s}s` : 'Resend code'; if (s <= 0) { clearInterval(cooldown); b.disabled = false; } }, 1000);
  };
  async function sendCode() {
    const btn = $('#sendCodeBtn'); setBusy(btn, true, 'Sending…'); $('#phoneMsg').innerHTML = '';
    try {
      const r = await PawPalAPI.post('/auth/phone/send', { countryCode: $('#cc').value, phone: $('#phoneNum').value });
      $('#codeSentTo').textContent = r.message; $('#codeForm').hidden = false; $('#otp').value = ''; $('#otp').focus(); startCooldown();
      try { const cfg = await PawPalAPI.get('/config'); if (cfg.smsMode === 'dev') $('#phoneMsg').innerHTML = `<p class="tiny muted">Development mode: the text message appears in the <a href="dev-mailbox.html" target="_blank">dev mailbox</a>.</p>`; } catch { /* ignore */ }
    } catch (err) { $('#phoneMsg').innerHTML = errorHTML(err.message); }
    setBusy(btn, false);
  }
  $('#phoneForm').addEventListener('submit', (e) => { e.preventDefault(); sendCode(); });
  $('#resendCode').addEventListener('click', sendCode);
  $('#otp').addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6); if (e.target.value.length === 6) $('#codeForm').requestSubmit(); });
  $('#codeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#verifyBtn'); setBusy(btn, true, 'Checking…');
    try {
      const r = await PawPalAPI.post('/auth/phone/verify', { code: $('#otp').value });
      phoneBadge(r.user); $('#codeForm').hidden = true; $('#phoneMsg').innerHTML = okHTML(r.message);
    } catch (err) { $('#phoneMsg').innerHTML = errorHTML(err.message); }
    setBusy(btn, false);
  });

  // Password
  $('#pwForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#pwBtn'); setBusy(btn, true, 'Updating…');
    try { const r = await PawPalAPI.post('/users/me/password', { currentPassword: $('#curPw').value, newPassword: $('#newPw').value }); $('#pwMsg').innerHTML = okHTML(r.message); $('#pwForm').reset(); }
    catch (err) { $('#pwMsg').innerHTML = errorHTML(err.message); }
    setBusy(btn, false);
  });
  if (location.hash) document.querySelector(location.hash)?.scrollIntoView();
})();
