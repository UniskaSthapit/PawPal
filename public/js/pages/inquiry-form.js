// Adoption inquiry form (FR-07). The server calculates the AI suitability score (FR-08).
(async () => {
  const { $, $$, params, esc, photo, PLACEHOLDER, ageText, setBusy } = PawPal;
  const form = $('#inquiryForm');
  const alertBox = $('#formAlert');
  const petId = params.get('pet');
  const answers = { hasChildren: '', hasOtherPets: '' };

  const fail = (html) => {
    $('.inq-card').innerHTML = `<div class="pp-empty"><div class="pp-empty-emoji">🐾</div><h3>We can't open this form</h3><p>${html}</p>
      <a class="pp-btn pp-btn-primary" href="home.html#pets">Browse pets</a></div>`;
    $('#petSummary').remove();
  };
  if (!petId) return fail('Please choose a pet first, then press “Apply to Adopt” on their profile.');

  let pet;
  try { ({ pet } = await PawPalAPI.get(`/pets/${encodeURIComponent(petId)}`)); }
  catch (err) { return fail(esc(err.message)); }
  if (pet.status === 'Adopted') return fail(`${esc(pet.name)} has already been adopted. Our AI quiz can suggest other pets you'll love.`);

  // Pet summary + links
  document.title = `PawPal — Apply to adopt ${pet.name}`;
  $('#crumbPet').textContent = pet.name;
  $('#crumbPet').href = `pet-profile.html?id=${encodeURIComponent(pet.id)}`;
  $('#cancelLink').href = `pet-profile.html?id=${encodeURIComponent(pet.id)}`;
  $$('.js-pet-name').forEach((el) => { el.textContent = pet.name; });
  $('#petSummary').innerHTML = `<img src="${esc(photo(pet))}" alt="" onerror="this.onerror=null;this.src='${PLACEHOLDER}'"/>
    <div><span class="inq-pet-kicker">You're applying to adopt</span><b>${esc(pet.name)}</b><span>${esc(pet.breed)} · ${esc(ageText(pet.age))} · ${esc(pet.location || '')}</span></div>
    <a class="pp-btn pp-btn-ghost pp-btn-sm" href="pet-profile.html?id=${encodeURIComponent(pet.id)}">View profile</a>`;

  // Pre-fill from the logged-in account
  const user = await PawPal.ready;
  if (user) { $('#fullName').value = user.name; $('#email').value = user.email; $('#phone').value = user.phone || ''; }

  // Yes / No pills
  $$('[data-group]').forEach((group) => group.addEventListener('click', (e) => {
    const b = e.target.closest('.inq-pill');
    if (!b) return;
    answers[group.dataset.group] = b.dataset.value;
    group.querySelectorAll('.inq-pill').forEach((x) => { const on = x === b; x.classList.toggle('active', on); x.setAttribute('aria-checked', on); });
    group.classList.remove('group-error');
  }));
  $('#motivation').addEventListener('input', (e) => { $('#motivationCount').textContent = `${e.target.value.length} / 2000 · at least 20 characters`; });
  form.addEventListener('input', (e) => e.target.classList?.remove('field-error'));
  form.addEventListener('change', (e) => e.target.classList?.remove('field-error'));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    alertBox.hidden = true;
    const problems = [];
    const need = (id, msg) => { const el = $('#' + id); if (!el.value.trim()) { el.classList.add('field-error'); problems.push(msg); } };
    need('fullName', 'your full name');
    need('email', 'your email');
    need('livingType', 'your living arrangement');
    need('activityLevel', 'your activity level');
    need('hoursAlone', 'hours the pet would be alone');
    need('experience', 'your pet experience');
    ['hasChildren', 'hasOtherPets'].forEach((g) => { if (answers[g] === '') { $(`[data-group="${g}"]`).classList.add('group-error'); problems.push(g === 'hasChildren' ? 'whether children live with you' : 'whether you have other pets'); } });
    if ($('#motivation').value.trim().length < 20) { $('#motivation').classList.add('field-error'); problems.push('why you want to adopt (20+ characters)'); }
    if (!$('#consent').checked) problems.push('the confirmation checkbox');
    if (problems.length) {
      alertBox.innerHTML = `<span>Please complete: ${problems.join(', ')}.</span>`;
      alertBox.hidden = false;
      alertBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    const btn = $('#submitBtn');
    setBusy(btn, true, 'Submitting…');
    try {
      await PawPalAPI.post('/applications', {
        petId: pet.id, name: $('#fullName').value, email: $('#email').value, phone: $('#phone').value, address: $('#address').value,
        livingType: $('#livingType').value, activityLevel: $('#activityLevel').value, hoursAlone: $('#hoursAlone').value,
        hasChildren: answers.hasChildren, hasOtherPets: answers.hasOtherPets, experience: $('#experience').value,
        experienceDetails: $('#experienceDetails').value, motivation: $('#motivation').value,
      });
      form.style.display = 'none';
      $('#successText').textContent = `Thank you for applying to adopt ${pet.name}! We've emailed you a confirmation. Our team will review your application within 2–3 business days.`;
      $('#successMsg').style.display = 'block';
      $('#stepApp').className = 'inq-step done';
      $('#stepApp .inq-step-dot').textContent = '✓';
      $('#stepReview').className = 'inq-step active';
      $('.inq-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      alertBox.innerHTML = `<span>${esc(err.message)}${err.status === 409 ? ' <a href="my-applications.html">View my applications</a>' : ''}</span>`;
      alertBox.hidden = false;
      setBusy(btn, false);
    }
  });
})();
