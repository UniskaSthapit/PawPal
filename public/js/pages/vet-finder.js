// Vet finder: the top 5 Google-rated clinics under the search bar (Google Places, when a Maps key is set),
// the rest of the clinics beside the map, and the keyless Google Maps embed when there is no key.
// Ratings and reviews are only ever Google's own — nothing is invented when live data isn't available.
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
  const googleSearch = (where) => `https://www.google.com/maps/search/${encodeURIComponent(`veterinary clinic near ${where}`)}`;
  const tel = (phone) => phone.replace(/[^\d+]/g, '');
  const stars = (rating, reviews) => `<span class="stars" aria-label="Rated ${rating} out of 5 from ${reviews} Google reviews"><i aria-hidden="true"><span style="width:${Math.max(0, Math.min(100, (rating / 5) * 100))}%"></span></i>${Number(rating).toFixed(1)}
    <small>(${Number(reviews).toLocaleString('en-AU')} Google review${reviews === 1 ? '' : 's'})</small></span>`;
  const openBadge = (v) => (v.openNow === true ? '<span class="badge badge-sage">Open now</span>' : v.openNow === false ? '<span class="badge">Closed now</span>' : '');

  function topHTML(top) {
    return `<ol class="vet-top-list">${top.map((v, i) => `<li class="vet-top">
        <span class="vet-rank" aria-label="Number ${i + 1}">${i + 1}</span>
        <div style="min-width:0"><h3>${esc(v.name)}</h3><p class="addr">${esc(v.address)}</p>
          <div class="vet-meta">${stars(v.rating, v.reviews)}${openBadge(v)}</div>
          ${v.review ? `<p class="small" style="margin-top:8px">"${esc(v.review.text)}${v.review.text.length >= 220 ? '…' : ''}" <span class="muted">— ${v.review.authorUrl ? `<a href="${esc(v.review.authorUrl)}" target="_blank" rel="noopener">${esc(v.review.author)}</a>` : esc(v.review.author)}${v.review.when ? `, ${esc(v.review.when)}` : ''}</span></p>` : ''}</div>
        <div class="vet-actions">${v.mapsUrl ? `<a class="btn btn-sm btn-primary" href="${esc(v.mapsUrl)}" target="_blank" rel="noopener">${icons.pin}Directions</a><a class="btn btn-sm" href="${esc(v.mapsUrl)}" target="_blank" rel="noopener">${icons.star}Reviews</a>` : ''}
          ${v.phone ? `<a class="btn btn-sm" href="tel:${esc(tel(v.phone))}">${icons.phone}Call</a>` : ''}</div></li>`).join('')}</ol>
      <p class="tiny muted" style="margin-top:8px">Ranked by Google rating and number of reviews. Ratings and reviews from Google.</p>`;
  }

  async function search(q, lat, lng) {
    const where = lat ? 'your location' : q;
    setMap(q || 'Melbourne VIC', lat, lng);
    $('#topVetsLabel').textContent = `Top-rated vets near ${where}`;
    $('#topVetsBody').innerHTML = '<div class="skeleton" style="height:84px;margin-top:12px"></div><div class="skeleton" style="height:84px;margin-top:10px"></div>';
    $('#vetList').innerHTML = '<div class="skeleton" style="height:100px"></div>';
    try {
      const r = await PawPalAPI.get('/vets', { q, lat, lng });
      if (!r.enabled) {
        // No live Google data: point to Google's own top-rated list rather than showing made-up ratings
        $('#topVetsBody').innerHTML = `<div class="card card-pad" style="margin-top:12px"><p>See the highest-rated clinics near ${esc(where)}, with their Google reviews, on Google Maps.</p>
          <a class="btn btn-primary btn-sm" style="margin-top:10px" href="${googleSearch(lat ? `${lat},${lng}` : q || 'Melbourne VIC')}" target="_blank" rel="noopener">${icons.star}Top-rated vets on Google Maps</a>
          ${PawPal.user?.role === 'admin' ? '<p class="tiny muted" style="margin-top:10px">Administrators: add a <code>GOOGLE_MAPS_API_KEY</code> (Places API) in Render to show the top 5 with ratings and reviews right here. See DEPLOY.md.</p>' : ''}</div>`;
        $('#vetList').innerHTML = `<div class="card card-pad small">${icons.info} ${esc(r.error || 'The map shows clinics near your search. Tap a clinic on the map for directions and opening hours.')}</div>`;
        return;
      }
      $('#topVetsBody').innerHTML = r.top.length ? topHTML(r.top) : '<p class="muted" style="margin-top:10px">No rated clinics found for that search. Try a nearby suburb.</p>';
      const topIds = new Set(r.top.map((v) => v.id));
      const rest = r.results.filter((v) => !topIds.has(v.id));
      $('#vetList').innerHTML = rest.length ? `<h2 class="h3" style="font-size:20px">More clinics nearby</h2>${rest.map((v) => `<div class="card card-pad"><div class="row-between"><h3 style="font-size:18px">${esc(v.name)}</h3>${openBadge(v)}</div>
        <p class="small muted" style="margin-top:4px">${esc(v.address)}</p><div class="row small" style="margin-top:8px">${v.rating ? stars(v.rating, v.reviews) : ''}${v.phone ? ` · <a href="tel:${esc(tel(v.phone))}">${esc(v.phone)}</a>` : ''}${v.mapsUrl ? ` · <a href="${esc(v.mapsUrl)}" target="_blank" rel="noopener">Directions</a>` : ''}</div></div>`).join('')}`
        : r.results.length ? '<p class="muted small">The top clinics for this area are listed above. Tap a clinic on the map for more.</p>' : '<p class="muted">No clinics found for that search.</p>';
    } catch (err) {
      $('#topVetsBody').innerHTML = errorHTML(err.message);
      $('#vetList').innerHTML = '';
    }
  }
  $('#vetForm').addEventListener('submit', (e) => { e.preventDefault(); search($('#vetQ').value.trim() || 'Melbourne VIC'); });
  $('#nearMe').addEventListener('click', () => {
    if (!navigator.geolocation) return PawPal.toast('Location isn\'t available in this browser.', 'error');
    navigator.geolocation.getCurrentPosition((p) => search('', p.coords.latitude.toFixed(4), p.coords.longitude.toFixed(4)), () => PawPal.toast('We couldn\'t get your location. Try searching by suburb.', 'error'));
  });
  search(PawPal.params.get('q') || 'Melbourne VIC');
})();
