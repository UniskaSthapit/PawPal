// Pet profile: gallery, shelter-provided facts, compatibility (clearly labelled as PawPal's interpretation),
// apply / favourite / ask the shelter / ask the assistant, shelter details and similar pets.
(async () => {
  const { $, $$, esc, icons, params, photo, sized, srcset, petCardHTML, modal, toast, setBusy, errorHTML, ageLong, energyText, money } = PawPal;
  const id = params.get('id');
  const root = $('#profile');
  if (!id) { location.href = 'adopt.html'; return; }

  const u = await PawPal.booted;
  let data;
  try { data = await PawPalAPI.get(`/pets/${encodeURIComponent(id)}`, { view: 1 }); }
  catch (err) {
    root.innerHTML = `<div class="container section">${PawPal.emptyHTML({ icon: 'paw', title: 'We couldn\'t find this pet', text: err.message,
      action: `<a class="btn btn-primary" href="adopt.html">Browse available pets</a>` })}</div>`;
    return;
  }
  const { pet, shelter } = data;
  const adopted = pet.status === 'Adopted';
  document.title = `${pet.name} the ${pet.breed} — Adopt on PawPal`;
  $('meta[name="description"]').setAttribute('content', `${pet.name} is a ${ageLong(pet.age).toLowerCase()} old ${pet.breed} looking for a home${pet.location ? ` in ${pet.location}` : ''}.`);
  $('#crumb').textContent = pet.name;

  // Existing application by this adopter?
  let myApp = null;
  if (u?.role === 'user') {
    try { myApp = (await PawPalAPI.get('/applications/mine')).applications.find((a) => a.petId === pet.id && !['Adopted', 'Declined', 'Withdrawn'].includes(a.status)); } catch { /* ignore */ }
  }
  const staff = PawPal.isStaffUser(u);
  const photos = pet.photos?.length ? pet.photos : [photo(pet)];
  const pronoun = pet.gender === 'Female' ? 'her' : pet.gender === 'Male' ? 'him' : 'them';
  const energy = Number(pet.energyLevel) || 2;

  const applyPath = `inquiry-form.html?petId=${encodeURIComponent(pet.id)}`;
  const applyHref = u ? applyPath : `login.html?next=${encodeURIComponent(applyPath)}`;
  const applyBtn = adopted ? '' : staff
    ? `<a class="btn btn-dark btn-lg" href="add-pet.html?id=${encodeURIComponent(pet.id)}">${icons.edit}Edit in shelter portal</a>`
    : myApp ? `<a class="btn btn-sage btn-lg" href="my-applications.html?id=${encodeURIComponent(myApp.id)}">${icons.file}View my application · ${esc(myApp.status)}</a>`
      : `<a class="btn btn-primary btn-lg" href="${esc(applyHref)}">${icons.heart}Apply to adopt ${esc(pet.name)}</a>`;

  const goodWith = [
    [pet.goodWithChildren, 'child', 'Children', pet.goodWithChildren ? 'Comfortable with kids' : 'Best in an adult home'],
    [pet.goodWithOtherPets, 'paw', 'Other pets', pet.goodWithOtherPets ? 'Gets along with other animals' : 'Prefers to be the only pet'],
    [!pet.requiresYard, 'building', 'Apartment living', pet.requiresYard ? 'Needs a secure yard' : 'No yard required'],
    [pet.firstTimeFriendly || (energy <= 2 && !pet.specialNeeds), 'star', 'First-time owners', pet.firstTimeFriendly || energy <= 2 ? 'A good first pet' : 'Suits experienced owners'],
  ];

  root.innerHTML = `
  ${adopted ? `<div class="container" style="margin-top:16px"><div class="alert alert-success">${icons.home}<div><b>${esc(pet.name)} has found a home!</b> Thanks to everyone who showed interest. <a href="adopt.html">Meet other pets looking for a family</a>.</div></div></div>` : ''}
  <section class="container section-sm">
    <div class="profile-top">
      <div>
        <div class="gallery-main"><img id="mainImg" src="${esc(sized(photos[0], 1200))}" ${srcset(photos[0]) ? `srcset="${srcset(photos[0])}" sizes="(max-width: 960px) 100vw, 55vw"` : ''} alt="${esc(pet.name)}, a ${esc(pet.breed)}" data-fallback="${PawPal.FALLBACK[pet.type]}" fetchpriority="high">
          ${staff || adopted ? '' : `<button class="fav-btn" data-fav="${esc(pet.id)}" data-name="${esc(pet.name)}" aria-pressed="${PawPal.favs.has(pet.id)}" aria-label="Save ${esc(pet.name)} to favourites" style="width:50px;height:50px;right:16px;top:16px">${icons.heart}</button>`}</div>
        ${photos.length > 1 ? `<div class="gallery-thumbs" role="group" aria-label="More photos of ${esc(pet.name)}">${photos.map((p, i) => `<button type="button" data-thumb="${i}" aria-label="Photo ${i + 1}" aria-current="${i === 0}"><img src="${esc(sized(p, 240))}" alt="" loading="lazy" data-fallback="${PawPal.FALLBACK[pet.type]}"></button>`).join('')}</div>` : ''}
      </div>
      <div class="profile-side">
        <div class="row">${pet.status === 'On Hold' ? '<span class="badge badge-honey">On hold — meeting an adopter</span>' : adopted ? '<span class="badge badge-dark">Adopted</span>' : '<span class="badge badge-sage">Available for adoption</span>'}
          <span class="badge">${icons.pin}${esc(pet.location || 'Location on request')}</span></div>
        <h1 class="profile-name" style="margin-top:14px">${esc(pet.name)}</h1>
        <p class="lead" style="margin-top:6px">${esc(pet.breed)} · ${esc(pet.gender === 'Unknown' ? pet.type : pet.gender)}</p>
        <dl class="key-facts">
          <div><dt>Age</dt><dd>${esc(ageLong(pet.age))}</dd></div>
          <div><dt>Size</dt><dd>${esc(pet.size)}</dd></div>
          <div><dt>Sex</dt><dd>${esc(pet.gender)}</dd></div>
          <div><dt>Energy</dt><dd><span class="energy-meter" aria-label="${esc(energyText(energy))}">${[1, 2, 3].map((n) => `<i class="${n <= energy ? 'on' : ''}"></i>`).join('')}</span></dd></div>
          <div><dt>Colour</dt><dd>${esc(pet.colour || '—')}</dd></div>
          <div><dt>Adoption fee</dt><dd>${esc(money(pet.adoptionFee))}</dd></div>
        </dl>
        ${adopted ? '' : `<div class="profile-actions">${applyBtn}
          ${staff ? '' : `<button class="btn btn-lg btn-icon" data-fav="${esc(pet.id)}" data-name="${esc(pet.name)}" aria-pressed="${PawPal.favs.has(pet.id)}" aria-label="Save to favourites" style="width:56px">${icons.heart}</button>`}</div>
        ${staff ? '' : `<div class="row" style="margin-top:10px">
          <button class="btn btn-block" data-ask="Tell me about ${esc(pet.name)}. Would ${esc(pronoun)} suit my lifestyle?" style="flex:1">${icons.sparkle}Ask AI about ${esc(pet.name)}</button>
          <button class="btn btn-block" id="askShelter" style="flex:1">${icons.message}Ask the shelter</button></div>`}`}
        <div id="compat" style="margin-top:18px"></div>
      </div>
    </div>
  </section>

  <section class="container section-sm" style="padding-top:0">
    <div class="profile-body">
      <div class="stack" style="--stack:32px">
        <div>
          <span class="src-label src-shelter">${icons.building}From the shelter</span>
          <h2 class="h3" style="margin-top:8px">About ${esc(pet.name)}</h2>
          <div class="prose" style="margin-top:12px">${String(pet.description || `${pet.name} is waiting to meet you. Contact the shelter to learn more.`).split(/\n+/).map((p) => `<p>${esc(p)}</p>`).join('')}</div>
          ${pet.traits?.length ? `<div class="row" style="margin-top:16px;gap:6px">${pet.traits.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
        </div>
        <div>
          <h2 class="h3">Good with</h2>
          <div class="good-with" style="margin-top:14px">${goodWith.map(([yes, ic, label, sub]) => `<div class="gw-item ${yes ? 'gw-yes' : 'gw-no'}"><span class="gw-ic">${icons[ic]}</span><div>${esc(label)}<small>${esc(sub)}</small></div></div>`).join('')}</div>
        </div>
        ${pet.idealHome ? `<div class="fact-panel"><span class="src-label src-shelter">${icons.home}The shelter's ideal home for ${esc(pet.name)}</span><p style="margin-top:8px;font-size:17px">${esc(pet.idealHome)}</p></div>` : ''}
        <div>
          <h2 class="h3">Health &amp; care</h2>
          <ul class="plain reason-list pos" style="margin-top:12px">
            ${[['vaccinated', 'Vaccinated'], ['desexed', 'Desexed'], ['microchipped', 'Microchipped']].map(([k, l]) => `<li>${pet[k] ? icons.checkCircle : icons.minus}<span>${pet[k] ? l : `Not yet ${l.toLowerCase()} — ask the shelter`}</span></li>`).join('')}
          </ul>
          <p class="small muted" style="margin-top:10px">Health information is provided by the shelter. Ask the team for full vet records before adopting.</p>
        </div>
      </div>
      <div class="stack" style="--stack:20px">
        ${shelter ? `<div class="card card-pad"><div class="shelter-card"><span class="s-ic">${icons.building}</span><div>
          <span class="src-label src-shelter">Cared for by</span><h3 style="font-size:21px;margin-top:4px">${esc(shelter.name)}</h3>
          <p class="small muted" style="margin-top:4px">${esc(shelter.about || '')}</p>
          <dl class="kv" style="margin-top:14px">
            ${shelter.address ? `<dt>Address</dt><dd>${esc(shelter.address)}</dd>` : ''}${shelter.hours ? `<dt>Hours</dt><dd>${esc(shelter.hours)}</dd>` : ''}
            ${shelter.phone ? `<dt>Phone</dt><dd><a href="tel:${esc(shelter.phone.replace(/[^\d+]/g, ''))}">${esc(shelter.phone)}</a></dd>` : ''}
            ${shelter.email ? `<dt>Email</dt><dd><a href="mailto:${esc(shelter.email)}">${esc(shelter.email)}</a></dd>` : ''}</dl></div></div></div>` : ''}
        <div class="card card-pad">
          <h3 style="font-size:21px">Adopting ${esc(pet.name)}</h3>
          <ol class="plain reason-list pos" style="margin-top:14px">
            <li>${icons.file}<span><b>Apply online</b> — takes about 10 minutes.</span></li>
            <li>${icons.user}<span><b>Review &amp; chat</b> — the shelter reviews your application and may call you.</span></li>
            <li>${icons.handshake}<span><b>Meet &amp; greet</b> — spend time with ${esc(pet.name)} at the shelter.</span></li>
            <li>${icons.home}<span><b>Go home day</b> — ${pet.adoptionFee ? `adoption fee ${esc(money(pet.adoptionFee))}` : 'fee confirmed by the shelter'}.</span></li>
          </ol>
          <a class="small" href="home.html#faq" style="display:inline-block;margin-top:12px">Adoption FAQ</a>
        </div>
      </div>
    </div>
  </section>

  <section class="section section-tint" id="similarWrap" hidden>
    <div class="container"><div class="section-head"><span class="eyebrow">You might also like</span><h2 class="h2" style="margin-top:8px">Pets similar to ${esc(pet.name)}</h2></div>
    <div class="pet-grid" id="similar"></div></div>
  </section>`;
  PawPal.hydrateIcons(root);

  // ---------- gallery ----------
  root.addEventListener('click', (e) => {
    const t = e.target.closest('[data-thumb]');
    if (!t) return;
    const i = Number(t.dataset.thumb);
    const img = $('#mainImg');
    img.removeAttribute('srcset'); delete img.dataset.fellBack;
    img.src = sized(photos[i], 1200);
    $$('[data-thumb]').forEach((b) => b.setAttribute('aria-current', String(b === t)));
  });
  root.addEventListener('keydown', (e) => {
    if (!e.target.closest('[data-thumb]') || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    const btns = $$('[data-thumb]'); const i = btns.indexOf(e.target.closest('[data-thumb]'));
    const next = btns[(i + (e.key === 'ArrowRight' ? 1 : -1) + btns.length) % btns.length];
    next.focus(); next.click();
  });

  // ---------- compatibility (PawPal's interpretation, clearly labelled) ----------
  const compat = $('#compat');
  if (!staff && !adopted) {
    if (u?.role === 'user') {
      try {
        const c = await PawPalAPI.get(`/ai/compatibility/${encodeURIComponent(pet.id)}`);
        compat.innerHTML = c.hasProfile ? `<div class="ai-panel">
          <div class="row-between"><span class="src-label src-ai">${icons.sparkle}PawPal's interpretation</span><div class="match-ring ${c.score < 75 ? 'mid' : ''}" style="--p:${c.score};width:56px;height:56px"><span style="width:44px;height:44px;font-size:14px">${c.score}%</span></div></div>
          ${c.reasons.length ? `<ul class="plain reason-list pos" style="margin-top:8px">${c.reasons.map((r) => `<li>${icons.check}<span>${esc(r)}</span></li>`).join('')}</ul>` : ''}
          ${c.considerations.length ? `<ul class="plain reason-list con" style="margin-top:8px">${c.considerations.map((r) => `<li>${icons.info}<span>${esc(r)}</span></li>`).join('')}</ul>` : ''}
          <p class="tiny muted" style="margin-top:10px">Based on your saved lifestyle (<a href="profile.html#preferences">edit</a>). Guidance only — not a guarantee of behaviour.</p></div>`
          : `<div class="ai-panel small"><span class="src-label src-ai">${icons.sparkle}Is ${esc(pet.name)} right for you?</span><p style="margin-top:6px"><a href="ai-matching.html">Tell PawPal about your lifestyle</a> to see how well ${esc(pet.name)} fits.</p></div>`;
      } catch { compat.innerHTML = ''; }
    } else {
      compat.innerHTML = `<div class="ai-panel small"><span class="src-label src-ai">${icons.sparkle}Is ${esc(pet.name)} right for you?</span><p style="margin-top:6px"><a href="ai-matching.html">Describe your lifestyle</a> and PawPal will explain how well ${esc(pet.name)} might fit.</p></div>`;
    }
  }

  // ---------- ask the shelter ----------
  $('#askShelter')?.addEventListener('click', () => {
    if (!u) { location.href = `login.html?next=${encodeURIComponent(location.pathname.slice(1) + location.search)}`; return; }
    modal({ title: `Ask about ${pet.name}`, body: `<p class="muted small" style="margin-bottom:14px">Your question goes to ${esc(shelter?.name || 'the shelter team')}. You'll get an email and a notification when they reply.</p>
      <div class="field"><label for="enqMsg">Your question</label><textarea class="textarea" id="enqMsg" maxlength="1500" placeholder="e.g. How does ${esc(pet.name)} go with being left alone for a few hours?"></textarea></div><div id="enqErr"></div>`,
    actions: [{ label: 'Cancel', value: false }, { label: 'Send question', variant: 'btn-primary', onClick: async (m, btn) => {
      const message = $('#enqMsg', m).value.trim();
      if (message.length < 10) { $('#enqErr', m).innerHTML = errorHTML('Please write at least 10 characters.'); return false; }
      setBusy(btn, true, 'Sending…');
      try { const r = await PawPalAPI.post('/enquiries', { petId: pet.id, message }); toast(r.message); return true; }
      catch (err) { setBusy(btn, false); $('#enqErr', m).innerHTML = errorHTML(err.message); return false; }
    } }] });
  });

  // ---------- similar pets ----------
  try {
    const { pets } = await PawPalAPI.get('/pets', { type: ['Dog', 'Cat'].includes(pet.type) ? pet.type.toLowerCase() : 'other', available: 1 });
    const similar = pets.filter((p) => p.id !== pet.id).sort((a, b) => (Math.abs(a.energyLevel - energy) + (a.size === pet.size ? 0 : 1)) - (Math.abs(b.energyLevel - energy) + (b.size === pet.size ? 0 : 1))).slice(0, 4);
    if (similar.length) { $('#similar').innerHTML = similar.map((p) => petCardHTML(p)).join(''); $('#similarWrap').hidden = false; }
  } catch { /* optional section */ }
})();
