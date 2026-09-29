// Adoption application: 5 steps, validation per step, draft autosave, and an AI question helper
// that explains what a question means — it never suggests or fills in answers.
(async () => {
  const { $, $$, esc, icons, params, setBusy, errorHTML, toast, photo, sized } = PawPal;
  const u = await PawPal.booted;
  const petId = params.get('petId');
  if (!petId) { location.href = 'adopt.html'; return; }
  if (!u) { location.href = `login.html?next=${encodeURIComponent(`inquiry-form.html?petId=${petId}`)}`; return; }
  const DRAFT = `pp_apply_${petId}`;
  const TITLES = ['About you', 'Your home', 'Your lifestyle', 'Why this pet', 'Review & submit'];
  let step = 1;

  // ---------- pet summary ----------
  let pet;
  try { pet = (await PawPalAPI.get(`/pets/${encodeURIComponent(petId)}`)).pet; }
  catch (err) { $('#applyLayout').innerHTML = PawPal.emptyHTML({ title: 'This pet is not available', text: err.message, action: '<a class="btn btn-primary" href="adopt.html">Browse pets</a>' }); return; }
  if (!['Available', 'On Hold'].includes(pet.status)) { $('#applyLayout').innerHTML = PawPal.emptyHTML({ title: `${pet.name} is no longer available`, text: 'They have found a home. PawPal can suggest similar pets.', action: '<a class="btn btn-primary" href="ai-matching.html">Find my PawPal</a>' }); return; }
  document.title = `Apply to adopt ${pet.name} — PawPal`;
  $('#applyTitle').textContent = `Apply to adopt ${pet.name}`;
  $('#petCrumb').textContent = pet.name; $('#petCrumb').href = `pet-profile.html?id=${encodeURIComponent(pet.id)}`;
  $('#petAside').innerHTML = `<div class="pet-card" style="pointer-events:none"><div class="pet-card-media"><img src="${esc(sized(photo(pet), 600))}" alt="${esc(pet.name)}" data-fallback="${PawPal.FALLBACK[pet.type]}"></div>
    <div class="pet-card-body"><div class="pet-card-title"><h3>${esc(pet.name)}</h3></div><div class="pet-card-meta"><b>${esc(pet.breed)}</b> · ${esc(PawPal.ageText(pet.age))}</div>
    <div class="pet-card-loc">${icons.pin}${esc(pet.location || '')}</div></div></div>
    ${pet.status === 'On Hold' ? `<div class="alert alert-warn">${icons.info}<div>${esc(pet.name)} is on hold while another adopter meets them. You can still apply — you'll be considered if it doesn't go ahead.</div></div>` : ''}
    <div class="fact-panel small"><span class="src-label src-shelter">${icons.shield}Your privacy</span><p style="margin-top:6px">Your application is only shared with the shelter caring for ${esc(pet.name)}. The shelter team makes every decision — not an algorithm.</p></div>`;

  // Existing open application?
  try {
    const mine = (await PawPalAPI.get('/applications/mine')).applications.find((a) => a.petId === pet.id && !['Adopted', 'Declined', 'Withdrawn'].includes(a.status));
    if (mine) { $('#applyForm').innerHTML = `<div class="card-body">${PawPal.emptyHTML({ icon: 'file', title: `You've already applied for ${pet.name}`, text: `Your application is ${mine.status}.`, action: `<a class="btn btn-primary" href="my-applications.html?id=${encodeURIComponent(mine.id)}">View my application</a>` })}</div>`; return; }
  } catch { /* ignore */ }

  // ---------- values ----------
  const radio = (name) => $(`input[name="${name}"]:checked`)?.value ?? '';
  const setRadio = (name, v) => { const el = $(`input[name="${name}"][value="${CSS.escape(String(v))}"]`); if (el) el.checked = true; };
  const values = () => ({
    name: $('#name').value.trim(), email: $('#email').value.trim(), phone: $('#phone').value.trim(), address: $('#address').value.trim(),
    livingType: radio('livingType'), ownership: radio('ownership'), landlordPermission: radio('landlordPermission'), householdAdults: $('#householdAdults').value,
    hasChildren: radio('hasChildren'), childrenAges: $('#childrenAges').value.trim(), hasOtherPets: radio('hasOtherPets'), otherPetsDetails: $('#otherPetsDetails').value.trim(),
    activityLevel: radio('activityLevel'), hoursAlone: $('#hoursAlone').value, workSchedule: $('#workSchedule').value.trim(), experience: radio('experience'),
    experienceDetails: $('#experienceDetails').value.trim(), motivation: $('#motivation').value.trim(),
  });
  function fill(v) {
    ['name', 'email', 'phone', 'address', 'householdAdults', 'childrenAges', 'otherPetsDetails', 'hoursAlone', 'workSchedule', 'experienceDetails', 'motivation'].forEach((k) => { if (v[k] !== undefined && $(`#${k}`)) $(`#${k}`).value = v[k]; });
    ['livingType', 'ownership', 'landlordPermission', 'hasChildren', 'hasOtherPets', 'activityLevel', 'experience'].forEach((k) => v[k] !== undefined && v[k] !== '' && setRadio(k, v[k]));
  }
  let draft = null;
  try { draft = JSON.parse(localStorage.getItem(DRAFT)); } catch { /* ignore */ }
  fill({ name: u.name, email: u.email, phone: u.phone || '', ...(draft || {}) });
  if (draft) $('#savedNote').textContent = 'Draft restored';

  const syncConditional = () => {
    $('#landlordWrap').hidden = radio('ownership') !== 'Rent';
    $('#kidsWrap').hidden = radio('hasChildren') !== 'true';
    $('#petsWrap').hidden = radio('hasOtherPets') !== 'true';
    $('#motCount').textContent = $('#motivation').value.trim().length;
  };
  let saveTimer;
  $('#applyForm').addEventListener('input', () => {
    syncConditional();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { try { localStorage.setItem(DRAFT, JSON.stringify(values())); $('#savedNote').textContent = 'Draft saved'; } catch { /* ignore */ } }, 400);
  });
  syncConditional();

  // ---------- steps ----------
  const REQUIRED = {
    1: (v) => (v.name.length < 2 ? 'Please enter your full name.' : !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.email) ? 'Please enter a valid email.' : null),
    2: (v) => (!v.livingType ? 'Tell us what type of home you live in.' : !v.ownership ? 'Tell us whether you own or rent.' : v.hasChildren === '' ? 'Tell us whether there are children in the home.' : v.hasOtherPets === '' ? 'Tell us whether you have other pets.' : null),
    3: (v) => (!v.activityLevel ? 'Choose how active your household is.' : v.hoursAlone === '' ? 'Tell us how long the pet would be alone each day.' : !v.experience ? 'Tell us about your experience with pets.' : null),
    4: (v) => (v.motivation.length < 20 ? 'Please write at least 20 characters about why you\'d like to adopt.' : null),
  };
  const yesNo = (v) => (v === 'true' ? 'Yes' : v === 'false' ? 'No' : '—');
  function review() {
    const v = values();
    const row = (l, x) => `<dt>${esc(l)}</dt><dd>${esc(x || '—')}</dd>`;
    $('#review').innerHTML = `<p class="muted small" style="margin-bottom:14px">Check everything is right. You can go back to change any answer.</p><dl class="kv">
      ${row('Name', v.name)}${row('Email', v.email)}${row('Mobile', v.phone)}${row('Address', v.address)}
      ${row('Home', `${v.livingType} · ${v.ownership}${v.ownership === 'Rent' ? ` (landlord permission: ${yesNo(v.landlordPermission)})` : ''}`)}
      ${row('Adults', v.householdAdults)}${row('Children', v.hasChildren === 'true' ? `Yes${v.childrenAges ? ` (${v.childrenAges})` : ''}` : 'No')}
      ${row('Other pets', v.hasOtherPets === 'true' ? `Yes${v.otherPetsDetails ? ` — ${v.otherPetsDetails}` : ''}` : 'No')}
      ${row('Activity', ['', 'Relaxed', 'Moderately active', 'Very active'][v.activityLevel])}${row('Pet alone', `${v.hoursAlone} hours a day`)}
      ${row('Typical week', v.workSchedule)}${row('Experience', v.experience)}${row('Experience details', v.experienceDetails)}${row('Why', v.motivation)}</dl>`;
  }
  function go(n) {
    step = n;
    $$('.step').forEach((s) => { s.hidden = Number(s.dataset.step) !== n; });
    $('#stepLabel').textContent = `Step ${n} of 5`; $('#stepTitle').textContent = TITLES[n - 1];
    $$('#stepBar i').forEach((b, i) => { b.className = i < n - 1 ? 'on' : i === n - 1 ? 'cur' : ''; });
    $('#backBtn').style.visibility = n === 1 ? 'hidden' : 'visible';
    $('#nextBtn').hidden = n === 5; $('#submitBtn').hidden = n !== 5;
    $('#formMsg').innerHTML = '';
    if (n === 5) review();
    $('#applyForm').scrollIntoView({ behavior: PawPal.reduceMotion ? 'auto' : 'smooth', block: 'start' });
    $(`.step[data-step="${n}"] input, .step[data-step="${n}"] select, .step[data-step="${n}"] textarea`)?.focus({ preventScroll: true });
  }
  $('#nextBtn').addEventListener('click', () => {
    const problem = REQUIRED[step]?.(values());
    if (problem) { $('#formMsg').innerHTML = `<div style="margin-bottom:16px">${errorHTML(problem)}</div>`; return; }
    go(step + 1);
  });
  $('#backBtn').addEventListener('click', () => go(Math.max(1, step - 1)));
  go(1);

  // ---------- AI question helper ----------
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-help]');
    if (!b) return;
    const key = b.dataset.help;
    const slot = $(`[data-slot="${key}"]`);
    if (b.getAttribute('aria-expanded') === 'true') { slot.innerHTML = ''; b.setAttribute('aria-expanded', 'false'); return; }
    b.setAttribute('aria-expanded', 'true');
    slot.innerHTML = '<div class="skeleton" style="height:60px"></div>';
    const render = (r) => {
      slot.innerHTML = `<div class="ai-panel small"><span class="src-label src-ai">${icons.sparkle}PawPal explains</span><p style="margin-top:6px">${esc(r.explanation)}</p>
        <div class="row" data-helpask="${esc(key)}" style="margin-top:10px;flex-wrap:nowrap"><label class="sr-only" for="ha-${esc(key)}">Ask about this question</label>
          <input class="input" id="ha-${esc(key)}" maxlength="300" placeholder="Still unsure? Ask about this question…" style="min-height:40px"><button class="btn btn-sm" type="button" data-helpgo>Ask</button></div>
        <p class="tiny muted" style="margin-top:8px">PawPal explains questions but never answers them for you.</p></div>`;
    };
    try { render(await PawPalAPI.post('/ai/explain-question', { key })); } catch (err) { slot.innerHTML = errorHTML(err.message); }
  });
  async function askHelp(f) {
    const question = f.querySelector('input').value.trim();
    if (!question) return;
    const btn = f.querySelector('button'); setBusy(btn, true, '…');
    try {
      const r = await PawPalAPI.post('/ai/explain-question', { key: f.dataset.helpask, question });
      f.previousElementSibling.textContent = r.explanation;
      f.querySelector('input').value = '';
    } catch (err) { toast(err.message, 'error'); }
    setBusy(btn, false);
  }
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-helpgo]'); if (b) askHelp(b.closest('[data-helpask]')); });
  document.addEventListener('keydown', (e) => {
    const f = e.target.closest?.('[data-helpask]');
    if (f && e.key === 'Enter') { e.preventDefault(); askHelp(f); }
  });

  // ---------- submit ----------
  $('#applyForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (e.submitter && e.submitter.id !== 'submitBtn') return;
    if (step !== 5) return;
    if (!$('#declaration').checked) { $('#formMsg').innerHTML = `<div style="margin-bottom:16px">${errorHTML('Please confirm your information is true and complete.')}</div>`; return; }
    const v = values();
    const btn = $('#submitBtn'); setBusy(btn, true, 'Submitting…');
    try {
      const res = await PawPalAPI.post('/applications', { ...v, petId: pet.id, declaration: true,
        hasChildren: v.hasChildren === 'true', hasOtherPets: v.hasOtherPets === 'true', landlordPermission: v.landlordPermission === '' ? '' : v.landlordPermission === 'true' });
      try { localStorage.removeItem(DRAFT); } catch { /* ignore */ }
      $('#applyForm').innerHTML = `<div class="card-body center" style="padding:48px 24px">
        <div class="e-icon" style="width:72px;height:72px;margin:0 auto 18px;border-radius:20px;background:var(--sage-soft);color:var(--sage);display:grid;place-items:center">${icons.checkCircle}</div>
        <h2 class="h2">Application sent!</h2><p class="lead" style="margin:12px auto 24px">The team caring for ${esc(pet.name)} will review it — usually within 2–3 business days. We've emailed you a copy, and you can follow every step on your timeline.</p>
        <div class="row" style="justify-content:center"><a class="btn btn-primary btn-lg" href="my-applications.html?id=${encodeURIComponent(res.application.id)}">View my timeline</a><a class="btn btn-lg" href="adopt.html">Keep browsing</a></div></div>`;
      $('#applyForm svg').style.cssText = 'width:34px;height:34px';
    } catch (err) {
      setBusy(btn, false);
      $('#formMsg').innerHTML = `<div style="margin-bottom:16px">${errorHTML(err.message)}</div>`;
    }
  });
})();
