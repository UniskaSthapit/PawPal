// Adopter dashboard: nudges, key numbers, active applications with progress, recommendations,
// favourites, enquiries, notifications and saved assistant conversations — all from the API.
(async () => {
  const { $, esc, icons, petCardHTML, emptyHTML, errorHTML, timeAgo, statusBadge, fmtDateTime, noteHTML } = PawPal;
  const u = await PawPal.booted;
  if (!u) return;
  const hour = new Date().getHours();
  $('#hello').textContent = `${hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'}, ${u.name.split(' ')[0]}`;

  const [appsR, favR, notesR, enqR, recoR, convR] = await Promise.allSettled([PawPalAPI.get('/applications/mine'), PawPalAPI.get('/favourites'),
    PawPalAPI.get('/notifications', { limit: 6 }), PawPalAPI.get('/enquiries/mine'), PawPalAPI.get('/ai/recommendations', { limit: 4 }), PawPalAPI.get('/ai/conversations')]);
  const val = (r, fallback) => (r.status === 'fulfilled' ? r.value : fallback);
  const apps = val(appsR, { applications: [], flow: [] });
  const open = apps.applications.filter((a) => !['Adopted', 'Declined', 'Withdrawn'].includes(a.status));
  const favs = val(favR, { pets: [] }).pets;
  const notes = val(notesR, { notifications: [], unread: 0 });
  const enqs = val(enqR, { enquiries: [] }).enquiries;

  // Nudges: things that need the adopter's attention
  const nudges = [];
  open.filter((a) => a.status === 'Info Requested').forEach((a) => nudges.push(`<div class="alert alert-warn">${icons.help}<div><b>The shelter needs more information about your application for ${esc(a.petName)}.</b> <a href="my-applications.html?id=${encodeURIComponent(a.id)}">Reply now</a></div></div>`));
  open.filter((a) => a.appointmentAt && new Date(a.appointmentAt) > new Date()).forEach((a) => nudges.push(`<div class="alert alert-info">${icons.calendar}<div><b>${esc(a.status)} for ${esc(a.petName)}:</b> ${esc(fmtDateTime(a.appointmentAt))}. <a href="my-applications.html?id=${encodeURIComponent(a.id)}">Details</a></div></div>`));
  const cfg = await PawPalAPI.get('/config').catch(() => ({}));
  if (!u.phoneVerified && cfg.smsMode !== 'disabled') nudges.push(`<div class="alert">${icons.smartphone}<div>Verify your mobile number so shelters can reach you quickly. <a href="profile.html#phone">Verify now</a></div></div>`);
  $('#nudges').innerHTML = nudges.join('');

  $('#kpis').innerHTML = [
    ['my-applications.html', 'file', open.length, 'Active applications'],
    ['#favourites', 'heart', favs.length, 'Saved favourites'],
    ['notifications.html', 'bell', notes.unread, 'Unread notifications'],
    ['#enquiries', 'message', enqs.filter((e) => e.status === 'Answered').length, 'Shelter replies'],
  ].map(([href, ic, n, label]) => `<a class="kpi" href="${href}"><div class="k-top"><span class="k-ic">${icons[ic]}</span></div><b>${n}</b><span>${label}</span></a>`).join('');

  // Applications with progress
  const flow = apps.flow;
  $('#apps').innerHTML = appsR.status === 'rejected' ? `<div class="card-body">${errorHTML('Could not load your applications.')}</div>`
    : open.length ? open.map((a) => {
      const idx = a.status === 'Info Requested' ? 1 : flow.indexOf(a.status);
      return `<a class="list-row" href="my-applications.html?id=${encodeURIComponent(a.id)}">
        <img src="${esc(PawPal.sized(a.petPhoto || PawPal.PLACEHOLDER, 200))}" alt="" data-fallback="${PawPal.PLACEHOLDER}">
        <div class="grow"><div class="row-between" style="flex-wrap:nowrap"><b>${esc(a.petName)}</b>${statusBadge(a.status)}</div>
          <span class="sub">${esc(a.statusInfo || '')}</span>
          <div class="progress-steps" style="margin-top:8px" aria-label="Step ${idx + 1} of ${flow.length}">${flow.map((_, i) => `<i class="${i < idx ? 'on' : i === idx ? 'cur' : ''}"></i>`).join('')}</div></div></a>`;
    }).join('')
      : `<div class="card-body">${emptyHTML({ icon: 'file', title: 'No active applications', text: 'When you find a pet you love, apply from their profile and track every step here.', action: '<a class="btn btn-primary" href="adopt.html">Find a pet</a>' })}</div>`;

  $('#notes').innerHTML = notes.notifications.length ? `<div>${notes.notifications.map(noteHTML).join('')}</div>` : '<div class="card-body muted">No activity yet.</div>';

  // Recommendations
  const reco = val(recoR, { hasProfile: false, matches: [] });
  if (!reco.hasProfile) {
    $('#reco').innerHTML = `<div style="grid-column:1/-1">${emptyHTML({ icon: 'heart', title: 'Tell PawPal about your lifestyle', text: 'Describe your home and routine and we\'ll recommend pets here — and notify you when a new strong match arrives.', action: '<a class="btn btn-primary" href="ai-matching.html">Find my match</a>' })}</div>`;
  } else {
    $('#recoUnderstood').innerHTML = reco.understood.map((x) => `<span class="badge badge-honey">${esc(x)}</span>`).join('');
    $('#reco').innerHTML = reco.matches.length ? reco.matches.map((m) => petCardHTML(m.pet, { match: m.score, reason: m.reasons[0] })).join('')
      : `<div style="grid-column:1/-1">${emptyHTML({ title: 'No pets match right now', text: 'We\'ll notify you as soon as a new pet fits your lifestyle.' })}</div>`;
  }

  // Favourites (kept in sync when hearts are toggled)
  const renderFavs = (list) => {
    $('#favCount').textContent = list.length ? `${list.length} saved` : '';
    $('#favs').innerHTML = list.length ? list.map((p) => petCardHTML(p)).join('')
      : `<div style="grid-column:1/-1">${emptyHTML({ icon: 'heart', title: 'No favourites yet', text: 'Tap the heart on any pet to save them here. We\'ll let you know if they\'re adopted.', action: '<a class="btn" href="adopt.html">Browse pets</a>' })}</div>`;
  };
  let favList = favs;
  renderFavs(favList);
  document.addEventListener('pawpal:fav', async (e) => {
    if (!e.detail.on) favList = favList.filter((p) => p.id !== e.detail.id);
    else { try { favList = (await PawPalAPI.get('/favourites')).pets; } catch { /* ignore */ } }
    renderFavs(favList);
  });

  $('#enqs').innerHTML = enqs.length ? enqs.map((e) => `<div class="list-row" style="align-items:flex-start">
      <span class="thumb" style="display:grid;place-items:center;color:var(--muted)">${icons.message}</span>
      <div class="grow"><div class="row-between"><b>${esc(e.petName)}</b><span class="badge ${e.status === 'Answered' ? 'badge-sage' : ''}">${esc(e.status)}</span></div>
        <p class="small" style="margin-top:4px">${esc(e.message)}</p>
        ${e.reply ? `<div class="thread-msg staff" style="margin-top:8px"><div class="who">Shelter reply<span>${esc(timeAgo(e.repliedAt))}</span></div><p>${esc(e.reply)}</p></div>` : `<span class="sub">Asked ${esc(timeAgo(e.at))} · awaiting reply</span>`}
        <a class="small" href="pet-profile.html?id=${encodeURIComponent(e.petId)}">View ${esc(e.petName)}</a></div></div>`).join('')
    : `<div class="card-body muted small">You haven't asked a shelter anything yet. Use "Ask the shelter" on any pet's profile.</div>`;

  const convs = val(convR, { conversations: [] }).conversations;
  $('#convs').innerHTML = convs.length ? convs.slice(0, 6).map((c) => `<button class="list-row" data-conv="${esc(c.id)}" style="width:100%;border:0;background:none;text-align:left">
      <span class="thumb" style="display:grid;place-items:center;color:var(--honey-ink);background:var(--honey-soft)">${icons.paw}</span>
      <div class="grow"><b>${esc(c.title)}</b><span class="sub">${c.count} messages · ${esc(timeAgo(c.updatedAt))}</span></div>${icons.chevronRight}</button>`).join('')
    : '<div class="card-body muted small">Chats with the PawPal assistant are saved here so you can pick up where you left off.</div>';
  $('#convs').addEventListener('click', (e) => { const b = e.target.closest('[data-conv]'); if (b) PawPalChat.openConversation(b.dataset.conv); });
  if (location.hash) document.querySelector(location.hash)?.scrollIntoView();
})();
