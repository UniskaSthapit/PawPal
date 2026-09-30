// Adopter applications: list + detail with the adoption timeline, appointment (with calendar file),
// required actions, message thread with the shelter, answers summary and withdraw.
(async () => {
  const { $, $$, esc, icons, statusBadge, fmtDate, fmtDateTime, timeAgo, emptyHTML, errorHTML, setBusy, toast, confirm, params } = PawPal;
  await PawPal.booted;
  let apps = []; let flow = []; let info = {};
  let selected = params.get('id');

  const STEP_ICON = { Submitted: 'send', 'Under Review': 'eye', 'Info Requested': 'help', Interview: 'phone', 'Meet & Greet': 'handshake',
    Approved: 'checkCircle', 'Adoption Scheduled': 'calendar', Adopted: 'home', Declined: 'x', Withdrawn: 'x' };
  const CLOSED = ['Adopted', 'Declined', 'Withdrawn'];

  async function load() {
    try {
      const res = await PawPalAPI.get('/applications/mine');
      apps = res.applications; flow = res.flow; info = res.info;
    } catch (err) { $('#appList').innerHTML = errorHTML(err.message); return; }
    if (!apps.length) {
      $('#appsLayout').innerHTML = `<div style="grid-column:1/-1">${emptyHTML({ icon: 'file', title: 'No applications yet', text: 'Find a pet you love and press "Apply to adopt" on their profile. You\'ll be able to follow every step here.', action: '<div class="row" style="justify-content:center"><a class="btn btn-primary" href="ai-matching.html">Find my PawPal</a><a class="btn" href="adopt.html">Browse pets</a></div>' })}</div>`;
      return;
    }
    if (!selected || !apps.some((a) => a.id === selected)) selected = apps[0].id;
    renderList(); renderDetail();
  }

  function renderList() {
    $('#appList').innerHTML = apps.map((a) => `<button class="app-item" role="listitem" data-app="${esc(a.id)}" aria-current="${a.id === selected}">
      <img src="${esc(PawPal.sized(a.petPhoto || PawPal.PLACEHOLDER, 200))}" alt="" data-fallback="${PawPal.PLACEHOLDER}">
      <div><b>${esc(a.petName)}</b><div class="row" style="gap:6px;margin-top:4px">${statusBadge(a.status)}<span class="tiny muted">${esc(timeAgo(a.updatedAt))}</span></div></div></button>`).join('');
  }

  // Build timeline: completed history + current + upcoming steps
  function timelineHTML(a) {
    const hist = a.history;
    const lastByStatus = {};
    hist.forEach((h) => { lastByStatus[h.status] = h; });
    const closed = CLOSED.includes(a.status);
    let steps;
    if (closed && a.status !== 'Adopted') {
      steps = hist.map((h, i) => ({ status: h.status, state: i === hist.length - 1 ? 'bad' : 'done', h }));
    } else {
      const curIdx = a.status === 'Info Requested' ? flow.indexOf('Under Review') : flow.indexOf(a.status);
      steps = flow.map((s, i) => ({ status: s, state: i < curIdx ? 'done' : i === curIdx ? (a.status === 'Adopted' ? 'done' : 'current') : 'todo', h: lastByStatus[s] }));
      if (a.status === 'Info Requested') steps.splice(curIdx + 1, 0, { status: 'Info Requested', state: 'warn', h: lastByStatus['Info Requested'] });
    }
    return `<ol class="timeline">${steps.map((s) => `<li class="tl-item ${s.state}">
      <span class="tl-dot">${s.state === 'done' ? icons.check : icons[STEP_ICON[s.status]] || icons.info}</span>
      <div class="tl-content"><h4>${esc(s.status)}</h4>
        ${s.h ? `<div class="when">${esc(fmtDateTime(s.h.at))}</div>` : s.state === 'todo' ? '<div class="when">Upcoming</div>' : ''}
        ${s.state === 'current' || s.state === 'warn' || s.state === 'bad' ? `<p>${esc(info[s.status] || '')}</p>` : ''}
        ${s.h?.note ? `<div class="tl-note"><b>Shelter:</b> ${esc(s.h.note)}</div>` : ''}</div></li>`).join('')}</ol>`;
  }

  // Downloadable calendar entry for the appointment
  function icsHref(a) {
    const start = new Date(a.appointmentAt); const end = new Date(start.getTime() + 60 * 60 * 1000);
    const f = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//PawPal//Adoption//EN', 'BEGIN:VEVENT', `UID:${a.id}-${f(start)}@pawpal`, `DTSTAMP:${f(new Date())}`,
      `DTSTART:${f(start)}`, `DTEND:${f(end)}`, `SUMMARY:PawPal ${a.status}: ${a.petName}`, `DESCRIPTION:${a.status} for your adoption application for ${a.petName}.`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    return `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
  }

  function renderDetail() {
    const a = apps.find((x) => x.id === selected);
    const closed = CLOSED.includes(a.status);
    const ans = a.answers || {};
    $('#appDetail').innerHTML = `<div class="stack page-fade" style="--stack:20px">
      <div class="card card-pad"><div class="detail-hero">
        <img src="${esc(PawPal.sized(a.petPhoto || PawPal.PLACEHOLDER, 300))}" alt="${esc(a.petName)}" data-fallback="${PawPal.PLACEHOLDER}">
        <div><div class="row">${statusBadge(a.status)}<span class="tiny muted">Submitted ${esc(fmtDate(a.submittedAt))}</span></div>
          <h2 class="h2" style="margin-top:8px">${esc(a.petName)}</h2><p class="muted">${esc(a.petBreed || '')}</p>
          <div class="row" style="margin-top:10px"><a class="btn btn-sm" href="pet-profile.html?id=${encodeURIComponent(a.petId)}">View profile</a>
            <button class="btn btn-sm" data-ask="What's the status of my application for ${esc(a.petName)}?">${icons.sparkle}Ask PawPal</button></div></div></div></div>

      ${a.status === 'Info Requested' ? `<div class="card card-pad" style="border-color:#E8C58F;background:#FFFBF3">
        <span class="src-label" style="color:var(--honey-ink)">${icons.alert}Action needed</span>
        <h3 style="font-size:20px;margin-top:6px">The shelter needs more information</h3>
        <p class="small muted" style="margin-top:4px">Reply below. Your application goes straight back into review once you send it.</p>
        <form id="replyForm" style="margin-top:12px"><label class="sr-only" for="replyText">Your reply</label><textarea class="textarea" id="replyText" maxlength="2000" placeholder="Type your reply to the shelter…" required></textarea>
          <button class="btn btn-primary" style="margin-top:10px" type="submit">${icons.send}Send reply</button></form></div>` : ''}

      ${a.appointmentAt && !closed && new Date(a.appointmentAt) > new Date(Date.now() - 86400000) ? `<div class="card card-pad" style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
        <span class="k-ic" style="width:52px;height:52px;border-radius:14px;display:grid;place-items:center;background:var(--sky-soft);color:var(--sky)">${icons.calendar}</span>
        <div style="flex:1;min-width:200px"><span class="small muted">${esc(a.status)}</span><h3 style="font-size:21px">${esc(fmtDateTime(a.appointmentAt))}</h3>
          <p class="small muted">Bring photo ID${a.status === 'Meet & Greet' ? ' and, if you rent, your landlord\'s pet approval' : ''}.</p></div>
        <a class="btn btn-sm" href="${icsHref(a)}" download="pawpal-${esc(a.status.replace(/\W+/g, '-').toLowerCase())}.ics">${icons.download}Add to calendar</a></div>` : ''}

      <div class="card"><div class="card-head"><h3>Adoption timeline</h3>${a.status === 'Adopted' ? '<span class="badge badge-sage">Complete</span>' : ''}</div>
        <div class="card-body">${timelineHTML(a)}</div></div>

      <div class="card"><div class="card-head"><h3>Messages with the shelter</h3></div>
        <div class="card-body"><div class="msg-thread">${a.messages.length ? a.messages.map((m) => `<div class="thread-msg ${m.from === 'staff' ? 'staff' : ''}"><div class="who">${esc(m.from === 'staff' ? 'Shelter team' : 'You')}<span>${esc(timeAgo(m.at))}</span></div><p>${esc(m.text)}</p></div>`).join('')
          : '<p class="muted small">No messages yet. The shelter will message you here if they have questions.</p>'}</div>
        ${closed ? '' : `<form id="msgForm" style="margin-top:14px;display:grid;grid-template-columns:1fr auto;gap:8px"><label class="sr-only" for="msgText">Message the shelter</label>
          <input class="input" id="msgText" maxlength="2000" placeholder="Write a message to the shelter…"><button class="btn btn-dark" type="submit" aria-label="Send message">${icons.send}</button></form>`}</div></div>

      <details class="card"><summary class="card-head" style="cursor:pointer;border:0"><h3>Your answers</h3>${icons.chevron}</summary>
        <div class="card-body"><dl class="kv">
          <dt>Home</dt><dd>${esc(ans.livingType || '—')}${ans.ownership ? ` · ${esc(ans.ownership)}` : ''}</dd>
          <dt>Activity</dt><dd>${esc(['', 'Relaxed', 'Moderately active', 'Very active'][ans.activityLevel] || '—')}</dd>
          <dt>Pet alone</dt><dd>${ans.hoursAlone === '' ? '—' : `${esc(ans.hoursAlone)} hours a day`}</dd>
          <dt>Children</dt><dd>${ans.hasChildren ? 'Yes' : 'No'}</dd><dt>Other pets</dt><dd>${ans.hasOtherPets ? 'Yes' : 'No'}</dd>
          <dt>Experience</dt><dd>${esc(ans.experience || '—')}</dd><dt>Why</dt><dd style="font-weight:500">${esc(ans.motivation || '—')}</dd></dl></div></details>

      ${closed ? '' : `<div><button class="btn btn-ghost" id="withdrawBtn" style="color:var(--danger)">${icons.x}Withdraw application</button></div>`}
    </div>`;
    PawPal.hydrateIcons($('#appDetail'));
  }

  document.addEventListener('click', async (e) => {
    const item = e.target.closest('[data-app]');
    if (item) {
      selected = item.dataset.app;
      history.replaceState(null, '', `my-applications.html?id=${encodeURIComponent(selected)}`);
      renderList(); renderDetail();
      if (window.innerWidth < 1000) $('#appDetail').scrollIntoView({ behavior: 'smooth' });
    }
    if (e.target.closest('#withdrawBtn')) {
      const a = apps.find((x) => x.id === selected);
      if (!(await confirm({ title: `Withdraw your application for ${a.petName}?`, message: 'The shelter will be told you are no longer interested. You can apply again later if they are still available.', confirmText: 'Withdraw', danger: true }))) return;
      try { await PawPalAPI.post(`/applications/${encodeURIComponent(a.id)}/withdraw`); toast('Application withdrawn'); load(); } catch (err) { toast(err.message, 'error'); }
    }
  });
  document.addEventListener('submit', async (e) => {
    const form = e.target;
    if (!['replyForm', 'msgForm'].includes(form.id)) return;
    e.preventDefault();
    const input = form.id === 'replyForm' ? $('#replyText') : $('#msgText');
    const text = input.value.trim();
    if (text.length < 2) return input.focus();
    const btn = form.querySelector('button'); setBusy(btn, true, 'Sending…');
    try {
      const r = await PawPalAPI.post(`/applications/${encodeURIComponent(selected)}/messages`, { text });
      toast(r.message);
      const i = apps.findIndex((x) => x.id === selected); apps[i] = r.application;
      renderList(); renderDetail();
    } catch (err) { setBusy(btn, false); toast(err.message, 'error'); }
  });
  load();
})();
