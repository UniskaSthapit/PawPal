// Home page: hero with search and a living photo composition, count-up stats, a featured-pets rail
// driven by vertical scroll, the live matching example, a momentum stories carousel and the FAQ.
(async () => {
  const { $, $$, esc, icons, petCardHTML, emptyHTML, reveal, countUp } = PawPal;
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

  // Gentle parallax on the photo composition (mouse/trackpad only, skipped for reduced motion)
  const art = $('.hero-art');
  if (art && PawPal.finePointer && !PawPal.reduceMotion) {
    let raf = 0;
    art.parentElement.addEventListener('pointermove', (e) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = art.getBoundingClientRect();
        const x = (e.clientX - (r.left + r.width / 2)) / r.width;
        const y = (e.clientY - (r.top + r.height / 2)) / r.height;
        $$('.pet-bubble', art).forEach((b, i) => { const depth = (i % 3 + 1) * 6; b.style.transform = `translate3d(${(-x * depth).toFixed(1)}px, ${(-y * depth).toFixed(1)}px, 0)`; });
        $('.hero-blob', art).style.transform = `translate3d(${(x * 6).toFixed(1)}px, ${(y * 6).toFixed(1)}px, 0)`;
      });
    });
  }

  // ---------- data ----------
  const [petsRes, statsRes, faqRes] = await Promise.allSettled([
    PawPalAPI.get('/pets', { sort: 'newest', available: 1 }), PawPalAPI.get('/stats/public'), PawPalAPI.get('/faq')]);

  if (statsRes.status === 'fulfilled') {
    const s = statsRes.value;
    $('#stats').innerHTML = [[s.availablePets, 'Pets available now'], [s.adoptedPets, 'Found their home with PawPal'], [s.shelters, 'Partner shelters'], [s.species, 'Kinds of pets waiting']]
      .map(([n, l]) => `<div><b data-n="${Number(n) || 0}">${Number(n).toLocaleString('en-AU')}</b><span>${l}</span></div>`).join('');
    $$('#stats b[data-n]').forEach((b) => countUp(b, b.dataset.n));
    $('#heroCount').textContent = `${s.availablePets} pets waiting for a home near you`;
  } else $('#stats').hidden = true;

  if (petsRes.status === 'fulfilled') {
    const pets = petsRes.value.pets;
    // Each photo links to the real pet pictured (while they're still available) and shows their name on hover
    $$('.ch-pet-bubble, .pet-bubble, #heroFeature').forEach((b) => {
      const pet = pets.find((p) => (p.photos || []).some((u) => u.includes(b.dataset.photo)));
      if (!pet) return;
      b.href = `pet-profile.html?id=${encodeURIComponent(pet.id)}`;
      b.removeAttribute('aria-hidden'); b.removeAttribute('tabindex');
      b.setAttribute('aria-label', `Meet ${pet.name}, ${pet.breed}`);
      const name = b.querySelector('.ch-bubble-name, .bubble-name'); if (name) name.textContent = pet.name;
      b.querySelector('img').alt = `${pet.name}, ${pet.breed}`;
    });
    // Phones: a row of overlapping pet photos under the hero copy
    $('#avatarStack').innerHTML = pets.slice(0, 5).map((p) => `<a href="pet-profile.html?id=${encodeURIComponent(p.id)}" tabindex="-1">
      <img src="${esc(PawPal.sized(PawPal.photo(p), 160))}" alt="" data-fallback="${PawPal.FALLBACK[p.type]}"></a>`).join('')
      + (pets.length > 5 ? `<span>+${pets.length - 5} more waiting</span>` : '');

    // Featured rail: a varied mix — take the newest pet of each kind in turn (dog, cat, reptile, bird…) — plus a closing "see everyone" card
    const byType = new Map();
    pets.forEach((p) => { if (!byType.has(p.type)) byType.set(p.type, []); byType.get(p.type).push(p); });
    const order = ['Dog', 'Cat', 'Reptile', 'Bird', 'Farm Animal', 'Rabbit', 'Fish', 'Hamster'].filter((t) => byType.has(t)).concat([...byType.keys()].filter((t) => !['Dog', 'Cat', 'Reptile', 'Bird', 'Farm Animal', 'Rabbit', 'Fish', 'Hamster'].includes(t)));
    const featured = [];
    for (let round = 0; featured.length < 12 && featured.length < pets.length; round++) {
      order.forEach((t) => { const p = byType.get(t)[round]; if (p && featured.length < 12) featured.push(p); });
    }
    $('#featured').innerHTML = featured.length
      ? featured.map((p, i) => petCardHTML(p, { index: i })).join('')
        + `<a class="rail-end" href="adopt.html"><b>${pets.length > featured.length ? `${pets.length - featured.length} more pets are waiting` : 'Meet every pet looking for a home'}</b><span>Browse all pets ${icons.arrowRight}</span></a>`
      : emptyHTML({ title: 'No pets listed right now', text: 'New animals arrive every week — check back soon.' });
  } else {
    $('#featured').innerHTML = PawPal.errorHTML('We couldn\'t load pets right now. Please refresh the page.');
  }
  PawPal.hscroll($('#featuredSection'));

  // ---------- stories carousel ----------
  PawPalStories.render($('#storyGrid'), 6);
  PawPal.carousel($('#storyCarousel'));

  // ---------- FAQ ----------
  if (faqRes.status === 'fulfilled') {
    $('#faqList').innerHTML = faqRes.value.faq.slice(0, 7).map((f) => `<details data-reveal><summary>${esc(f.q)}<span class="pm">${icons.plus}</span></summary><p>${esc(f.a)}</p></details>`).join('');
    PawPal.accordion($('#faqList'));
  }
  reveal();

  // ---------- live matching example (real results) ----------
  try {
    const text = $('#demoText').textContent.replace(/[“”]/g, '');
    const res = await PawPalAPI.post('/ai/match', { text, limit: 2, demo: true });
    $('#demoTags').innerHTML = res.understood.slice(0, 5).map((u, i) => `<span class="badge badge-honey" style="--i:${i}">${esc(u)}</span>`).join('');
    $('#demoResults').innerHTML = res.matches.map((m, i) => `<a class="ai-demo-result" href="pet-profile.html?id=${encodeURIComponent(m.pet.id)}" style="animation-delay:${300 + i * 120}ms">
      <img src="${esc(PawPal.sized(PawPal.photo(m.pet), 200))}" alt="" loading="lazy" data-fallback="${PawPal.FALLBACK[m.pet.type]}">
      <div><b>${esc(m.pet.name)}</b><div class="small muted">${esc(m.pet.breed)} · ${esc(PawPal.ageText(m.pet.age))}</div><div class="small" style="margin-top:4px">${esc(m.reasons[0] || m.summary || '')}</div></div>
      <span class="score-pill">${m.score}%</span></a>`).join('') || '<p class="muted small">No pets available right now.</p>';
  } catch {
    $('#demoResults').innerHTML = '<p class="muted small">The live example is unavailable right now.</p>';
  }
})();
