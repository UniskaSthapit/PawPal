// Staff settings: account, password, shelter details, team, system status (admins) and demo reset.
(async () => {
  const { $, esc, icons, toast, setBusy, errorHTML, timeAgo } = PawPal;
  const u = await PawPal.booted;
  const ok = (m) => `<div class="alert alert-success">${icons.checkCircle}<div>${esc(m)}</div></div>`;
  $('#sName').value = u.name; $('#sEmail').value = u.email;
  $('#roleBadge').innerHTML = `<span class="badge badge-sage">${u.role === 'admin' ? 'Administrator' : 'Shelter staff'}</span>`;
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
  if (u.role === 'admin') {
    $('#manageUsers').hidden = false; $('#systemCard').hidden = false;
    try {
      const s = await PawPalAPI.get('/system/status');
      $('#system').innerHTML = `<dl class="kv"><dt>Database</dt><dd>${esc(s.database)}</dd><dt>Email</dt><dd>${esc(s.email)}</dd><dt>SMS</dt><dd>${esc(s.sms)}</dd><dt>AI</dt><dd>${esc(s.ai)}</dd><dt>Maps</dt><dd>${esc(s.maps)}</dd>
        <dt>Records</dt><dd>${s.counts.pets} pets · ${s.counts.apps} applications · ${s.counts.users} users · ${s.counts.shelters} shelters · ${s.counts.mails} emails</dd></dl>
        <h3 style="margin-top:22px;font-size:18px">Recent emails</h3>
        <p class="small muted" style="margin-top:4px">The last emails PawPal tried to send. "Failed" shows the email provider's reason.</p>
        ${s.recentEmails?.length ? `<ul class="plain stack" style="--stack:10px;margin-top:12px">${s.recentEmails.map((m) => `<li class="email-log"><div class="row-between" style="gap:10px;flex-wrap:wrap"><b>${esc(m.subject)}</b>
          <span class="badge ${m.status === 'sent' ? 'badge-sage' : 'badge-danger'}">${m.status === 'sent' ? 'Sent' : 'Failed'}</span></div>
          <span class="small muted">To ${esc(m.to)} · ${esc(timeAgo(m.sentAt))} · via ${esc(m.mode)}</span>${m.error ? `<code class="email-error">${esc(m.error)}</code>` : ''}</li>`).join('')}</ul>`
          : '<p class="small muted" style="margin-top:10px">No emails have been sent yet.</p>'}
        ${s.allowDemoReset ? `<div class="alert alert-warn" style="margin-top:16px">${icons.alert}<div><b>Demo reset is enabled.</b> This wipes all data and reloads the sample data. Turn it off in production with <code>ALLOW_DEMO_RESET=false</code>. <button class="link-btn" id="resetBtn">Reset demo data</button></div></div>` : ''}`;
      $('#resetBtn')?.addEventListener('click', async () => {
        if (!(await PawPal.confirm({ title: 'Reset all data?', message: 'Every user, pet, application and message will be replaced with the sample data. This cannot be undone.', confirmText: 'Reset everything', danger: true }))) return;
        try { const r = await PawPalAPI.post('/system/reset'); toast(r.message); setTimeout(() => { location.href = 'login.html?role=staff'; }, 1200); } catch (err) { toast(err.message, 'error'); }
      });
    } catch (err) { $('#system').innerHTML = errorHTML(err.message); }
  }
})();
