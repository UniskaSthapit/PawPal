// Find nearby vets (FR-11) — Google Places list when a key is configured, keyless Google map otherwise.
(async () => {
  const { $, esc, toast, setBusy } = PawPal;
  const cfg = await PawPalAPI.get('/config').catch(() => ({}));
  const map = $('#vetMap');

  function showMap(query) {
    const q = `veterinary clinic near ${query}`;
    map.src = cfg.mapsEmbedKey
      ? `https://www.google.com/maps/embed/v1/search?key=${encodeURIComponent(cfg.mapsEmbedKey)}&q=${encodeURIComponent(q)}`
      : `https://maps.google.com/maps?q=${encodeURIComponent(q)}&z=13&output=embed`;
  }

  async function search(query, coords) {
    showMap(coords ? `${coords.lat},${coords.lng}` : query);
    const box = $('#vetResults');
    const mapsLink = `https://www.google.com/maps/search/${encodeURIComponent('veterinary clinic near ' + (coords ? `${coords.lat},${coords.lng}` : query))}`;
    if (cfg.mapsMode !== 'google-places') {
      box.innerHTML = `<div class="pp-card vet-note"><h3>Clinics near ${esc(coords ? 'you' : query)}</h3>
        <p>Tap a pin on the map to see opening hours, reviews and directions.</p><a class="pp-btn pp-btn-soft pp-btn-sm" href="${mapsLink}" target="_blank" rel="noopener">Open in Google Maps</a></div>`;
      return;
    }
    box.innerHTML = '<div class="skeleton" style="height:220px"></div>';
    try {
      const r = await PawPalAPI.get('/vets', { q: coords ? '' : query, lat: coords?.lat, lng: coords?.lng });
      if (r.error) toast(r.error, 'info');
      box.innerHTML = r.results.length ? `<div class="vet-list">${r.results.map((v) => `<article class="vet-item">
          <h3>${esc(v.name)}</h3><p>${esc(v.address)}</p>
          <div class="vet-meta">${v.rating ? `<span>★ ${v.rating} (${v.reviews})</span>` : ''}${v.openNow === true ? '<span class="open">Open now</span>' : v.openNow === false ? '<span class="closed">Closed</span>' : ''}</div>
          <div class="vet-links">${v.phone ? `<a href="tel:${esc(v.phone.replace(/\s/g, ''))}">Call ${esc(v.phone)}</a>` : ''}${v.mapsUrl ? `<a href="${esc(v.mapsUrl)}" target="_blank" rel="noopener">Directions</a>` : ''}</div>
        </article>`).join('')}</div>`
        : `<div class="pp-card vet-note"><h3>No clinics found</h3><p>Try a nearby suburb or postcode.</p></div>`;
    } catch (err) { box.innerHTML = `<div class="pp-alert pp-alert-error">${esc(err.message)}</div>`; }
  }

  $('#vetForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = $('#vetQuery').value.trim();
    if (!q) return toast('Enter a suburb or postcode first.', 'info');
    search(q);
  });
  $('#locateBtn').addEventListener('click', (e) => {
    if (!navigator.geolocation) return toast('Your browser cannot share your location. Search by suburb instead.', 'info');
    setBusy(e.target, true, 'Locating…');
    navigator.geolocation.getCurrentPosition(
      (pos) => { setBusy(e.target, false); search('', { lat: pos.coords.latitude.toFixed(5), lng: pos.coords.longitude.toFixed(5) }); },
      () => { setBusy(e.target, false); toast('Location permission was denied. Search by suburb instead.', 'info'); },
      { timeout: 10000 });
  });

  const initial = PawPal.params.get('q') || 'Melbourne VIC';
  $('#vetQuery').value = PawPal.params.get('q') || '';
  search(initial);
})();
