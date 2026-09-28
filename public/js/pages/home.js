// Home page — live pet grid, keyword search (FR-04, logged for FR-06) and filters.
(() => {
  const { $, $$, params, esc, petCardHTML, toast } = PawPal;
  const grid = $('#petGrid');
  const input = $('#searchInput');
  const clearBtn = $('#clearBtn');
  const PAGE = 8;
  const state = { q: params.get('q') || '', type: params.get('type') || '', traits: new Set(), sort: 'newest', shown: PAGE, pets: [] };
  let timer;

  const skeletons = () => { grid.innerHTML = Array.from({ length: 4 }, () => '<div class="skeleton skeleton-card"></div>').join(''); };

  function syncUrl() {
    const p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    if (state.type) p.set('type', state.type);
    history.replaceState(null, '', `home.html${p.toString() ? '?' + p : ''}${location.hash}`);
  }

  function render() {
    const { pets } = state;
    const label = state.type === 'dog' ? 'dogs' : state.type === 'cat' ? 'cats' : state.type === 'other' ? 'other pets' : 'companions';
    $('#gridSub').textContent = pets.length
      ? `Showing ${Math.min(state.shown, pets.length)} of ${pets.length} ${label}${state.q ? ` matching “${state.q}”` : ''}`
      : 'No pets match right now';
    if (!pets.length) {
      grid.innerHTML = `<div class="pp-empty" style="grid-column:1/-1">
        <div class="pp-empty-emoji">🐾</div><h3>No pets match that search</h3>
        <p>Try a different word, remove a filter, or let our AI suggest pets that suit your lifestyle.</p>
        <button class="pp-btn pp-btn-ghost" id="resetSearch">Clear search and filters</button>
        <a class="pp-btn pp-btn-primary" href="ai-matching.html">Take the AI quiz</a></div>`;
      $('#loadMore').hidden = true;
      return;
    }
    grid.innerHTML = pets.slice(0, state.shown).map((p) => petCardHTML(p)).join('');
    $('#loadMore').hidden = state.shown >= pets.length;
  }

  async function load({ log = false } = {}) {
    skeletons();
    try {
      const { pets } = await PawPalAPI.get('/pets', { q: state.q, type: state.type, traits: [...state.traits].join(','), sort: state.sort, log: log ? 1 : '' });
      state.pets = pets;
      state.shown = PAGE;
      render();
    } catch (err) {
      grid.innerHTML = `<div class="pp-empty" style="grid-column:1/-1"><h3>Pets could not load</h3><p>${esc(err.message)}</p>
        <button class="pp-btn pp-btn-primary" onclick="location.reload()">Try again</button></div>`;
    }
  }

  function syncPills() {
    $$('#filterPills .filter-pill').forEach((b) => {
      const on = b.dataset.type ? b.dataset.type === state.type : state.traits.has(b.dataset.trait);
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on);
    });
  }

  // ---- events ----
  $('#searchForm').addEventListener('submit', (e) => {
    e.preventDefault();
    state.q = input.value.trim();
    syncUrl();
    load({ log: Boolean(state.q) });
    $('#pets').scrollIntoView({ behavior: 'smooth' });
  });
  input.addEventListener('input', () => {
    clearBtn.classList.toggle('visible', input.value.length > 0);
    clearTimeout(timer);
    timer = setTimeout(() => { state.q = input.value.trim(); syncUrl(); load(); }, 350);
  });
  clearBtn.addEventListener('click', () => { input.value = ''; clearBtn.classList.remove('visible'); state.q = ''; syncUrl(); load(); input.focus(); });

  $('#filterPills').addEventListener('click', (e) => {
    const b = e.target.closest('.filter-pill');
    if (!b) return;
    if (b.dataset.type) state.type = state.type === b.dataset.type ? '' : b.dataset.type;
    else if (state.traits.has(b.dataset.trait)) state.traits.delete(b.dataset.trait);
    else state.traits.add(b.dataset.trait);
    syncPills(); syncUrl(); load();
  });
  $('#sortSelect').addEventListener('change', (e) => { state.sort = e.target.value; load(); });
  $('#loadMore').addEventListener('click', () => { state.shown += PAGE; render(); });
  grid.addEventListener('click', (e) => {
    if (e.target.closest('#resetSearch')) { state.q = ''; state.type = ''; state.traits.clear(); input.value = ''; syncPills(); syncUrl(); load(); return; }
    const card = e.target.closest('.pet-card');
    if (card && !e.target.closest('a,button')) location.href = `pet-profile.html?id=${encodeURIComponent(card.dataset.id)}`;
  });
  $('#newsletterForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    e.target.reset();
    toast('Thanks! You\'re on the list for weekly pet spotlights.');
  });
  const yr = $('#yr'); if (yr) yr.textContent = new Date().getFullYear();

  // ---- start ----
  input.value = state.q;
  clearBtn.classList.toggle('visible', Boolean(state.q));
  syncPills();
  load();
  PawPalAPI.get('/pets').then(({ total }) => { $('#heroCount').textContent = `${total} pets waiting for a home right now`; }).catch(() => {});
})();
