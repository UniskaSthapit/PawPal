// Vet finder: Google Places results when configured, otherwise the keyless Google Maps embed.
(async () => {
  const { $, esc, icons, errorHTML } = PawPal;
  await PawPal.booted;
  let cfg = {};
  try { cfg = await PawPalAPI.get('/config'); } catch { /* keyless map still works */ }
  const setMap = (q, lat, lng) => {
    const where = lat ? `${lat},${lng}` : q;
    $('#vetMap').src = cfg.mapsEmbedKey
      ? `https://www.google.com/maps/embed/v1/search?key=${encodeURIComponent(cfg.mapsEmbedKey)}&q=${encodeURIComponent(`veterinary clinic near ${where}`)}`
      : `https://www.google.com/maps?q=${encodeURIComponent(`veterinary clinic near ${where}`)}&output=embed`;
  };
  async function search(q, lat, lng) {
    setMap(q || 'Melbourne VIC', lat, lng);
    $('#vetList').innerHTML = '<div class="skeleton" style="height:100px"></div><div class="skeleton" style="height:100px"></div>';
    try {
      const r = await PawPalAPI.get('/vets', { q, lat, lng });
      if (!r.enabled) { $('#vetList').innerHTML = `<div class="card card-pad small">${icons.info} ${esc(r.error || 'The map shows clinics near your search. Tap a clinic on the map for directions and opening hours.')}</div>`; return; }
      $('#vetList').innerHTML = r.results.length ? r.results.map((v) => `<div class="card card-pad"><div class="row-between"><h3 style="font-size:18px">${esc(v.name)}</h3>${v.openNow === true ? '<span class="badge badge-sage">Open now</span>' : v.openNow === false ? '<span class="badge">Closed</span>' : ''}</div>
        <p class="small muted" style="margin-top:4px">${esc(v.address)}</p><div class="row small" style="margin-top:8px">${v.rating ? `${icons.star} ${v.rating} (${v.reviews})` : ''}${v.phone ? ` · <a href="tel:${esc(v.phone.replace(/[^\d+]/g, ''))}">${esc(v.phone)}</a>` : ''}${v.mapsUrl ? ` · <a href="${esc(v.mapsUrl)}" target="_blank" rel="noopener">Directions</a>` : ''}</div></div>`).join('')
        : '<p class="muted">No clinics found for that search.</p>';
    } catch (err) { $('#vetList').innerHTML = errorHTML(err.message); }
  }
  $('#vetForm').addEventListener('submit', (e) => { e.preventDefault(); search($('#vetQ').value.trim()); });
  $('#nearMe').addEventListener('click', () => {
    if (!navigator.geolocation) return PawPal.toast('Location isn\'t available in this browser.', 'error');
    navigator.geolocation.getCurrentPosition((p) => search('', p.coords.latitude.toFixed(4), p.coords.longitude.toFixed(4)), () => PawPal.toast('We couldn\'t get your location. Try searching by suburb.', 'error'));
  });
  search(PawPal.params.get('q') || 'Melbourne VIC');
})();
