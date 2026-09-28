// Adopter portal — live application status with the FR-09 progress tracker.
(async () => {
  const { $, esc, fmtDate, fmtDateTime, timeAgo, photo, PLACEHOLDER, icons, confirm, toast } = PawPal;
  const STEPS = ['Pending', 'Shortlisted', 'Visit Scheduled', 'Approved', 'Adopted'];
  const STATUS_COLOR = { Pending: '#E8A33D', Shortlisted: '#F4C542', 'Visit Scheduled': '#9DAF94', Approved: '#5D9B6A', Adopted: '#C85A3E', Rejected: '#B3261E', Withdrawn: '#9C8F84' };
  const user = await PawPal.ready;
  if (user) $('#greeting').textContent = `🐾 Hi ${user.name.split(' ')[0]} — here's where each of your adoption journeys is up to.`;

  function tracker(app) {
    const closed = ['Rejected', 'Withdrawn'].includes(app.status);
    const reached = closed ? Math.max(...app.history.map((h) => STEPS.indexOf(h.status))) : STEPS.indexOf(app.status);
    return `<div class="progress-tracker ${closed ? 'is-closed' : ''}">${STEPS.map((s, i) => {
      const cls = i < reached || (i === reached && (app.status === 'Adopted' || closed)) ? 'completed' : i === reached ? 'current' : 'future';
      const circle = cls === 'completed' ? `<div class="step-circle completed">${icons.check}</div>`
        : cls === 'current' ? '<div class="step-circle current"><div class="step-pulse"></div><div class="step-dot"></div></div>' : '<div class="step-circle future"></div>';
      const line = i < STEPS.length - 1 ? `<div class="step-line ${i < reached ? 'done' : 'pending'}"></div>` : '';
      return `<div class="progress-step">${circle}<span class="step-label">${s}</span></div>${line}`;
    }).join('')}</div>`;
  }

  function message(app) {
    const last = app.history[app.history.length - 1];
    const note = last?.note ? `<span class="app-note-quote">“${esc(last.note)}”</span>` : '';
    return {
      Pending: 'The shelter team will review your application within 2–3 business days.',
      Shortlisted: "Great news — you've been shortlisted! The team will contact you to arrange a visit.",
      'Visit Scheduled': `Your visit is booked for <b>${esc(fmtDateTime(app.visitAt))}</b>. Please bring photo ID.`,
      Approved: 'Your application is approved! The team will be in touch to finalise the adoption.',
      Adopted: `Congratulations — ${esc(app.petName)} is officially yours! <a href="vet-finder.html">Find a nearby vet</a> for a first check-up.`,
      Rejected: `This application is closed. ${note || 'There are lots of other pets waiting —'} <a href="ai-matching.html">find your next match</a>.`,
      Withdrawn: 'You withdrew this application.',
    }[app.status] + (app.status !== 'Rejected' && note ? ` ${note}` : '');
  }

  async function load() {
    try {
      const { applications } = await PawPalAPI.get('/applications/mine');
      $('#statTotal').textContent = applications.length;
      $('#statApproved').textContent = applications.filter((a) => ['Approved', 'Adopted'].includes(a.status)).length;
      $('#statProgress').textContent = applications.filter((a) => ['Pending', 'Shortlisted', 'Visit Scheduled'].includes(a.status)).length;
      $('#appCards').innerHTML = applications.length ? applications.map((a) => `<article class="app-card">
          <div class="app-card-top">
            <div class="app-card-pet">
              <img class="app-card-img" src="${esc(photo(a))}" alt="${esc(a.petName)}" onerror="this.onerror=null;this.src='${PLACEHOLDER}'"/>
              <div><a class="app-card-name" href="pet-profile.html?id=${encodeURIComponent(a.petId)}">${esc(a.petName)}</a><div class="app-card-breed">${esc(a.petBreed)}</div></div>
            </div>
            <span class="app-card-status" style="background:${STATUS_COLOR[a.status]}">${esc(a.status)}</span>
          </div>
          <p class="app-card-date">Submitted ${fmtDate(a.submittedAt)} · Last update ${timeAgo(a.updatedAt)}</p>
          ${tracker(a)}
          <div class="app-card-msg">${message(a)}</div>
          ${['Pending', 'Shortlisted', 'Visit Scheduled'].includes(a.status) ? `<div class="app-card-actions"><button class="pp-link-btn app-withdraw" data-withdraw="${esc(a.id)}" data-pet="${esc(a.petName)}">Withdraw application</button></div>` : ''}
        </article>`).join('')
        : `<div class="pp-empty pp-card"><div class="pp-empty-emoji">🐶</div><h3>No applications yet</h3>
            <p>When you apply to adopt a pet, you'll be able to follow every step here.</p>
            <a class="pp-btn pp-btn-primary" href="home.html#pets">Browse pets</a> <a class="pp-btn pp-btn-ghost" href="ai-matching.html">Take the AI quiz</a></div>`;
    } catch (err) {
      $('#appCards').innerHTML = `<div class="pp-alert pp-alert-error">${esc(err.message)}</div>`;
    }
  }

  async function loadUpdates() {
    try {
      const { notifications } = await PawPalAPI.get('/notifications');
      $('#updatesList').innerHTML = notifications.length ? notifications.slice(0, 8).map((n) => `<a class="update-item ${n.read ? '' : 'unread'}" href="${esc(n.link || '#')}">
          <b>${esc(n.title)}</b><span>${esc(n.message)}</span><small>${timeAgo(n.at)}</small></a>`).join('')
        : '<p class="pp-muted">No updates yet.</p>';
    } catch { $('#updatesList').innerHTML = '<p class="pp-muted">Updates could not load.</p>'; }
  }

  $('#appCards').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-withdraw]');
    if (!b) return;
    const ok = await confirm({ title: 'Withdraw application?', message: `Your application for ${b.dataset.pet} will be closed. You can apply again later if they're still available.`, confirmText: 'Withdraw', danger: true });
    if (!ok) return;
    try { await PawPalAPI.post(`/applications/${b.dataset.withdraw}/withdraw`); toast('Application withdrawn'); load(); }
    catch (err) { toast(err.message, 'error'); }
  });
  $('#markRead').addEventListener('click', async () => { await PawPalAPI.post('/notifications/read-all').catch(() => {}); loadUpdates(); PawPal.loadBell(); });

  load();
  loadUpdates();
})();
