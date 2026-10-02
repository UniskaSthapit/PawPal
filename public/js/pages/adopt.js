// Pet discovery: filters synced to the URL, a species category bar, animated filter chips,
// plus natural-language search through /api/ai/search.
(async () => {
  const { $, $$, esc, icons, petCardHTML, emptyHTML, errorHTML, skeletonCards, params } = PawPal;
  const PAGE = 12;
  const MULTI = ['age', 'size', 'energy'];
  const LABELS = { type: { dog: 'Dogs', cat: 'Cats', other: 'Other pets' }, age: { baby: 'Under 1', young: '1–2 yrs', adult: '3–7 yrs', senior: '8+ yrs' },
    size: { small: 'Small', medium: 'Medium', large: 'Large' }, gender: { female: 'Female', male: 'Male' }, energy: { 1: 'Calm', 2: 'Moderate energy', 3: 'Very active' },
    apartment: 'Apartment OK', kids: 'Good with kids', otherPets: 'Good with pets', firstTime: 'First-time friendly', available: 'Hide on hold' };
  let state = readUrl();
  let shown = PAGE;
  let pets = [];

  function readUrl() {
    const s = { type: params.get('type') || '', gender: params.get('gender') || '', location: params.get('location') || '', breed: params.get('breed') || '',
      sort: params.get('sort') || 'newest', ask: params.get('ask') || params.get('q') || '' };
    MULTI.forEach((k) => { s[k] = (params.get(k) || '').split(',').filter(Boolean); });
    ['apartment', 'kids', 'otherPets', 'firstTime', 'available'].forEach((k) => { s[k] = params.get(k) === '1'; });
    return s;
  }
  function writeUrl() {
    const q = {};
    Object.entries(state).forEach(([k, v]) => {
      if (Array.isArray(v) ? v.length : v === true ? true : v && !(k === 'sort' && v === 'newest')) q[k] = Array.isArray(v) ? v.join(',') : v === true ? '1' : v;
    });
    history.replaceState(null, '', `adopt.html${PawPalAPI.qs(q)}`);
  }

  function syncControls() {
    $$('[data-f]').forEach((el) => {
      const k = el.dataset.f;
      if (el.classList.contains('chip')) el.setAttribute('aria-pressed', String(MULTI.includes(k) ? state[k].includes(el.dataset.v) : state[k] === el.dataset.v));
      else if (el.type === 'checkbox') el.checked = !!state[k];
      else el.value = state[k] || '';
    });
    $$('[data-cat]').forEach((b) => b.setAttribute('aria-pressed', String(!state.ask && (b.dataset.cat || '') === state.type)));
    $('#sort').value = state.sort;
    $('#nlInput').value = state.ask;
    const n = ['type', 'gender', 'location', 'breed'].filter((k) => state[k]).length + MULTI.reduce((t, k) => t + state[k].length, 0)
      + ['apartment', 'kids', 'otherPets', 'firstTime', 'available'].filter((k) => state[k]).length;
    $('#filterCount').textContent = n ? `(${n})` : '';
    // Active filter chips (removable)
    const chips = [];
    if (state.type) chips.push(['type', state.type, LABELS.type[state.type]]);
    if (state.gender) chips.push(['gender', state.gender, LABELS.gender[state.gender]]);
    MULTI.forEach((k) => state[k].forEach((v) => chips.push([k, v, LABELS[k][v]])));
    ['apartment', 'kids', 'otherPets', 'firstTime', 'available'].forEach((k) => state[k] && chips.push([k, '', LABELS[k]]));
    if (state.location) chips.push(['location', '', state.location]);
    if (state.breed) chips.push(['breed', '', state.breed]);
    $('#activeFilters').innerHTML = chips.map(([k, v, label]) => `<button class="chip" data-remove="${k}" data-v="${esc(v)}" aria-label="Remove filter ${esc(label)}">${esc(label)}${icons.close}</button>`).join('');
  }

  function render() {
    const grid = $('#grid');
    if (!pets.length) {
      grid.innerHTML = emptyHTML({ icon: 'search', title: 'No pets match those filters', text: 'Try removing a filter or two — or tell PawPal about your lifestyle and we\'ll suggest pets that could still suit you.',
        action: `<div class="row" style="justify-content:center"><button class="btn" id="resetAll">Clear filters</button><a class="btn btn-primary" href="ai-matching.html">${icons.sparkle}Find my PawPal</a></div>` });
      $('#loadMore').hidden = true;
      return;
    }
    grid.innerHTML = pets.slice(0, shown).map((p, i) => (p.pet ? petCardHTML(p.pet, { match: p.score, reason: p.summary, index: i }) : petCardHTML(p, { index: i }))).join('');
    $('#loadMore').hidden = shown >= pets.length;
  }

  async function loadFiltered() {
    $('#grid').innerHTML = skeletonCards(6);
    $('#nlResult').hidden = true;
    try {
      const q = { type: state.type, gender: state.gender, location: state.location.toLowerCase(), breed: state.breed.toLowerCase(), sort: state.sort,
        apartment: state.apartment ? 1 : '', kids: state.kids ? 1 : '', otherPets: state.otherPets ? 1 : '', firstTime: state.firstTime ? 1 : '', available: state.available ? 1 : '' };
      MULTI.forEach((k) => { q[k] = state[k].join(','); });
      const res = await PawPalAPI.get('/pets', q);
      pets = res.pets;
      $('#resultCount').textContent = `${res.total} pet${res.total === 1 ? '' : 's'} available`;
      render();
    } catch (err) {
      $('#resultCount').textContent = 'Pets';
      $('#grid').innerHTML = errorHTML(`We couldn't load pets: ${err.message}`);
    }
  }

  async function loadNatural() {
    $('#grid').innerHTML = skeletonCards(3);
    $('#resultCount').textContent = 'Searching…';
    $('#activeFilters').innerHTML = '';
    try {
      const res = await PawPalAPI.post('/ai/search', { query: state.ask });
      pets = res.results;
      const relaxedNames = { age: 'age', size: 'size', location: 'location', firstTime: 'first-time owner', breed: 'breed', energy: 'energy level' };
      $('#nlResult').hidden = false;
      $('#nlResult').innerHTML = `<div class="ai-panel">
        <div class="row-between"><span class="src-label src-ai">${icons.sparkle}PawPal's interpretation</span><button class="link-btn small" id="clearAsk">Clear search</button></div>
        <p style="margin-top:8px;font-weight:700">${esc(res.interpretation)}</p>
        ${res.understood.length ? `<div class="understood" style="margin-top:10px">${res.understood.map((u) => `<span class="badge badge-honey">${esc(u)}</span>`).join('')}</div>` : ''}
        ${res.relaxed.length ? `<p class="small" style="margin-top:10px">Nothing matched everything, so we relaxed: ${res.relaxed.map((r) => esc(relaxedNames[r] || r)).join(', ')}.</p>` : ''}
        <p class="disclaimer" style="margin-top:10px">${icons.info}Match percentages compare your description with shelter-provided facts. They're guidance, not a guarantee of behaviour.</p></div>`;
      $('#resultCount').textContent = `${res.total} pet${res.total === 1 ? '' : 's'} found`;
      render();
    } catch (err) {
      $('#grid').innerHTML = errorHTML(err.message);
      $('#resultCount').textContent = 'Search';
    }
  }

  const refresh = () => { shown = PAGE; writeUrl(); syncControls(); return state.ask ? loadNatural() : loadFiltered(); };

  // ---------- events ----------
  $('#filters').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip[data-f]');
    if (!chip) return;
    const k = chip.dataset.f; const v = chip.dataset.v;
    if (MULTI.includes(k)) state[k] = state[k].includes(v) ? state[k].filter((x) => x !== v) : [...state[k], v];
    else state[k] = state[k] === v ? '' : v;
    state.ask = '';
    if (!document.body.classList.contains('filters-open')) refresh(); else syncControls();
  });
  $('#filters').addEventListener('change', (e) => {
    const el = e.target.closest('[data-f]');
    if (!el) return;
    state[el.dataset.f] = el.type === 'checkbox' ? el.checked : el.value;
    state.ask = '';
    if (!document.body.classList.contains('filters-open')) refresh(); else syncControls();
  });
  $('#sort').addEventListener('change', () => { state.sort = $('#sort').value; refresh(); });
  $('#nlForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = $('#nlInput').value.trim();
    if (q.length < 2) return $('#nlInput').focus();
    state = { ...readUrl(), type: '', gender: '', location: '', breed: '', age: [], size: [], energy: [], apartment: false, kids: false, otherPets: false, firstTime: false, available: false, sort: state.sort, ask: q };
    refresh();
  });
  const clearAll = () => { state = { type: '', gender: '', location: '', breed: '', sort: state.sort, ask: '', age: [], size: [], energy: [], apartment: false, kids: false, otherPets: false, firstTime: false, available: false }; refresh(); };
  $('#clearFilters').addEventListener('click', clearAll);
  $('#clearFilters2').addEventListener('click', clearAll);
  document.addEventListener('click', (e) => {
    if (e.target.closest('#resetAll') || e.target.closest('#clearAsk')) return clearAll();
    const rm = e.target.closest('[data-remove]');
    if (rm) {
      const k = rm.dataset.remove;
      if (MULTI.includes(k)) state[k] = state[k].filter((x) => x !== rm.dataset.v);
      else state[k] = typeof state[k] === 'boolean' ? false : '';
      refresh();
    }
  });
  // "Show more" appends the next page; only the new cards animate in
  $('#loadMore').addEventListener('click', () => {
    const from = shown; shown += PAGE;
    $('#grid').insertAdjacentHTML('beforeend', pets.slice(from, shown).map((p, i) => (p.pet ? petCardHTML(p.pet, { match: p.score, reason: p.summary, index: i }) : petCardHTML(p, { index: i }))).join(''));
    $('#loadMore').hidden = shown >= pets.length;
  });
  // Category bar mirrors the Species chips
  $('.cat-bar').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat]');
    if (!b) return;
    state.type = b.dataset.cat; state.ask = '';
    refresh();
  });
  // Give a selected chip a little "pop" so the change is felt
  $('#filters').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip[data-f]');
    if (!chip) return;
    requestAnimationFrame(() => { chip.classList.remove('pop'); if (chip.getAttribute('aria-pressed') === 'true') { void chip.offsetWidth; chip.classList.add('pop'); } });
  });
  // Mobile filter drawer
  const openF = () => { document.body.classList.add('filters-open'); $('#closeFilters').style.display = 'grid'; $('#closeFilters').focus(); };
  const closeF = () => { document.body.classList.remove('filters-open'); $('#closeFilters').style.display = 'none'; };
  $('#openFilters').addEventListener('click', openF);
  $('#closeFilters').addEventListener('click', closeF);
  $('#applyFilters').addEventListener('click', () => { closeF(); refresh(); $('#resultCount').scrollIntoView({ block: 'start' }); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.body.classList.contains('filters-open')) closeF(); });

  // ---------- init ----------
  await PawPal.booted;
  try {
    const f = await PawPalAPI.get('/pets/facets');
    $('#fLocation').insertAdjacentHTML('beforeend', f.locations.map((l) => `<option value="${esc(l.split(',')[0])}">${esc(l)}</option>`).join(''));
    $('#fBreed').insertAdjacentHTML('beforeend', f.breeds.map((b) => `<option value="${esc(b)}">${esc(b)}</option>`).join(''));
  } catch { /* filters still work without facets */ }
  // Links from the home page may pass a state (e.g. "VIC") rather than a suburb
  if (state.location && ![...$('#fLocation').options].some((o) => o.value === state.location)) $('#fLocation').insertAdjacentHTML('beforeend', `<option value="${esc(state.location)}">${esc(state.location)}</option>`);
  refresh();
})();
