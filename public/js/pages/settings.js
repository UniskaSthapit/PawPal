// Staff settings — account, password, staff team management, system status, demo reset.
(async () => {
  const { $, esc, fmtDateTime, toast, setBusy, modal, confirm } = PawPal;
  $('#today').textContent = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
  const me = await PawPal.ready;
  if (me) { $('#sName').value = me.name; $('#sEmail').value = me.email; }

  $('#accountForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    setBusy($('#saveAccount'), true, 'Saving…');
    try { await PawPalAPI.patch('/users/me', { name: $('#sName').value }); toast('Account saved'); } catch (err) { toast(err.message, 'error'); }
    setBusy($('#saveAccount'), false);
  });
  $('#pwForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    setBusy($('#savePw'), true, 'Updating…');
    try { const r = await PawPalAPI.post('/users/me/password', { currentPassword: $('#curPw').value, newPassword: $('#newPw').value }); e.target.reset(); toast(r.message); }
    catch (err) { toast(err.message, 'error'); }
    setBusy($('#savePw'), false);
  });

  async function loadStaff() {
    try {
      const { staff, adopterCount } = await PawPalAPI.get('/users/staff');
      $('#adopterCount').textContent = `${staff.length} staff member${staff.length === 1 ? '' : 's'} · ${adopterCount} adopter account${adopterCount === 1 ? '' : 's'}`;
      $('#staffBody').innerHTML = staff.map((s) => `<tr>
          <td><div class="applicant"><div class="avatar">${esc(PawPal.initials(s.name))}</div><span class="applicant-name">${esc(s.name)}${s.id === me?.id ? ' <span class="muted">(you)</span>' : ''}</span></div></td>
          <td class="muted">${esc(s.email)}</td><td class="muted">${s.lastLoginAt ? esc(fmtDateTime(s.lastLoginAt)) : 'Never'}</td>
          <td>${s.active ? '<span class="badge badge-approved">Active</span>' : '<span class="badge badge-withdrawn">Deactivated</span>'}</td>
          <td>${s.id === me?.id ? '' : `<button class="action-link ${s.active ? 'action-link-danger' : ''}" data-toggle="${esc(s.id)}" data-active="${s.active}" data-name="${esc(s.name)}">${s.active ? 'Deactivate' : 'Reactivate'}</button>`}</td></tr>`).join('');
    } catch (err) { $('#staffBody').innerHTML = `<tr><td colspan="5">${esc(err.message)}</td></tr>`; }
  }
  $('#staffBody').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-toggle]');
    if (!b) return;
    const activate = b.dataset.active !== 'true';
    if (!activate && !(await confirm({ title: `Deactivate ${b.dataset.name}?`, message: 'They will be signed out and unable to log in until reactivated.', confirmText: 'Deactivate', danger: true }))) return;
    try { const r = await PawPalAPI.patch(`/users/staff/${b.dataset.toggle}`, { active: activate }); toast(r.message); loadStaff(); }
    catch (err) { toast(err.message, 'error'); }
  });
  $('#addStaffBtn').addEventListener('click', () => modal({
    title: 'Add staff member',
    body: `<p class="pp-modal-text" style="margin-bottom:14px">They'll receive an email with a temporary password and a link to the staff login.</p>
      <div class="pp-field"><label for="nsName">Full name</label><input class="pp-input" id="nsName" autocomplete="off"/></div>
      <div class="pp-field"><label for="nsEmail">Work email</label><input class="pp-input" id="nsEmail" type="email" autocomplete="off"/></div>`,
    actions: [{ label: 'Cancel' }, { label: 'Add and send invite', variant: 'pp-btn-primary', onClick: async (root, btn) => {
      setBusy(btn, true, 'Adding…');
      try { const r = await PawPalAPI.post('/users/staff', { name: root.querySelector('#nsName').value, email: root.querySelector('#nsEmail').value }); toast(r.message); loadStaff(); return true; }
      catch (err) { toast(err.message, 'error'); setBusy(btn, false); return false; }
    } }],
  }));

  try {
    const s = await PawPalAPI.get('/system/status');
    const devMail = s.email.startsWith('Dev mailbox');
    $('#systemList').innerHTML = `<dt>Database</dt><dd>${esc(s.database)}</dd>
      <dt>Email</dt><dd>${esc(s.email)}${devMail ? ' — <a href="dev-mailbox.html" target="_blank" rel="noopener">open mailbox</a>' : ''}</dd>
      <dt>AI</dt><dd>${esc(s.ai)}</dd><dt>Maps</dt><dd>${esc(s.maps)}</dd>
      <dt>Records</dt><dd>${s.counts.pets} pets · ${s.counts.apps} applications · ${s.counts.users} accounts · ${s.counts.mails} emails</dd>`;
    if (!s.allowDemoReset) $('#demoCard').hidden = true;
  } catch (err) { $('#systemList').innerHTML = `<dt>Error</dt><dd>${esc(err.message)}</dd>`; }

  $('#resetBtn').addEventListener('click', async (e) => {
    const ok = await confirm({ title: 'Reset all data?', message: 'Every pet, application, account and email will be replaced with the sample data. You will need to log in again with admin@pawpal.com.', confirmText: 'Reset everything', danger: true });
    if (!ok) return;
    setBusy(e.target, true, 'Resetting…');
    try { await PawPalAPI.post('/system/reset'); location.href = 'login.html?role=staff'; }
    catch (err) { toast(err.message, 'error'); setBusy(e.target, false); }
  });

  loadStaff();
})();
