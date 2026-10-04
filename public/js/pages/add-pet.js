// Staff: create / edit a pet. Photos are resized in the browser and uploaded to /api/images.
// The AI description only receives public fields; internal notes are never sent.
(async () => {
  const { $, $$, esc, icons, params, toast, setBusy, confirm, errorHTML, statusBadge } = PawPal;
  const u = await PawPal.booted;
  const editId = params.get('id');
  let photos = []; let current = null; let dirty = false;
  const BOOL = ['goodWithChildren', 'goodWithOtherPets', 'requiresYard', 'firstTimeFriendly', 'specialNeeds', 'vaccinated', 'desexed', 'microchipped'];
  const TEXT = ['name', 'type', 'breed', 'colour', 'age', 'gender', 'size', 'adoptionFee', 'location', 'energyLevel', 'idealHome', 'description', 'medicalHistory', 'rescueBackground', 'internalNotes'];

  if (u.role === 'admin') {
    try {
      const { shelters } = await PawPalAPI.get('/shelters');
      $('#shelterField').hidden = false;
      $('#shelterId').innerHTML = '<option value="">No shelter</option>' + shelters.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');
    } catch { /* ignore */ }
  }

  // New pets start with the suggested fee for their species (same values as DEFAULT_FEES in src/constants.js) until staff change it
  const SUGGESTED_FEES = { Dog: 400, Cat: 180, Rabbit: 90, 'Guinea Pig': 50, Hamster: 25, Bird: 70, Reptile: 130, Fish: 20, 'Farm Animal': 300, Other: 50 };
  if (!editId) {
    let feeTouched = false;
    const suggest = () => { if (!feeTouched && SUGGESTED_FEES[$('#type').value] !== undefined) $('#adoptionFee').value = SUGGESTED_FEES[$('#type').value]; };
    $('#adoptionFee').addEventListener('input', () => { feeTouched = true; });
    $('#type').addEventListener('change', suggest);
    suggest();
  }

  if (editId) {
    try {
      const res = await PawPalAPI.get(`/pets/${encodeURIComponent(editId)}`);
      current = res.pet;
      TEXT.forEach((k) => { if (current[k] !== undefined && $(`#${k}`)) $(`#${k}`).value = current[k]; });
      BOOL.forEach((k) => { $(`#${k}`).checked = !!current[k]; });
      $('#traits').value = (current.traits || []).join(', ');
      if (u.role === 'admin') $('#shelterId').value = current.shelterId || '';
      photos = [...(current.photos || [])];
      document.title = `Edit ${current.name} — PawPal shelter portal`;
      $('#pageTitle').textContent = `Edit ${current.name}`; $('#crumb').textContent = current.name;
      $('#statusPill').innerHTML = `${statusBadge(current.status)} <span class="small muted">${res.applicationCount} applications · ${res.enquiryCount} enquiries · ${res.favouriteCount} saves</span>
        <a class="btn btn-sm" href="flyer.html?id=${encodeURIComponent(current.id)}">${PawPal.icons.download}Print flyer</a>
        ${['Available', 'On Hold'].includes(current.status) ? `<button class="btn btn-sm" type="button" id="promoteBtn">${PawPal.icons.sparkle}Promote</button>` : ''}`;
      $('#promoteBtn')?.addEventListener('click', () => PawPalPromote.open(current));
      $('#publishBtn').textContent = current.status === 'Draft' ? 'Publish pet' : 'Save changes';
      $('#draftBtn').textContent = current.status === 'Draft' ? 'Save draft' : 'Move to drafts';
      $('#editActions').hidden = false;
      $('#viewPublic').href = `pet-profile.html?id=${encodeURIComponent(current.id)}`;
    } catch (err) { $('#petForm').innerHTML = `<div style="grid-column:1/-1">${errorHTML(err.message)}</div>`; return; }
  }

  // ---------- photos ----------
  function renderPhotos() {
    $('#photoCount').textContent = `${photos.length} / 8`;
    $('#photoGrid').innerHTML = photos.map((src, i) => `<div class="photo-tile"><img src="${esc(PawPal.sized(src, 300))}" alt="Photo ${i + 1}" data-fallback="${PawPal.PLACEHOLDER}">
      ${i === 0 ? '<span class="badge badge-dark cover">Cover</span>' : ''}
      <div class="tile-actions">${i ? `<button type="button" data-cover="${i}" aria-label="Make photo ${i + 1} the cover" title="Make cover">${icons.star}</button>` : ''}<button type="button" data-remove="${i}" aria-label="Remove photo ${i + 1}" title="Remove">${icons.trash}</button></div></div>`).join('');
  }
  const compress = (file) => new Promise((resolve, reject) => {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return reject(new Error(`${file.name} is not a JPG, PNG or WebP image.`));
    if (file.size > 15 * 1024 * 1024) return reject(new Error(`${file.name} is larger than 15 MB.`));
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, 1400 / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.84));
    };
    img.onerror = () => reject(new Error(`${file.name} could not be read.`));
    img.src = url;
  });
  async function addFiles(files) {
    for (const f of [...files]) {
      if (photos.length >= 8) { toast('You can add up to 8 photos.', 'info'); break; }
      try { const { url } = await PawPalAPI.post('/images', { data: await compress(f) }); photos.push(url); dirty = true; renderPhotos(); }
      catch (err) { toast(err.message, 'error'); }
    }
  }
  const zone = $('#dropZone');
  zone.addEventListener('click', () => $('#photoInput').click());
  zone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#photoInput').click(); } });
  $('#photoInput').addEventListener('change', (e) => { addFiles(e.target.files); e.target.value = ''; });
  ['dragenter', 'dragover'].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add('is-drag'); }));
  ['dragleave', 'drop'].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.remove('is-drag'); }));
  zone.addEventListener('drop', (e) => addFiles(e.dataTransfer.files));
  $('#addUrl').addEventListener('click', () => {
    const url = $('#photoUrl').value.trim();
    if (!/^https:\/\/\S+$/.test(url)) return toast('Paste a full image link starting with https://', 'error');
    if (photos.length >= 8) return toast('You can add up to 8 photos.', 'info');
    photos.push(url); $('#photoUrl').value = ''; dirty = true; renderPhotos();
  });
  $('#photoGrid').addEventListener('click', (e) => {
    const rm = e.target.closest('[data-remove]'); const cv = e.target.closest('[data-cover]');
    if (rm) photos.splice(Number(rm.dataset.remove), 1);
    if (cv) photos.unshift(...photos.splice(Number(cv.dataset.cover), 1));
    if (rm || cv) { dirty = true; renderPhotos(); }
  });
  renderPhotos();

  // ---------- AI description (public fields only) ----------
  $('#aiBtn').addEventListener('click', async () => {
    const body = { name: $('#name').value, type: $('#type').value, breed: $('#breed').value, age: $('#age').value, gender: $('#gender').value, size: $('#size').value,
      energyLevel: $('#energyLevel').value, traits: $('#traits').value, idealHome: $('#idealHome').value,
      goodWithChildren: $('#goodWithChildren').checked, goodWithOtherPets: $('#goodWithOtherPets').checked, requiresYard: $('#requiresYard').checked };
    if (!body.name.trim() || !body.breed.trim()) return toast('Add the name and breed first.', 'error');
    if ($('#description').value.trim() && !(await confirm({ title: 'Replace the description?', message: 'The AI draft will replace what is currently in the description box.', confirmText: 'Replace' }))) return;
    const btn = $('#aiBtn'); setBusy(btn, true, 'Writing…');
    try {
      const r = await PawPalAPI.post('/ai/describe', body);
      $('#description').value = r.description; dirty = true;
      $('#aiNote').innerHTML = `<p class="tiny muted" style="margin-top:6px">${icons.sparkle} Drafted by ${esc(PawPal.aiLabel(r.source, 'PawPal\'s template writer'))} — please review before publishing.</p>`;
    } catch (err) { toast(err.message, 'error'); }
    setBusy(btn, false);
  });

  // ---------- save ----------
  function payload(status) {
    const p = { photos, traits: $('#traits').value, status };
    TEXT.forEach((k) => { p[k] = $(`#${k}`).value; });
    BOOL.forEach((k) => { p[k] = $(`#${k}`).checked; });
    if (u.role === 'admin') p.shelterId = $('#shelterId').value;
    return p;
  }
  async function save(status, btn) {
    $('#formMsg').innerHTML = '';
    if (!$('#name').value.trim() || !$('#breed').value.trim()) { $('#formMsg').innerHTML = errorHTML('Name and breed are required.'); return; }
    if (status !== 'Draft' && !$('#description').value.trim()) { $('#formMsg').innerHTML = errorHTML('Add a public description before publishing (or use Generate with AI).'); return; }
    setBusy(btn, true, 'Saving…');
    try {
      const r = current ? await PawPalAPI.put(`/pets/${encodeURIComponent(current.id)}`, payload(status)) : await PawPalAPI.post('/pets', payload(status));
      dirty = false; toast(r.message);
      location.href = current ? `add-pet.html?id=${encodeURIComponent(r.pet.id)}` : 'pets.html';
    } catch (err) { setBusy(btn, false); $('#formMsg').innerHTML = errorHTML(err.message); }
  }
  $('#petForm').addEventListener('submit', (e) => { e.preventDefault(); save(current && current.status !== 'Draft' ? current.status : 'Available', $('#publishBtn')); });
  $('#draftBtn').addEventListener('click', () => save('Draft', $('#draftBtn')));
  $$('[data-status]').forEach((b) => b.addEventListener('click', async () => {
    const s = b.dataset.status;
    if (!(await confirm({ title: `Mark ${current.name} as ${s.toLowerCase()}?`, message: 'They will leave the public listings and anyone who saved them will be notified.', confirmText: `Mark ${s.toLowerCase()}` }))) return;
    save(s, b);
  }));
  $('#deleteBtn')?.addEventListener('click', async () => {
    if (!(await confirm({ title: `Delete ${current.name}?`, message: 'This permanently removes the listing. Pets with applications can only be archived.', confirmText: 'Delete', danger: true }))) return;
    try { const r = await PawPalAPI.del(`/pets/${encodeURIComponent(current.id)}`); toast(r.message); location.href = 'pets.html'; } catch (err) { toast(err.message, 'error'); }
  });
  $('#petForm').addEventListener('input', () => { dirty = true; });
  window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
})();
