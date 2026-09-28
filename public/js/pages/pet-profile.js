// Pet profile — public details (FR-03 hides staff-only data), AI bio (FR-02), apply button (FR-07).
(async () => {
  const { $, params, esc, icons, ageText, photo, PLACEHOLDER, petCardHTML, toast, setBusy } = PawPal;
  const root = $('#petRoot');
  const id = params.get('id');

  const notFound = (msg) => {
    root.innerHTML = `<div class="pp-empty" style="grid-column:1/-1"><div class="pp-empty-emoji">🐾</div><h3>Pet not found</h3>
      <p>${esc(msg)}</p><a class="pp-btn pp-btn-primary" href="home.html#pets">Browse available pets</a></div>`;
  };
  if (!id) return notFound('No pet was selected. Choose a pet from the home page to see their profile.');

  let pet;
  try { ({ pet } = await PawPalAPI.get(`/pets/${encodeURIComponent(id)}`)); }
  catch (err) { return notFound(err.message); }
  const user = await PawPal.ready;
  const isStaff = user?.role === 'staff';

  document.title = `PawPal — Meet ${pet.name} the ${pet.breed}`;
  $('#crumbName').textContent = pet.name;
  const photos = pet.photos?.length ? pet.photos : [PLACEHOLDER];
  const energy = ['Relaxed', 'Moderate', 'High'][(pet.energyLevel || 2) - 1];
  const yesNo = (v) => (v ? 'Yes' : 'No');
  const facts = [
    ['Energy', energy], ['Good with kids', yesNo(pet.goodWithChildren)], ['Good with other pets', yesNo(pet.goodWithOtherPets)],
    ['Needs a yard', yesNo(pet.requiresYard)], ['Vaccinated', yesNo(pet.vaccinated)], ['Desexed', yesNo(pet.desexed)], ['Microchipped', yesNo(pet.microchipped)],
  ];
  const statusClass = pet.status === 'Available' ? 'pet-badge-available' : 'pet-badge-pending';

  // Figure out which main button to show
  let actionBtn;
  if (isStaff) actionBtn = `<a class="btn-adopt" href="add-pet.html?id=${encodeURIComponent(pet.id)}">Edit this pet</a>`;
  else if (pet.status === 'Adopted') actionBtn = '<span class="btn-adopt is-disabled">Already adopted</span>';
  else {
    let existing = null;
    if (user) existing = (await PawPalAPI.get('/applications/mine').catch(() => ({ applications: [] }))).applications
      .find((a) => a.petId === pet.id && !['Rejected', 'Withdrawn', 'Adopted'].includes(a.status));
    const next = encodeURIComponent(`inquiry-form.html?pet=${pet.id}`);
    actionBtn = existing ? `<a class="btn-adopt" href="my-applications.html">View my application</a>`
      : `<a class="btn-adopt" href="${user ? `inquiry-form.html?pet=${encodeURIComponent(pet.id)}` : `login.html?next=${next}`}">Apply to Adopt ${esc(pet.name)}</a>`;
  }

  root.innerHTML = `
    <div class="pet-gallery">
      <div class="main-image-wrap"><img id="mainPhoto" src="${esc(photos[0])}" alt="${esc(pet.name)} the ${esc(pet.breed)}" onerror="this.onerror=null;this.src='${PLACEHOLDER}'"/></div>
      ${photos.length > 1 ? `<div class="thumbnails">${photos.map((src, i) => `<button class="thumbnail ${i ? '' : 'active'}" data-src="${esc(src)}" aria-label="Show photo ${i + 1}">
        <img src="${esc(src)}" alt="" onerror="this.onerror=null;this.src='${PLACEHOLDER}'"/></button>`).join('')}</div>` : ''}
    </div>
    <div class="pet-info">
      <div>
        <h1 class="pet-name">${esc(pet.name)}</h1>
        <div class="pet-badges">
          <span class="pet-badge ${statusClass}">${esc(pet.status === 'Pending Adoption' ? 'Adoption pending' : pet.status)}</span>
          <span class="pet-badge pet-badge-type">${esc(pet.type)}</span>
          ${pet.location ? `<span class="pet-badge pet-badge-loc">${icons.pin}${esc(pet.location)}</span>` : ''}
        </div>
      </div>
      <div class="pet-meta"><span>${esc(pet.breed)}</span><span class="pet-meta-sep">•</span><span>${esc(ageText(pet.age))} old</span>
        <span class="pet-meta-sep">•</span><span>${esc(pet.gender)}</span><span class="pet-meta-sep">•</span><span>${esc(pet.size)}</span></div>
      ${pet.traits?.length ? `<div><div class="personality-label">Personality</div><div class="personality-tags">${pet.traits.map((t) => `<span class="personality-tag">${esc(t)}</span>`).join('')}</div></div>` : ''}
      <div class="ai-bio-box">
        <div class="ai-bio-header"><div class="ai-bio-title">${icons.sparkle}About ${esc(pet.name)}</div><span class="ai-powered-badge">Written with PawPal AI</span></div>
        <p class="ai-bio-text">${esc(pet.description || `${pet.name} is waiting to meet you. Ask our team for more about their personality.`)}</p>
      </div>
      <dl class="pet-facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd class="${v === 'Yes' ? 'yes' : v === 'No' ? 'no' : ''}">${v}</dd></div>`).join('')}</dl>
      ${isStaff ? `<div class="staff-box">
        <span class="staff-only-badge">Staff only — hidden from the public</span>
        <div class="staff-field"><label class="staff-field-label" for="medical">Medical history</label><textarea class="staff-textarea" id="medical">${esc(pet.medicalHistory || '')}</textarea></div>
        <div class="staff-field"><label class="staff-field-label" for="rescue">Rescue background</label><textarea class="staff-textarea" id="rescue">${esc(pet.rescueBackground || '')}</textarea></div>
        <button class="pp-btn pp-btn-soft pp-btn-sm" id="saveStaff">Save staff notes</button>
      </div>` : ''}
      <div class="pet-actions">
        ${actionBtn}
        <a class="btn-vets" href="vet-finder.html${pet.location ? `?q=${encodeURIComponent(pet.location)}` : ''}">${icons.pin}Find Nearby Vets</a>
      </div>
      ${!isStaff && pet.status !== 'Adopted' ? '<p class="pet-apply-note">Applying is free and takes about 5 minutes. Our team replies within 2–3 business days.</p>' : ''}
    </div>`;

  root.addEventListener('click', (e) => {
    const t = e.target.closest('.thumbnail');
    if (!t) return;
    $('#mainPhoto').src = t.dataset.src;
    root.querySelectorAll('.thumbnail').forEach((b) => b.classList.toggle('active', b === t));
  });
  $('#saveStaff')?.addEventListener('click', async (e) => {
    setBusy(e.target, true, 'Saving…');
    try { await PawPalAPI.put(`/pets/${pet.id}`, { medicalHistory: $('#medical').value, rescueBackground: $('#rescue').value }); toast('Staff notes saved'); }
    catch (err) { toast(err.message, 'error'); }
    setBusy(e.target, false);
  });

  // Similar pets: same type first
  try {
    const { pets } = await PawPalAPI.get('/pets', { type: pet.type.toLowerCase() === 'dog' || pet.type.toLowerCase() === 'cat' ? pet.type.toLowerCase() : 'other' });
    const similar = pets.filter((p) => p.id !== pet.id).slice(0, 4);
    if (similar.length) { $('#similarGrid').innerHTML = similar.map((p) => petCardHTML(p)).join(''); $('#similarSection').hidden = false; }
  } catch { /* optional section */ }
  void photo;
})();
