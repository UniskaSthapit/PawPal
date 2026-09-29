// Find My PawPal: free-text lifestyle → /api/ai/match → ranked, explained matches from real pets.
(async () => {
  const { $, $$, esc, icons, photo, sized, setBusy, errorHTML, emptyHTML, ageText } = PawPal;
  const u = await PawPal.booted;
  if (u?.role === 'user') {
    $('#saveNote').innerHTML = `${icons.checkCircle} Your lifestyle is saved to your profile, so we can show matches on your dashboard and tell you when a new pet fits.`;
    try {
      const me = await PawPalAPI.get('/users/me');
      if (me.preferencesText) $('#about').value = me.preferencesText;
    } catch { /* ignore */ }
  }
  if (PawPal.isStaffUser(u)) $('#saveNote').textContent = 'You are signed in as shelter staff — results are not saved.';

  $$('[data-example]').forEach((b) => b.addEventListener('click', () => { $('#about').value = b.dataset.example; $('#about').focus(); }));

  const ringClass = (n) => (n >= 75 ? '' : 'mid');
  function matchCardHTML(m, i) {
    const p = m.pet;
    return `<article class="match-card" style="animation-delay:${i * 80}ms">
      <div class="media"><img src="${esc(sized(photo(p), 600))}" alt="${esc(p.name)}, a ${esc(p.breed)}" loading="lazy" data-fallback="${PawPal.FALLBACK[p.type]}">
        <button class="fav-btn" data-fav="${esc(p.id)}" data-name="${esc(p.name)}" aria-pressed="${PawPal.favs.has(p.id)}" aria-label="Save ${esc(p.name)}">${icons.heart}</button></div>
      <div class="body">
        <div class="row-between" style="align-items:flex-start;flex-wrap:nowrap">
          <div><h3><a href="pet-profile.html?id=${encodeURIComponent(p.id)}">${esc(p.name)}</a></h3>
            <div class="small muted">${esc(p.breed)} · ${esc(ageText(p.age))} · ${esc(p.size)} · ${esc(p.location || '')}</div></div>
          <div class="match-ring ${ringClass(m.score)}" style="--p:${m.score}" role="img" aria-label="${m.score}% compatibility"><span>${m.score}%</span></div>
        </div>
        ${m.summary ? `<div><span class="src-label src-ai">${icons.sparkle}Why ${esc(p.name)} could suit you</span><p style="margin-top:4px">${esc(m.summary)}</p></div>` : ''}
        ${m.reasons.length ? `<ul class="plain reason-list pos">${m.reasons.map((r) => `<li>${icons.check}<span>${esc(r)}</span></li>`).join('')}</ul>` : ''}
        ${m.considerations.length ? `<div><span class="src-label" style="color:var(--honey-ink)">${icons.info}Worth considering</span><ul class="plain reason-list con" style="margin-top:6px">${m.considerations.map((r) => `<li>${icons.info}<span>${esc(r)}</span></li>`).join('')}</ul></div>` : ''}
        <div class="fact-panel" style="padding:10px 12px"><span class="src-label src-shelter">${icons.building}Shelter facts</span>
          <div class="small" style="margin-top:4px">${esc(PawPal.energyText(p.energyLevel))} · ${p.goodWithChildren ? 'Good with kids' : 'Adult home preferred'} · ${p.goodWithOtherPets ? 'OK with other pets' : 'Only pet'} · ${p.requiresYard ? 'Needs a yard' : 'No yard needed'}${p.status === 'On Hold' ? ' · Currently on hold' : ''}</div></div>
        <div class="row" style="margin-top:auto"><a class="btn btn-primary btn-sm" href="pet-profile.html?id=${encodeURIComponent(p.id)}">Meet ${esc(p.name)}</a>
          <button class="btn btn-sm" data-ask="Why did you recommend ${esc(p.name)}?">${icons.message}Ask why</button></div>
      </div></article>`;
  }

  $('#matchForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = $('#about').value.trim();
    const body = { text, homeType: $('#homeType').value, activity: $('#activity').value, hoursAlone: $('#hoursAlone').value, experience: $('#experience').value,
      preferredType: $('#preferredType').value, limit: 6 };
    if ($('#hasChildren').checked) body.hasChildren = true;
    if ($('#hasOtherPets').checked) body.hasOtherPets = true;
    $('#formError').innerHTML = '';
    if (text.length < 8 && !Object.values(body).some((v) => v && v !== 6 && v !== text)) {
      $('#formError').innerHTML = errorHTML('Tell PawPal a little about your home and lifestyle first — even one sentence helps.');
      return $('#about').focus();
    }
    const btn = $('#matchBtn');
    setBusy(btn, true, 'Finding your matches…');
    $('#results').innerHTML = `<div class="ai-panel"><span class="src-label src-ai">${icons.sparkle}Reading your lifestyle…</span><div class="skeleton" style="height:28px;margin-top:10px;width:70%"></div></div>
      ${[0, 1, 2].map(() => '<div class="skeleton" style="height:240px;margin-top:16px;border-radius:20px"></div>').join('')}`;
    try {
      const res = await PawPalAPI.post('/ai/match', body);
      const engine = res.source === 'anthropic' ? 'Claude' : res.source === 'openai' ? 'OpenAI' : 'PawPal matching engine';
      $('#results').innerHTML = `
        <div class="ai-panel">
          <div class="row-between"><span class="src-label src-ai">${icons.sparkle}What PawPal understood</span><span class="tiny muted">${esc(engine)}</span></div>
          <div class="understood" style="margin-top:10px">${res.understood.length ? res.understood.map((x) => `<span class="badge badge-honey">${esc(x)}</span>`).join('') : '<span class="small muted">Not much yet — add a few details for sharper matches.</span>'}</div>
          ${res.saved ? `<p class="small" style="margin-top:10px">${icons.checkCircle} Saved to your profile. We'll notify you when a new pet is a strong match.</p>` : ''}
        </div>
        <div class="row-between" style="margin:24px 0 14px"><h2 class="h3">${res.matches.length ? `Your top ${res.matches.length} matches` : 'No matches yet'}</h2><a class="small" href="adopt.html">Browse all pets</a></div>
        <div class="stack" style="--stack:16px">${res.matches.length ? res.matches.map(matchCardHTML).join('') : emptyHTML({ title: 'No pets available right now', text: 'New animals arrive every week. Create an account and we\'ll let you know when a strong match arrives.' })}</div>
        <p class="disclaimer" style="margin-top:20px">${icons.info}Compatibility compares what you told us with shelter-provided facts. It's guidance, not a guarantee — meet the pet and talk with the shelter before deciding.</p>`;
      $('#results').scrollIntoView({ behavior: PawPal.reduceMotion ? 'auto' : 'smooth', block: 'start' });
    } catch (err) {
      $('#results').innerHTML = errorHTML(err.message);
    } finally { setBusy(btn, false); }
  });

  if (PawPal.params.get('text')) { $('#about').value = PawPal.params.get('text'); $('#matchForm').requestSubmit(); }
})();
