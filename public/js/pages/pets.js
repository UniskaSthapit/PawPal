// Staff: manage pets (FR-01) — search, filter, change status, edit, delete.
(async () => {
  const { $, esc, fmtDate, ageText, photo, PLACEHOLDER, toast, confirm } = PawPal;
  $('#today').textContent = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
  let pets = [];
  const STATUSES = ['Available', 'Pending Adoption', 'Adopted', 'Draft'];

  function render() {
    const q = $('#petSearch').value.trim().toLowerCase();
    const type = $('#typeFilter').value;
    const status = $('#statusFilter').value;
    const list = pets.filter((p) => (!q || `${p.name} ${p.breed} ${p.location}`.toLowerCase().includes(q)) && (!type || p.type === type) && (!status || p.status === status));
    $('#petBody').innerHTML = list.length ? list.map((p) => `<tr>
        <td><div class="applicant"><img class="pet-thumb" src="${esc(photo(p))}" alt="" onerror="this.onerror=null;this.src='${PLACEHOLDER}'"/><div><div class="pet-name">${esc(p.name)}</div><div class="pet-breed">${esc(p.breed)}</div></div></div></td>
        <td>${esc(p.type)}</td><td class="muted">${esc(ageText(p.age))}</td><td class="muted">${esc(p.location || '—')}</td>
        <td><select class="status-select" data-status="${esc(p.id)}" aria-label="Status for ${esc(p.name)}">${STATUSES.map((s) => `<option ${s === p.status ? 'selected' : ''}>${s}</option>`).join('')}</select></td>
        <td class="muted">${fmtDate(p.createdAt)}</td>
        <td><div class="row-actions">
          <a class="action-link" href="pet-profile.html?id=${encodeURIComponent(p.id)}" target="_blank" rel="noopener">View</a>
          <a class="action-link" href="add-pet.html?id=${encodeURIComponent(p.id)}">Edit</a>
          <button class="action-link action-link-danger" data-delete="${esc(p.id)}">Delete</button></div></td></tr>`).join('')
      : `<tr><td colspan="7"><div class="pp-empty"><div class="pp-empty-emoji">🐾</div><h3>${pets.length ? 'No pets match these filters' : 'No pets yet'}</h3>
          <p>${pets.length ? 'Try clearing the search or filters.' : 'Add your first pet to publish them on PawPal.'}</p><a class="pp-btn pp-btn-primary" href="add-pet.html">Add a pet</a></div></td></tr>`;
  }

  function counts() {
    const c = (s) => pets.filter((p) => p.status === s).length;
    $('#cTotal').textContent = pets.length;
    $('#cAvail').textContent = c('Available');
    $('#cPending').textContent = c('Pending Adoption');
    $('#cAdopted').textContent = c('Adopted');
    $('#cDraft').textContent = c('Draft');
  }

  async function load() {
    try { ({ pets } = await PawPalAPI.get('/pets', { all: 1, sort: 'newest' })); counts(); render(); }
    catch (err) { $('#petBody').innerHTML = `<tr><td colspan="7">${esc(err.message)}</td></tr>`; }
  }

  ['petSearch', 'typeFilter', 'statusFilter'].forEach((id) => $('#' + id).addEventListener('input', render));
  $('#petBody').addEventListener('change', async (e) => {
    const sel = e.target.closest('[data-status]');
    if (!sel) return;
    try {
      const { pet } = await PawPalAPI.put(`/pets/${sel.dataset.status}`, { status: sel.value });
      pets = pets.map((p) => (p.id === pet.id ? pet : p));
      counts();
      toast(`${pet.name} is now ${pet.status}`);
    } catch (err) { toast(err.message, 'error'); load(); }
  });
  $('#petBody').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-delete]');
    if (!b) return;
    const pet = pets.find((p) => p.id === b.dataset.delete);
    const ok = await confirm({ title: `Delete ${pet.name}?`, message: 'This removes the pet profile from PawPal permanently. Existing applications keep their history.', confirmText: 'Delete pet', danger: true });
    if (!ok) return;
    try { const r = await PawPalAPI.del(`/pets/${pet.id}`); toast(r.message); load(); }
    catch (err) { toast(err.message, 'error'); }
  });

  if (PawPal.params.get('saved')) toast('Pet saved');
  load();
})();
