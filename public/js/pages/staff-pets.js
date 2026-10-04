// Staff pet list: status tabs, search, inline status change, quick actions.
(async () => {
  const { $, $$, esc, icons, statusBadge, fmtDate, ageText, toast, emptyHTML, errorHTML, params } = PawPal;
  await PawPal.booted;
  const STATUSES = ['Available', 'On Hold', 'Draft', 'Adopted', 'Archived'];
  let pets = []; let tab = params.get('status') || 'all';
  const render = () => {
    const q = $('#petQ').value.trim().toLowerCase();
    const counts = Object.fromEntries(STATUSES.map((s) => [s, pets.filter((p) => p.status === s).length]));
    $('#statusTabs').innerHTML = [['all', 'All', pets.length], ...STATUSES.map((s) => [s, s, counts[s]])].map(([k, l, n]) => `<button class="tab" role="tab" data-tab="${esc(k)}" aria-selected="${tab === k}">${esc(l)} <span class="n">${n}</span></button>`).join('');
    const list = pets.filter((p) => (tab === 'all' || p.status === tab) && (!q || `${p.name} ${p.breed} ${p.location}`.toLowerCase().includes(q)));
    $('#petCount').textContent = `${list.length} shown`;
    $('#petRows').innerHTML = list.length ? list.map((p) => `<tr>
      <td class="cell-first"><div class="cell-pet"><img src="${esc(PawPal.sized(PawPal.photo(p), 200))}" alt="" data-fallback="${PawPal.FALLBACK[p.type]}"><div><b>${esc(p.name)}</b><span>${esc(p.breed)} · ${esc(ageText(p.age))}</span></div></div></td>
      <td data-label="Status"><label class="sr-only" for="st-${esc(p.id)}">Status for ${esc(p.name)}</label><select class="select" id="st-${esc(p.id)}" data-status-for="${esc(p.id)}" style="min-height:38px;width:auto">${STATUSES.map((s) => `<option ${s === p.status ? 'selected' : ''}>${s}</option>`).join('')}</select></td>
      <td data-label="Details"><span class="small">${esc(p.type)} · ${esc(p.size)} · ${esc(p.location || '—')}</span></td>
      <td data-label="Listed"><span class="small muted">${esc(fmtDate(p.createdAt))}</span></td>
      <td data-label="Actions"><div class="row" style="gap:4px;flex-wrap:nowrap"><a class="btn btn-sm" href="add-pet.html?id=${encodeURIComponent(p.id)}">${icons.edit}Edit</a>
        <a class="btn btn-sm" href="flyer.html?id=${encodeURIComponent(p.id)}" aria-label="Print a flyer for ${esc(p.name)}">${icons.download}Flyer</a>
        ${['Available', 'On Hold'].includes(p.status) ? `<button class="btn btn-sm" type="button" data-promote="${esc(p.id)}" aria-label="Make a social post for ${esc(p.name)}">${icons.sparkle}Promote</button>` : ''}
        ${['Available', 'On Hold', 'Adopted'].includes(p.status) ? `<a class="btn btn-sm btn-ghost btn-icon" href="pet-profile.html?id=${encodeURIComponent(p.id)}" target="_blank" aria-label="View ${esc(p.name)}'s public profile">${icons.external}</a>` : ''}</div></td></tr>`).join('')
      : `<tr><td colspan="5">${emptyHTML({ icon: 'paw', title: 'No pets here', text: 'Try another tab or search, or add a new pet.', action: '<a class="btn btn-primary" href="add-pet.html">Add a pet</a>' })}</td></tr>`;
  };
  try { pets = (await PawPalAPI.get('/pets', { all: 1 })).pets; render(); } catch (err) { $('#petRows').innerHTML = `<tr><td colspan="5">${errorHTML(err.message)}</td></tr>`; }
  $('#petQ').addEventListener('input', render);
  $('#statusTabs').addEventListener('click', (e) => { const t = e.target.closest('[data-tab]'); if (t) { tab = t.dataset.tab; render(); } });
  $('#petRows').addEventListener('click', (e) => {
    const b = e.target.closest('[data-promote]'); if (!b) return;
    const pet = pets.find((x) => x.id === b.dataset.promote); if (pet) PawPalPromote.open(pet);
  });
  $('#petRows').addEventListener('change', async (e) => {
    const sel = e.target.closest('[data-status-for]');
    if (!sel) return;
    const pet = pets.find((p) => p.id === sel.dataset.statusFor);
    const prev = pet.status;
    if (['Adopted', 'Archived'].includes(sel.value) && !(await PawPal.confirm({ title: `Mark ${pet.name} as ${sel.value.toLowerCase()}?`, message: 'They will be removed from the public listings and anyone who saved them will be notified.', confirmText: `Mark ${sel.value.toLowerCase()}` }))) { sel.value = prev; return; }
    try { const r = await PawPalAPI.put(`/pets/${encodeURIComponent(pet.id)}`, { status: sel.value }); pet.status = r.pet.status; toast(r.message); render(); }
    catch (err) { sel.value = prev; toast(err.message, 'error'); }
  });
})();
