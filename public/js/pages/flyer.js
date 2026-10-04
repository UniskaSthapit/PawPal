// Printable A4 adoption flyer (staff). Uses only public pet fields; the QR code opens the pet's public profile
// on the configured site address (APP_URL), so it works when scanned from paper.
(async () => {
  const { $, esc, params, icons, ageText, errorHTML } = PawPal;
  await PawPal.booted;
  const id = params.get('id');
  if (!id) { $('#flyer').innerHTML = errorHTML('Choose a pet from the Pets page to make a flyer.'); return; }
  let pet; let shelter; let cfg;
  try {
    [{ pet, shelter }, cfg] = await Promise.all([PawPalAPI.get(`/pets/${encodeURIComponent(id)}`, { public: 1 }), PawPal.siteConfig]);
  } catch (err) { $('#flyer').innerHTML = errorHTML(err.message); return; }

  const site = (cfg.siteUrl || location.origin).replace(/\/$/, '');
  const profileUrl = `${site}/pet-profile.html?id=${encodeURIComponent(pet.id)}`;
  $('#crumb').textContent = `${pet.name} — flyer`;
  $('#editLink').href = `add-pet.html?id=${encodeURIComponent(pet.id)}`;
  document.title = `${pet.name} adoption flyer — PawPal`;

  // Public description, cut at a sentence so it fits the page
  const shortText = (text, max = 420) => {
    const t = String(text || '').replace(/\s+/g, ' ').trim();
    if (t.length <= max) return t;
    const cut = t.slice(0, max); const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '));
    return (end > 160 ? cut.slice(0, end + 1) : `${cut.replace(/\s+\S*$/, '')}…`);
  };
  const facts = [['Breed', pet.breed], ['Age', ageText(pet.age)], ['Size', pet.size], ['Sex', pet.gender]].filter(([, v]) => v);
  const badges = [pet.goodWithChildren && 'Good with children', pet.goodWithOtherPets && 'Good with other pets', !pet.requiresYard && 'No yard needed',
    pet.firstTimeFriendly && 'Great for first-time owners', pet.vaccinated && 'Vaccinated', pet.desexed && 'Desexed', pet.microchipped && 'Microchipped'].filter(Boolean).slice(0, 6);
  const contact = shelter ? [shelter.phone, shelter.email].filter(Boolean).join(' · ') : '';

  $('#flyer').innerHTML = `
    <header class="flyer-head"><img src="images/logo.png" alt="" width="44" height="44"><span class="flyer-brand">Paw<em>Pal</em></span><span class="flyer-tag">Adopt me</span></header>
    <div class="flyer-photo"><img src="${esc(PawPal.sized(PawPal.photo(pet), 1200))}" alt="${esc(pet.name)}, a ${esc(pet.breed)}" data-fallback="${PawPal.FALLBACK[pet.type]}"></div>
    <h2 class="flyer-name">Hi, I'm ${esc(pet.name)}!</h2>
    <dl class="flyer-facts">${facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
    ${badges.length ? `<ul class="flyer-badges">${badges.map((b) => `<li>${icons.check}${esc(b)}</li>`).join('')}</ul>` : ''}
    <p class="flyer-desc">${esc(shortText(pet.description))}</p>
    <footer class="flyer-foot">
      <div class="flyer-contact"><b>${esc(shelter?.name || 'PawPal partner shelter')}</b>
        ${shelter ? `<span>${esc(shelter.address || `${shelter.suburb}, ${shelter.state}`)}</span>` : ''}
        ${contact ? `<span>${esc(contact)}</span>` : ''}
        <span class="flyer-url">${esc(profileUrl.replace(/^https?:\/\//, ''))}</span></div>
      <div class="flyer-qr">${PawPalQR.svg(profileUrl, { label: `QR code: ${pet.name}'s adoption profile` })}<span>Scan to meet me</span></div>
    </footer>`;
  $('#printBtn').disabled = false;
  $('#printBtn').addEventListener('click', () => window.print());
})();
