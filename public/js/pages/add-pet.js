// Staff: add or edit a pet (FR-01), AI description (FR-02), staff-only fields (FR-03).
(async () => {
  const { $, esc, toast, setBusy, confirm, params } = PawPal;
  const editId = params.get('id');
  let photos = [];
  let status = 'Available';
  let dirty = false;

  // ---------- load for editing ----------
  if (editId) {
    try {
      const { pet } = await PawPalAPI.get(`/pets/${encodeURIComponent(editId)}`);
      status = pet.status;
      document.title = `PawPal Admin — Edit ${pet.name}`;
      $('#pageTitle').textContent = `Edit ${pet.name}`;
      $('#crumb').textContent = `Edit ${pet.name}`;
      $('#statusPill').hidden = false;
      $('#statusPill').textContent = `Status: ${pet.status}`;
      $('#petName').value = pet.name; $('#type').value = pet.type; $('#breed').value = pet.breed; $('#age').value = pet.age;
      $('#gender').value = pet.gender; $('#size').value = pet.size; $('#location').value = pet.location || ''; $('#energyLevel').value = String(pet.energyLevel || 2);
      $('#keywords').value = (pet.traits || []).join(', ');
      ['goodWithChildren', 'goodWithOtherPets', 'requiresYard', 'vaccinated', 'desexed', 'microchipped'].forEach((k) => { $('#' + k).checked = !!pet[k]; });
      $('#aiDescription').value = pet.description || '';
      $('#medical').value = pet.medicalHistory || '';
      $('#rescue').value = pet.rescueBackground || '';
      photos = [...(pet.photos || [])];
      $('#publishBtn').textContent = pet.status === 'Draft' ? 'Publish Pet Profile' : 'Save Changes';
      $('#draftBtn').textContent = pet.status === 'Draft' ? 'Save Draft' : 'Move to Drafts';
    } catch (err) {
      $('#petForm').innerHTML = `<div class="pp-empty"><h3>This pet could not be loaded</h3><p>${esc(err.message)}</p><a class="pp-btn pp-btn-primary" href="pets.html">Back to Manage Pets</a></div>`;
      return;
    }
  }

  // ---------- photos ----------
  function renderPhotos() {
    $('#photoGrid').innerHTML = photos.map((src, i) => `<div class="photo-item">
        <img src="${esc(src)}" alt="Pet photo ${i + 1}" onerror="this.onerror=null;this.src='images/pet-placeholder.svg'"/>
        ${i === 0 ? '<span class="photo-cover">Cover</span>' : `<button type="button" class="photo-make-cover" data-cover="${i}">Make cover</button>`}
        <button type="button" class="photo-remove" data-remove="${i}" aria-label="Remove photo ${i + 1}">✕</button></div>`).join('');
  }
  // Resize big photos in the browser so uploads stay small (max 1000px, JPEG)
  const compress = (file) => new Promise((resolve, reject) => {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return reject(new Error(`${file.name} is not a JPG, PNG or WebP image.`));
    if (file.size > 12 * 1024 * 1024) return reject(new Error(`${file.name} is larger than 12 MB.`));
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, 1000 / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => reject(new Error(`${file.name} could not be read.`));
    img.src = url;
  });
  async function addFiles(files) {
    for (const f of [...files]) {
      if (photos.length >= 8) { toast('You can add up to 8 photos.', 'info'); break; }
      try { photos.push(await compress(f)); dirty = true; } catch (err) { toast(err.message, 'error'); }
    }
    renderPhotos();
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
    if (!/^https:\/\/\S+$/.test(url)) return toast('Paste a full image link that starts with https://', 'error');
    if (photos.length >= 8) return toast('You can add up to 8 photos.', 'info');
    photos.push(url); $('#photoUrl').value = ''; dirty = true; renderPhotos();
  });
  $('#photoGrid').addEventListener('click', (e) => {
    const rm = e.target.closest('[data-remove]');
    const cover = e.target.closest('[data-cover]');
    if (rm) photos.splice(Number(rm.dataset.remove), 1);
    if (cover) photos.unshift(photos.splice(Number(cover.dataset.cover), 1)[0]);
    if (rm || cover) { dirty = true; renderPhotos(); }
  });

  // ---------- AI description (FR-02) ----------
  const collect = () => ({
    name: $('#petName').value.trim(), type: $('#type').value, breed: $('#breed').value.trim(), age: $('#age').value,
    gender: $('#gender').value, size: $('#size').value, location: $('#location').value.trim(), energyLevel: $('#energyLevel').value,
    traits: $('#keywords').value.split(',').map((t) => t.trim()).filter(Boolean),
    goodWithChildren: $('#goodWithChildren').checked, goodWithOtherPets: $('#goodWithOtherPets').checked, requiresYard: $('#requiresYard').checked,
    vaccinated: $('#vaccinated').checked, desexed: $('#desexed').checked, microchipped: $('#microchipped').checked,
    description: $('#aiDescription').value.trim(), medicalHistory: $('#medical').value.trim(), rescueBackground: $('#rescue').value.trim(), photos,
  });
  $('#genBtn').addEventListener('click', async (e) => {
    const data = collect();
    if (!data.name || !data.breed) { toast('Add the pet\'s name and breed first.', 'info'); ($('#petName').value ? $('#breed') : $('#petName')).focus(); return; }
    if (data.description && !(await confirm({ title: 'Replace description?', message: 'This will replace the current description with a new AI-generated one.', confirmText: 'Generate' }))) return;
    setBusy(e.target, true, 'Writing…');
    try {
      const r = await PawPalAPI.post('/ai/describe', data);
      $('#aiDescription').value = r.description;
      $('#aiSource').textContent = r.source === 'openai' ? 'Written by OpenAI — please check it before publishing.' : 'Written by PawPal\'s built-in AI — edit freely before publishing.';
      dirty = true;
    } catch (err) { toast(err.message, 'error'); }
    setBusy(e.target, false);
  });

  // ---------- save ----------
  async function save(targetStatus, btn) {
    $('#formAlert').hidden = true;
    document.querySelectorAll('.field-error').forEach((el) => el.classList.remove('field-error'));
    const data = collect();
    const missing = [];
    if (!data.name) { $('#petName').classList.add('field-error'); missing.push('name'); }
    if (!data.breed) { $('#breed').classList.add('field-error'); missing.push('breed'); }
    if (targetStatus !== 'Draft' && !data.description) { $('#aiDescription').classList.add('field-error'); missing.push('description (use Generate Description)'); }
    if (missing.length) {
      $('#formAlert').innerHTML = `<span>Please add the pet's ${missing.join(', ')}.</span>`;
      $('#formAlert').hidden = false;
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setBusy(btn, true, 'Saving…');
    try {
      const body = { ...data, status: targetStatus };
      const r = editId ? await PawPalAPI.put(`/pets/${editId}`, body) : await PawPalAPI.post('/pets', body);
      dirty = false;
      toast(r.message);
      setTimeout(() => { location.href = 'pets.html'; }, 700);
    } catch (err) {
      $('#formAlert').innerHTML = `<span>${esc(err.message)}</span>`;
      $('#formAlert').hidden = false;
      setBusy(btn, false);
    }
  }
  $('#petForm').addEventListener('submit', (e) => {
    e.preventDefault();
    save(editId && status !== 'Draft' ? status : 'Available', $('#publishBtn'));
  });
  $('#draftBtn').addEventListener('click', (e) => save('Draft', e.currentTarget));
  $('#petForm').addEventListener('input', () => { dirty = true; });
  window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

  renderPhotos();
})();
