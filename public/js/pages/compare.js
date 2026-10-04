// Compare pets: up to 3 public pets side by side, with match scores (signed-in adopters with a saved lifestyle)
// and an explanation of the differences from /api/ai/compare (rules engine when no AI is configured).
(async () => {
  const { $, esc, icons, params, photo, sized, ageText, energyText, money, errorHTML, emptyHTML, aiLabel } = PawPal;
  await PawPal.booted;
  const root = $('#compare');
  const fromUrl = String(params.get('ids') || '').split(',').map((s) => s.trim()).filter((s) => /^[\w-]{1,40}$/.test(s));
  const ids = [...new Set(fromUrl.length ? fromUrl : PawPal.compare.list().map((x) => x.id))];

  const pickMore = `<div class="row" style="justify-content:center;margin-top:16px"><a class="btn btn-primary" href="adopt.html">${icons.search}Browse pets</a>
    <a class="btn" href="ai-matching.html">${icons.sparkle}Find my PawPal</a></div>`;
  if (ids.length < 2) {
    root.innerHTML = `${emptyHTML({ title: 'Pick at least 2 pets to compare', text: 'Tick “Compare” on up to 3 pet cards on the Adopt page, in your Find My PawPal results or in your favourites.' })}${pickMore}`;
    return;
  }
  if (ids.length > PawPal.compare.max) {
    root.innerHTML = `${errorHTML(`You can compare up to ${PawPal.compare.max} pets at a time.`)}${pickMore}`;
    return;
  }

  let res;
  try {
    res = await PawPalAPI.post('/ai/compare', { ids });
  } catch (err) {
    root.innerHTML = `${errorHTML(err.message)}${pickMore}`;
    return;
  }
  const pets = res.pets;
  // Keep the compare bar in step with what is shown here
  PawPal.compare.set(pets.map((p) => ({ id: p.id, name: p.name, img: sized(photo(p), 200) })));
  const yes = (v, a, b) => (v ? `<span class="cmp-yes">${icons.check}${esc(a)}</span>` : `<span class="cmp-no">${esc(b)}</span>`);
  const highlights = Object.fromEntries((res.highlights || []).map((h) => [h.petId, h.points || []]));
  const rows = [
    ['Species & breed', (p) => `${esc(p.type)} · ${esc(p.breed)}`],
    ['Age', (p) => esc(ageText(p.age))],
    ['Sex', (p) => esc(p.gender || 'Unknown')],
    ['Size', (p) => esc(p.size)],
    ['Energy', (p) => `<span class="cmp-energy" data-level="${Number(p.energyLevel) || 2}"><i></i><i></i><i></i></span>${esc(energyText(p.energyLevel))}`],
    ['Children', (p) => yes(p.goodWithChildren, 'Good with kids', 'Adult home preferred')],
    ['Other pets', (p) => yes(p.goodWithOtherPets, 'Gets along with pets', 'Prefers to be the only pet')],
    ['Home', (p) => (p.requiresYard ? '<span class="cmp-no">Needs a secure yard</span>' : `<span class="cmp-yes">${icons.check}No yard needed</span>`)],
    ['First-time owners', (p) => yes(p.firstTimeFriendly, 'Suits first-timers', 'Some experience helps')],
    ['Personality', (p) => ((p.traits || []).length ? (p.traits || []).slice(0, 5).map((t) => `<span class="tag">${esc(t)}</span>`).join(' ') : '<span class="muted">—</span>')],
    ['Location', (p) => esc([p.location, p.shelterName].filter(Boolean).join(' · ') || '—')],
    ['Adoption fee', (p) => esc(money(p.adoptionFee))],
    ['Status', (p) => (p.status === 'On Hold' ? '<span class="badge badge-honey">On hold</span>' : '<span class="badge badge-sage">Available</span>')],
  ];
  if (res.hasProfile) rows.unshift(['Your match', (p) => `<b class="cmp-score">${res.scores[p.id].score}%</b>`]);

  const head = pets.map((p) => `<th scope="col"><div class="cmp-pet">
      <img src="${esc(sized(photo(p), 600))}" alt="${esc(p.name)}, a ${esc(p.breed)}" data-fallback="${PawPal.FALLBACK[p.type] || PawPal.PLACEHOLDER}">
      <a class="cmp-name" href="pet-profile.html?id=${encodeURIComponent(p.id)}">${esc(p.name)}</a>
      <button type="button" class="link-btn small" data-remove="${esc(p.id)}">Remove</button></div></th>`).join('');
  root.innerHTML = `
    <div class="ai-panel cmp-summary">
      <div class="row-between"><span class="src-label src-ai">${icons.sparkle}How they differ</span><span class="tiny muted">${esc(aiLabel(res.source))}</span></div>
      <p style="margin-top:8px" id="compareSummary">${esc(res.summary)}</p>
      ${res.hasProfile ? `<p class="tiny muted" style="margin-top:6px">Match scores use the lifestyle saved on your profile${res.understood.length ? ` (${esc(res.understood.slice(0, 4).join(', '))})` : ''}. <a href="ai-matching.html">Update it</a></p>`
        : PawPal.user?.role === 'user' ? '<p class="tiny muted" style="margin-top:6px"><a href="ai-matching.html">Tell PawPal about your lifestyle</a> to see a match score for each pet.</p>'
          : PawPal.user ? '' : '<p class="tiny muted" style="margin-top:6px"><a href="login.html?mode=signup">Create an account</a> and describe your lifestyle to see a match score for each pet.</p>'}
    </div>
    <div class="cmp-scroll" tabindex="0" role="region" aria-label="Comparison table">
      <table class="cmp-table" id="compareTable" style="--cols:${pets.length}">
        <thead><tr><td></td>${head}</tr></thead>
        <tbody>
          ${rows.map(([label, fn]) => `<tr><th scope="row">${esc(label)}</th>${pets.map((p) => `<td>${fn(p)}</td>`).join('')}</tr>`).join('')}
          <tr><th scope="row">Good to know</th>${pets.map((p) => `<td>${(highlights[p.id] || []).length ? `<ul class="plain cmp-points">${highlights[p.id].map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '<span class="muted">—</span>'}</td>`).join('')}</tr>
          <tr><th scope="row"><span class="sr-only">Actions</span></th>${pets.map((p) => `<td><a class="btn btn-primary btn-sm" href="pet-profile.html?id=${encodeURIComponent(p.id)}">Meet ${esc(p.name)}</a></td>`).join('')}</tr>
        </tbody>
      </table>
    </div>
    <p class="tiny muted" style="margin-top:12px">Facts come from the shelter. Compatibility is guidance only — the shelter team makes the final decision.</p>`;

  root.addEventListener('click', (e) => {
    const rm = e.target.closest('[data-remove]');
    if (!rm) return;
    const left = pets.filter((p) => p.id !== rm.dataset.remove);
    PawPal.compare.set(left.map((p) => ({ id: p.id, name: p.name, img: sized(photo(p), 200) })));
    if (left.length >= 2) location.href = PawPal.compare.url();
    else location.href = 'adopt.html';
  });
})();
