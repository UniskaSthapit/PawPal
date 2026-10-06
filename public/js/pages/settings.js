// Staff settings: account, password, shelter details, team, system status (admins) and demo reset.
(async () => {
  const { $, esc, icons, toast, setBusy, errorHTML, timeAgo } = PawPal;
  const u = await PawPal.booted;
  const ok = (m) => `<div class="alert alert-success">${icons.checkCircle}<div>${esc(m)}</div></div>`;
  $('#sName').value = u.name; $('#sEmail').value = u.email;
  $('#roleBadge').innerHTML = `<span class="badge badge-sage">${u.role === 'admin' ? 'Administrator' : 'Shelter staff'}</span>`;
  const activity = $('#prefActivity');
  activity.checked = u.emailPrefs?.activity !== false;
  activity.addEventListener('change', async () => {
    activity.disabled = true;
    try { await PawPalAPI.patch('/users/me', { emailPrefs: { activity: activity.checked } }); toast(activity.checked ? 'Shelter activity emails on' : 'Shelter activity emails off — notifications still appear in PawPal', activity.checked ? 'success' : 'info'); }
    catch (err) { activity.checked = !activity.checked; toast(err.message, 'error'); }
    activity.disabled = false;
  });
  $('#acctForm').addEventListener('submit', async (e) => { e.preventDefault(); const b = $('#acctBtn'); setBusy(b, true, 'Saving…');
    try { const r = await PawPalAPI.patch('/users/me', { name: $('#sName').value }); $('#acctMsg').innerHTML = ok(r.message); } catch (err) { $('#acctMsg').innerHTML = errorHTML(err.message); } setBusy(b, false); });
  $('#pwForm').addEventListener('submit', async (e) => { e.preventDefault(); const b = $('#pwBtn'); setBusy(b, true, 'Updating…');
    try { const r = await PawPalAPI.post('/users/me/password', { currentPassword: $('#curPw').value, newPassword: $('#newPw').value }); $('#pwMsg').innerHTML = ok(r.message); $('#pwForm').reset(); } catch (err) { $('#pwMsg').innerHTML = errorHTML(err.message); } setBusy(b, false); });
  try {
    const { shelters } = await PawPalAPI.get('/shelters');
    const s = shelters.find((x) => x.id === u.shelterId);
    $('#shelterInfo').innerHTML = s ? `<h3 style="font-size:20px">${esc(s.name)}</h3><dl class="kv" style="margin-top:12px"><dt>Address</dt><dd>${esc(s.address || `${s.suburb}, ${s.state}`)}</dd><dt>Phone</dt><dd>${esc(s.phone || '—')}</dd><dt>Email</dt><dd>${esc(s.email || '—')}</dd><dt>Hours</dt><dd>${esc(s.hours || '—')}</dd></dl>
      <p class="tiny muted" style="margin-top:12px">Shelter details are shown on every pet profile. ${u.role === 'admin' ? '<a href="admin.html">Edit shelters</a>' : 'Ask an administrator to update them.'}</p>`
      : `<p class="muted">${u.role === 'admin' ? `You can see all ${shelters.length} shelters. <a href="admin.html">Manage shelters</a>` : 'You are not assigned to a shelter yet. Ask an administrator.'}</p>`;
  } catch { $('#shelterInfo').textContent = ''; }
  try {
    const { staff, adopterCount } = await PawPalAPI.get('/users/staff');
    $('#team').innerHTML = staff.map((m) => `<div class="list-row"><span class="avatar">${esc(PawPal.initials(m.name))}</span><div class="grow"><b>${esc(m.name)}</b><span class="sub">${esc(m.email)} · ${m.role === 'admin' ? 'Administrator' : 'Staff'} · ${m.lastLoginAt ? `last seen ${esc(timeAgo(m.lastLoginAt))}` : 'never logged in'}</span></div>${m.active ? '' : '<span class="badge">Deactivated</span>'}</div>`).join('')
      + `<div class="card-foot small muted">${adopterCount} adopter accounts on PawPal</div>`;
  } catch (err) { $('#team').innerHTML = `<div class="card-body">${errorHTML(err.message)}</div>`; }
  // ---------- Two-factor authentication ----------
  const tf = { body: $('#tfBody'), badge: $('#tfBadge') };
  async function renderTwoFactor() {
    let st;
    try { st = await PawPalAPI.get('/auth/2fa/status'); } catch (err) { tf.body.innerHTML = errorHTML(err.message); return; }
    tf.badge.innerHTML = st.enabled ? '<span class="badge badge-sage">On</span>' : '<span class="badge">Off</span>';
    const requiredNote = st.required ? `<div class="alert alert-warn">${icons.shield}<div>Your administrator requires two-factor authentication for all staff.${st.enabled ? '' : ' Set it up to keep using the shelter portal.'}</div></div>` : '';
    if (!st.enabled) {
      tf.body.innerHTML = `${requiredNote}<p>Even if someone learns your password, they can't sign in without your phone.</p>
        <div><button class="btn btn-primary" id="tfStart" type="button">${icons.shield}Set up two-factor authentication</button></div>`;
      $('#tfStart').addEventListener('click', startSetup);
    } else {
      tf.body.innerHTML = `${requiredNote}<p>On since ${esc(PawPal.fmtDate(st.enabledAt))}. You have <b>${st.backupCodesLeft}</b> unused backup code${st.backupCodesLeft === 1 ? '' : 's'}.</p>
        ${st.required ? '' : `<details class="tf-off"><summary class="link-btn">Turn off two-factor authentication</summary>
        <form id="tfOffForm" class="stack" style="margin-top:14px;max-width:420px" novalidate>
          <div class="field"><label for="tfOffPw">Your password</label><input class="input" type="password" id="tfOffPw" autocomplete="current-password"></div>
          <div class="field"><label for="tfOffCode">Current code from your app (or a backup code)</label><input class="input otp-input" id="tfOffCode" inputmode="numeric" autocomplete="one-time-code" maxlength="11"></div>
          <div><button class="btn btn-danger" id="tfOffBtn">Turn off</button></div><div id="tfOffMsg"></div></form></details>`}`;
      $('#tfOffForm')?.addEventListener('submit', async (e) => {
        e.preventDefault(); const b = $('#tfOffBtn'); setBusy(b, true, 'Turning off…');
        try { const r = await PawPalAPI.post('/auth/2fa/disable', { password: $('#tfOffPw').value, code: $('#tfOffCode').value }); toast(r.message, 'info'); renderTwoFactor(); }
        catch (err) { setBusy(b, false); $('#tfOffMsg').innerHTML = errorHTML(err.message); }
      });
    }
  }
  async function startSetup() {
    let s;
    try { s = await PawPalAPI.post('/auth/2fa/setup'); } catch (err) { toast(err.message, 'error'); return; }
    const grouped = s.secret.match(/.{1,4}/g).join(' ');
    tf.body.innerHTML = `<ol class="tf-steps">
        <li><b>Scan this QR code</b> with your authenticator app.
          <div class="tf-setup"><div class="tf-qr">${PawPalQR.svg(s.otpauthUrl, { label: 'QR code for setting up PawPal in an authenticator app' })}</div>
          <div class="small"><p class="muted">Can't scan it? Choose "enter a setup key" in your app and type:</p>
            <p class="tf-secret" aria-label="Setup key"><code>${esc(grouped)}</code></p>
            <p class="muted">Account: ${esc(s.account)} · Type: time-based</p></div></div></li>
        <li><b>Enter the 6-digit code</b> your app shows for PawPal.
          <form id="tfEnableForm" class="row" style="margin-top:10px;gap:10px;align-items:flex-end" novalidate>
            <div class="field" style="margin:0"><label class="sr-only" for="tfEnableCode">6-digit code</label>
              <input class="input otp-input" id="tfEnableCode" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="123456" style="width:160px"></div>
            <button class="btn btn-primary" id="tfEnableBtn">Turn on</button><button class="btn btn-ghost" type="button" id="tfCancel">Cancel</button>
          </form><div id="tfEnableMsg" style="margin-top:10px"></div></li></ol>`;
    $('#tfEnableCode').focus();
    $('#tfCancel').addEventListener('click', renderTwoFactor);
    $('#tfEnableForm').addEventListener('submit', async (e) => {
      e.preventDefault(); const b = $('#tfEnableBtn'); setBusy(b, true, 'Checking…');
      try { const r = await PawPalAPI.post('/auth/2fa/enable', { code: $('#tfEnableCode').value.trim() }); showBackupCodes(r.backupCodes, r.message); }
      catch (err) { setBusy(b, false); $('#tfEnableMsg').innerHTML = errorHTML(err.message); }
    });
  }
  function showBackupCodes(codes, message) {
    tf.badge.innerHTML = '<span class="badge badge-sage">On</span>';
    tf.body.innerHTML = `<div class="alert alert-success">${icons.checkCircle}<div>${esc(message)}</div></div>
      <p><b>Your backup codes.</b> Each works once if you lose your phone. This is the only time they're shown.</p>
      <ul class="tf-codes">${codes.map((c) => `<li><code>${esc(c)}</code></li>`).join('')}</ul>
      <div class="row"><button class="btn" id="tfCopy" type="button">${icons.clipboard}Copy</button><button class="btn" id="tfDownload" type="button">${icons.download}Download .txt</button>
        <button class="btn btn-primary" id="tfDone" type="button">I've saved them</button></div>`;
    const text = `PawPal backup codes for ${u.email}\nEach code works once.\n\n${codes.join('\n')}\n`;
    $('#tfCopy').addEventListener('click', () => navigator.clipboard?.writeText(text).then(() => toast('Backup codes copied'), () => toast('Copy failed — select the codes and copy them', 'error')));
    $('#tfDownload').addEventListener('click', () => {
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' })); a.download = 'pawpal-backup-codes.txt'; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
    $('#tfDone').addEventListener('click', renderTwoFactor);
  }
  renderTwoFactor();
  if (location.hash === '#twofactor') setTimeout(() => $('#twofactor').scrollIntoView({ block: 'start' }), 200);

  const EMAIL_BADGE = { sent: ['Sent', 'badge-sage'], skipped: ['Skipped', ''], deferred: ['Deferred', 'badge-honey'], failed: ['Failed', 'badge-danger'] };
  if (u.role === 'admin') {
    $('#manageUsers').hidden = false; $('#systemCard').hidden = false;
    try {
      const s = await PawPalAPI.get('/system/status');
      $('#system').innerHTML = `<dl class="kv"><dt>Database</dt><dd>${esc(s.database)}</dd><dt>Email</dt><dd>${esc(s.email)}</dd><dt>Sent today</dt><dd>${s.mail.sentToday} of ${s.mail.dailyLimit} (daily limit, Melbourne time)${s.mail.deferredToday ? ` · ${s.mail.deferredToday} deferred` : ''}${s.mail.failedToday ? ` · ${s.mail.failedToday} failed` : ''}</dd><dt>SMS</dt><dd>${esc(s.sms)}</dd><dt>AI</dt><dd>${esc(s.ai)}</dd><dt>Maps</dt><dd>${esc(s.maps)}</dd>
        <dt>Records</dt><dd>${s.counts.pets} pets · ${s.counts.apps} applications · ${s.counts.users} users · ${s.counts.shelters} shelters · ${s.counts.mails} emails</dd></dl>
        ${s.mail.problems.map((p) => `<div class="alert alert-warn" style="margin-top:16px">${icons.mail}<div>${esc(p.message)}</div></div>`).join('')}
        <h3 style="margin-top:22px;font-size:18px">Recent emails</h3>
        <p class="small muted" style="margin-top:4px">The last 20 emails PawPal tried to send. Skipped, deferred and failed emails show the reason.</p>
        ${s.recentEmails?.length ? `<ul class="plain stack" style="--stack:10px;margin-top:12px">${s.recentEmails.map((m) => `<li class="email-log"><div class="row-between" style="gap:10px;flex-wrap:wrap"><b>${esc(m.subject)}</b>
          <span class="badge ${EMAIL_BADGE[m.status]?.[1] ?? 'badge-danger'}">${EMAIL_BADGE[m.status]?.[0] || 'Failed'}</span></div>
          <span class="small muted">To ${esc(m.to)} · ${esc(timeAgo(m.sentAt))} · via ${esc(m.mode)}${m.retried ? ' · sent on retry' : ''}</span>${m.error ? `<code class="email-error">${esc(m.error)}</code>` : ''}</li>`).join('')}</ul>`
          : '<p class="small muted" style="margin-top:10px">No emails have been sent yet.</p>'}
        ${s.allowDemoReset ? `<div class="alert alert-warn" style="margin-top:16px">${icons.alert}<div><b>Demo reset is enabled.</b> This wipes all data and reloads the sample data. Turn it off in production with <code>ALLOW_DEMO_RESET=false</code>. <button class="link-btn" id="resetBtn">Reset demo data</button></div></div>` : ''}`;
      $('#resetBtn')?.addEventListener('click', async () => {
        if (!(await PawPal.confirm({ title: 'Reset all data?', message: 'Every user, pet, application and message will be replaced with the sample data. This cannot be undone.', confirmText: 'Reset everything', danger: true }))) return;
        try { const r = await PawPalAPI.post('/system/reset'); toast(r.message); setTimeout(() => { location.href = 'login.html?role=staff'; }, 1200); } catch (err) { toast(err.message, 'error'); }
      });
    } catch (err) { $('#system').innerHTML = errorHTML(err.message); }
  }
})();
