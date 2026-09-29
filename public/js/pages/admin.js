// Administrator: users (role, shelter, access), staff invitations and shelters.
(async () => {
  const { $, $$, esc, icons, toast, modal, setBusy, errorHTML, fmtDate, timeAgo } = PawPal;
  const me = await PawPal.booted;
  let users = []; let shelters = []; let roles = []; let roleTab = '';
  const shelterOptions = (sel) => `<option value="">— None —</option>${shelters.map((s) => `<option value="${esc(s.id)}" ${s.id === sel ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}`;

  async function loadShelters() {
    shelters = (await PawPalAPI.get('/admin/shelters')).shelters;
    $('#shelters').innerHTML = shelters.map((s) => `<div class="card card-pad"><div class="row-between"><h3 style="font-size:19px">${esc(s.name)}</h3><button class="btn btn-sm" data-edit-shelter="${esc(s.id)}">${icons.edit}Edit</button></div>
      <p class="small muted">${esc(s.address || `${s.suburb}, ${s.state}`)}</p><div class="row small" style="margin-top:8px"><span class="badge">${s.pets} pets listed</span><span class="badge">${s.staff} staff</span></div></div>`).join('');
  }
  async function loadUsers() {
    const r = await PawPalAPI.get('/admin/users', { role: roleTab, q: $('#userQ').value.trim() });
    users = r.users; roles = r.roles;
    $('#roleTabs').innerHTML = [['', 'All'], ...roles.map((x) => [x.id, x.label])].map(([k, l]) => `<button class="tab" role="tab" data-role="${k}" aria-selected="${roleTab === k}">${esc(l)}</button>`).join('');
    $('#users').innerHTML = users.map((x) => `<tr data-user="${esc(x.id)}">
      <td class="cell-first"><div class="cell-pet"><span class="avatar">${esc(PawPal.initials(x.name))}</span><div><b>${esc(x.name)}</b><span>${esc(x.email)}${x.role === 'user' ? ` · ${x.applications} applications` : ''}</span></div></div></td>
      <td data-label="Role"><label class="sr-only" for="role-${esc(x.id)}">Role</label><select class="select" id="role-${esc(x.id)}" data-field="role" style="min-height:38px;width:auto" ${x.id === me.id ? 'disabled' : ''}>${roles.map((r2) => `<option value="${r2.id}" ${r2.id === x.role ? 'selected' : ''}>${esc(r2.label)}</option>`).join('')}</select></td>
      <td data-label="Shelter">${x.role === 'user' ? '<span class="muted small">—</span>' : `<label class="sr-only" for="sh-${esc(x.id)}">Shelter</label><select class="select" id="sh-${esc(x.id)}" data-field="shelterId" style="min-height:38px;width:auto;max-width:220px">${shelterOptions(x.shelterId)}</select>`}</td>
      <td data-label="Status">${x.id === me.id ? '<span class="badge badge-sage">You</span>' : `<button class="btn btn-sm ${x.active ? '' : 'btn-sage'}" data-toggle="${x.active ? 'off' : 'on'}">${x.active ? 'Deactivate' : 'Reactivate'}</button>`}</td>
      <td data-label="Joined"><span class="small muted">${esc(fmtDate(x.createdAt))}${x.lastLoginAt ? `<br>seen ${esc(timeAgo(x.lastLoginAt))}` : ''}</span></td></tr>`).join('');
  }
  async function patchUser(id, body) {
    try { const r = await PawPalAPI.patch(`/admin/users/${encodeURIComponent(id)}`, body); toast(r.message); } catch (err) { toast(err.message, 'error'); }
    loadUsers(); loadShelters();
  }
  $('#users').addEventListener('change', (e) => { const f = e.target.closest('[data-field]'); if (f) patchUser(f.closest('[data-user]').dataset.user, { [f.dataset.field]: f.value }); });
  $('#users').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-toggle]'); if (!b) return;
    const id = b.closest('[data-user]').dataset.user; const on = b.dataset.toggle === 'on';
    if (!on && !(await PawPal.confirm({ title: 'Deactivate this account?', message: 'They will be signed out everywhere and unable to log in until reactivated.', confirmText: 'Deactivate', danger: true }))) return;
    patchUser(id, { active: on });
  });
  $('#roleTabs').addEventListener('click', (e) => { const t = e.target.closest('[data-role]'); if (t) { roleTab = t.dataset.role; loadUsers(); } });
  let t; $('#userQ').addEventListener('input', () => { clearTimeout(t); t = setTimeout(loadUsers, 250); });

  $('#inviteBtn').addEventListener('click', () => modal({ title: 'Invite a team member', body: `<div class="stack">
      <div class="field"><label for="iName">Name</label><input class="input" id="iName"></div><div class="field"><label for="iEmail">Email</label><input class="input" id="iEmail" type="email"></div>
      <div class="field"><label for="iRole">Role</label><select class="select" id="iRole"><option value="staff">Shelter staff</option><option value="admin">Administrator</option></select></div>
      <div class="field"><label for="iShelter">Shelter</label><select class="select" id="iShelter">${shelterOptions(shelters[0]?.id)}</select></div>
      <p class="small muted">They'll receive an email with a temporary password to change on first login.</p><div id="iErr"></div></div>`,
    actions: [{ label: 'Cancel', value: false }, { label: 'Send invite', variant: 'btn-primary', onClick: async (m, btn) => {
      setBusy(btn, true, 'Inviting…');
      try { const r = await PawPalAPI.post('/admin/users', { name: $('#iName', m).value, email: $('#iEmail', m).value, role: $('#iRole', m).value, shelterId: $('#iShelter', m).value }); toast(r.message); loadUsers(); loadShelters(); return true; }
      catch (err) { setBusy(btn, false); $('#iErr', m).innerHTML = errorHTML(err.message); return false; }
    } }] }));

  function shelterModal(s = {}) {
    modal({ title: s.id ? `Edit ${s.name}` : 'Add a shelter', body: `<div class="form-grid">
      <div class="field full"><label for="shName">Name</label><input class="input" id="shName" value="${esc(s.name || '')}"></div>
      <div class="field"><label for="shSuburb">Suburb</label><input class="input" id="shSuburb" value="${esc(s.suburb || '')}"></div>
      <div class="field"><label for="shState">State</label><select class="select" id="shState">${['VIC', 'NSW', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'].map((x) => `<option ${x === s.state ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
      <div class="field full"><label for="shAddress">Street address</label><input class="input" id="shAddress" value="${esc(s.address || '')}"></div>
      <div class="field"><label for="shPhone">Phone</label><input class="input" id="shPhone" value="${esc(s.phone || '')}"></div>
      <div class="field"><label for="shEmail">Email</label><input class="input" id="shEmail" value="${esc(s.email || '')}"></div>
      <div class="field full"><label for="shHours">Opening hours</label><input class="input" id="shHours" value="${esc(s.hours || '')}"></div>
      <div class="field full"><label for="shAbout">About (public)</label><textarea class="textarea" id="shAbout" style="min-height:80px">${esc(s.about || '')}</textarea></div><div class="full" id="shErr"></div></div>`,
    wide: true, actions: [{ label: 'Cancel', value: false }, { label: 'Save shelter', variant: 'btn-primary', onClick: async (m, btn) => {
      const body = Object.fromEntries(['name', 'suburb', 'state', 'address', 'phone', 'email', 'hours', 'about'].map((k) => [k, $(`#sh${k[0].toUpperCase()}${k.slice(1)}`, m).value]));
      setBusy(btn, true, 'Saving…');
      try { const r = s.id ? await PawPalAPI.put(`/admin/shelters/${encodeURIComponent(s.id)}`, body) : await PawPalAPI.post('/admin/shelters', body); toast(r.message); loadShelters(); return true; }
      catch (err) { setBusy(btn, false); $('#shErr', m).innerHTML = errorHTML(err.message); return false; }
    } }] });
  }
  $('#addShelter').addEventListener('click', () => shelterModal());
  $('#shelters').addEventListener('click', (e) => { const b = e.target.closest('[data-edit-shelter]'); if (b) shelterModal(shelters.find((s) => s.id === b.dataset.editShelter)); });
  try { await loadShelters(); await loadUsers(); } catch (err) { $('#users').innerHTML = `<tr><td colspan="5">${errorHTML(err.message)}</td></tr>`; }
})();
