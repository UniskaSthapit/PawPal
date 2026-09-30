// Home page: companion hero with search, live stats, featured pets, live matching example, stories and FAQ.
(async () => {
  const { $, $$, esc, icons, petCardHTML, emptyHTML, reveal } = PawPal;
  await PawPal.booted;

  // ---------- hero search ----------
  const heroQ = $('#heroQ'), heroClear = $('#heroClear');
  $('#heroSearch')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = heroQ.value.trim();
    location.href = q ? `adopt.html?ask=${encodeURIComponent(q)}` : 'adopt.html';
  });
  heroQ?.addEventListener('input', () => { heroClear.hidden = !heroQ.value; });
  heroClear?.addEventListener('click', () => { heroQ.value = ''; heroClear.hidden = true; heroQ.focus(); });

  // ---------- data ----------
  const [petsRes, statsRes, faqRes] = await Promise.allSettled([
    PawPalAPI.get('/pets', { sort: 'newest', available: 1 }), PawPalAPI.get('/stats/public'), PawPalAPI.get('/faq')]);

  if (statsRes.status === 'fulfilled') {
    const s = statsRes.value;
    $('#stats').innerHTML = [[s.availablePets, 'Pets available now'], [s.adoptedPets, 'Found their home with PawPal'], [s.shelters, 'Partner shelters'], [s.species, 'Kinds of pets waiting']]
      .map(([n, l]) => `<div><b>${Number(n).toLocaleString('en-AU')}</b><span>${l}</span></div>`).join('');
    $('#heroCount').textContent = `${s.availablePets} pets waiting for a home near you`;
  } else $('#stats').hidden = true;

  if (petsRes.status === 'fulfilled') {
    const pets = petsRes.value.pets;
    // Each bubble links to the real pet in the photo (when they're still available) and shows their name on hover
    $$('.pet-bubble').forEach((b) => {
      const pet = pets.find((p) => (p.photos || []).some((u) => u.includes(b.dataset.photo)));
      if (!pet) return;
      b.href = `pet-profile.html?id=${encodeURIComponent(pet.id)}`;
      b.removeAttribute('aria-hidden'); b.removeAttribute('tabindex');
      b.setAttribute('aria-label', `Meet ${pet.name}, ${pet.breed}`);
      b.querySelector('.bubble-name').textContent = pet.name;
      b.querySelector('img').alt = `${pet.name}, ${pet.breed}`;
    });
    // Phones: a row of overlapping pet photos instead of the side bubbles
    $('#avatarStack').innerHTML = pets.slice(0, 5).map((p) => `<a href="pet-profile.html?id=${encodeURIComponent(p.id)}" tabindex="-1">
      <img src="${esc(PawPal.sized(PawPal.photo(p), 160))}" alt="" data-fallback="${PawPal.FALLBACK[p.type]}"></a>`).join('');
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
