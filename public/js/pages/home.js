// Home page: hero slideshow, quick search, live stats, featured pets, live matching example, stories and FAQ.
(async () => {
  const { $, $$, esc, icons, petCardHTML, emptyHTML, reveal, reduceMotion } = PawPal;
  await PawPal.booted;

  // ---------- hero slideshow ----------
  const slides = $$('.hero-slide');
  const dots = $('#heroDots');
  dots.innerHTML = slides.map((_, i) => `<button class="hero-dot" role="tab" aria-label="Show slide ${i + 1}" ${i === 0 ? 'aria-current="true"' : ''} data-slide="${i}"></button>`).join('');
  let current = 0; let timer = null; let paused = reduceMotion;
  const petsByName = {};
  function show(i) {
    current = (i + slides.length) % slides.length;
    slides.forEach((s, k) => { s.classList.toggle('is-active', k === current); s.setAttribute('aria-hidden', String(k !== current)); });
    $$('.hero-dot', dots).forEach((d, k) => d.setAttribute('aria-current', String(k === current)));
    const pet = petsByName[slides[current].dataset.pet];
    const cap = $('#heroCaption');
    cap.hidden = !pet;
    if (pet) { cap.href = `pet-profile.html?id=${encodeURIComponent(pet.id)}`; $('#heroCaptionText').textContent = `Meet ${pet.name} · ${pet.location}`; }
    // Load the next image early so transitions are smooth
    const next = slides[(current + 1) % slides.length].querySelector('img');
    if (next.loading === 'lazy') next.loading = 'eager';
  }
  const play = () => { clearInterval(timer); if (!paused) timer = setInterval(() => show(current + 1), 6500); };
  $('#heroPrev').addEventListener('click', () => { show(current - 1); play(); });
  $('#heroNext').addEventListener('click', () => { show(current + 1); play(); });
  dots.addEventListener('click', (e) => { const d = e.target.closest('[data-slide]'); if (d) { show(Number(d.dataset.slide)); play(); } });
  const pauseBtn = $('#heroPause');
  const setPauseUi = () => { pauseBtn.innerHTML = paused ? icons.play : icons.pause; pauseBtn.setAttribute('aria-label', paused ? 'Play slideshow' : 'Pause slideshow'); };
  pauseBtn.addEventListener('click', () => { paused = !paused; setPauseUi(); play(); });
  const hero = $('.hero');
  hero.addEventListener('mouseenter', () => clearInterval(timer));
  hero.addEventListener('mouseleave', play);
  hero.addEventListener('focusin', () => clearInterval(timer));
  // Swipe on touch screens
  let touchX = null;
  hero.addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; }, { passive: true });
  hero.addEventListener('touchend', (e) => { if (touchX === null) return; const dx = e.changedTouches[0].clientX - touchX; if (Math.abs(dx) > 50) { show(current + (dx < 0 ? 1 : -1)); play(); } touchX = null; });
  document.addEventListener('visibilitychange', () => (document.hidden ? clearInterval(timer) : play()));
  setPauseUi(); play();

  // ---------- quick search ----------
  const tabs = [$('#tabFilters'), $('#tabAI')];
  tabs.forEach((t) => t.addEventListener('click', () => {
    tabs.forEach((x) => x.setAttribute('aria-selected', String(x === t)));
    $('#qsFilters').hidden = t !== tabs[0]; $('#qsAI').hidden = t !== tabs[1];
    (t === tabs[1] ? $('#qsText') : $('#qsType')).focus();
  }));
  $('#qsFilters').addEventListener('submit', (e) => {
    e.preventDefault();
    location.href = `adopt.html${PawPalAPI.qs({ type: $('#qsType').value, age: $('#qsAge').value, location: $('#qsLoc').value })}`;
  });
  $('#qsAI').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = $('#qsText').value.trim();
    if (!q) return $('#qsText').focus();
    location.href = `adopt.html?ask=${encodeURIComponent(q)}`;
  });
  $$('[data-example]').forEach((b) => b.addEventListener('click', () => { $('#qsText').value = b.textContent; $('#qsAI').requestSubmit(); }));

  // ---------- data ----------
  const [petsRes, statsRes, facetsRes, faqRes] = await Promise.allSettled([
    PawPalAPI.get('/pets', { sort: 'newest', available: 1 }), PawPalAPI.get('/stats/public'), PawPalAPI.get('/pets/facets'), PawPalAPI.get('/faq')]);

  if (facetsRes.status === 'fulfilled') {
    const states = [...new Set(facetsRes.value.locations.map((l) => l.split(',').pop().trim()))].sort();
    $('#qsLoc').insertAdjacentHTML('beforeend', states.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join(''));
  }

  if (statsRes.status === 'fulfilled') {
    const s = statsRes.value;
    $('#stats').innerHTML = [[s.availablePets, 'Pets available now'], [s.adoptedPets, 'Found their home with PawPal'], [s.shelters, 'Partner shelters'], [s.species, 'Kinds of pets waiting']]
      .map(([n, l]) => `<div><b>${Number(n).toLocaleString('en-AU')}</b><span>${l}</span></div>`).join('');
    $('#heroCount').textContent = `${s.availablePets} rescue pets waiting for a home`;
  } else $('#stats').hidden = true;

  if (petsRes.status === 'fulfilled') {
    const pets = petsRes.value.pets;
    pets.forEach((p) => { petsByName[p.name] ||= p; });
    show(current);
    $('#featured').innerHTML = pets.length ? pets.slice(0, 8).map((p) => petCardHTML(p)).join('')
      : emptyHTML({ title: 'No pets listed right now', text: 'New animals arrive every week — check back soon.' });
  } else {
    $('#featured').innerHTML = PawPal.errorHTML('We couldn\'t load pets right now. Please refresh the page.');
  }

  PawPalStories.render($('#storyGrid'), 3);

  if (faqRes.status === 'fulfilled') {
    $('#faqList').innerHTML = faqRes.value.faq.slice(0, 7).map((f) => `<details><summary>${esc(f.q)}<span class="pm">${icons.plus}</span></summary><p>${esc(f.a)}</p></details>`).join('');
  }

  // ---------- live matching example (real results) ----------
  try {
    const text = $('#demoText').textContent.replace(/[“”]/g, '');
    const res = await PawPalAPI.post('/ai/match', { text, limit: 2, demo: true });
    $('#demoTags').innerHTML = res.understood.slice(0, 5).map((u) => `<span class="badge badge-honey">${esc(u)}</span>`).join('');
    $('#demoResults').innerHTML = res.matches.map((m) => `<a class="ai-demo-result" href="pet-profile.html?id=${encodeURIComponent(m.pet.id)}" style="text-decoration:none;color:inherit">
      <img src="${esc(PawPal.sized(PawPal.photo(m.pet), 200))}" alt="" loading="lazy" data-fallback="${PawPal.FALLBACK[m.pet.type]}">
      <div><b>${esc(m.pet.name)}</b><div class="small muted">${esc(m.pet.breed)} · ${esc(PawPal.ageText(m.pet.age))}</div><div class="small" style="margin-top:4px">${esc(m.reasons[0] || m.summary || '')}</div></div>
      <span class="score-pill">${m.score}%</span></a>`).join('') || '<p class="muted small">No pets available right now.</p>';
  } catch {
    $('#demoResults').innerHTML = '<p class="muted small">The live example is unavailable right now.</p>';
  }
  reveal();
})();
