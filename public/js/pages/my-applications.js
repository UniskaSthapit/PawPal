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

      ${a.payment ? (a.payment.status === 'paid' ? `<div class="card card-pad fee-card fee-paid" id="feeCard"><span class="src-label">${icons.checkCircle}Adoption fee paid</span>
        <p class="small" style="margin-top:6px">Thank you — the $${esc(a.payment.amount)} adoption fee for ${esc(a.petName)} is paid.</p>
        <a class="btn btn-sm" style="margin-top:10px" href="receipt.html?id=${encodeURIComponent(a.payment.paymentId || '')}">${icons.file}View receipt</a></div>`
        : `<div class="card card-pad fee-card" id="feeCard"><span class="src-label" style="color:var(--honey-ink)">${icons.alert}Adoption fee due: $${esc(a.payment.amount)}</span>
        <p class="small muted" style="margin-top:6px">${a.payment.status === 'pay_in_person' ? 'You chose to pay at the shelter. You can also pay online now.' : 'Pay online (payment simulation — no real money is taken), or choose to pay at the shelter.'}</p>
        <a class="btn btn-primary btn-sm" style="margin-top:10px" id="payFeeBtn" href="checkout.html?app=${encodeURIComponent(a.id)}">${icons.checkCircle}Pay adoption fee</a></div>`) : ''}

      ${a.carePlanReady ? `<div class="card card-pad care-cta" id="carePlanCard"><span class="src-label src-ai">${icons.clipboard}Your first 30 days</span>
        <h3 style="font-size:20px;margin-top:6px">A care plan to help ${esc(a.petName)} settle in</h3>
        <p class="small muted" style="margin-top:4px">What to prepare, the first few days, feeding, exercise, the vet and warning signs — ready to print.</p>
        <a class="btn btn-primary btn-sm" style="margin-top:12px" id="viewCarePlan" href="care-plan.html?id=${encodeURIComponent(a.id)}">${icons.file}View care plan</a></div>`
        : ['Approved', 'Adoption Scheduled', 'Adopted'].includes(a.status) ? `<div class="card card-pad"><span class="src-label src-ai">${icons.clipboard}Your first 30 days</span>
        <p class="small muted" style="margin-top:6px">Your care plan for ${esc(a.petName)} is being prepared — we'll let you know when it's ready.</p></div>` : ''}

      ${a.booking ? `<div class="card card-pad" id="booking"><span class="src-label" style="color:var(--sky)">${icons.calendar}Meet &amp; greet</span>
        ${a.booking.slotId ? `<h3 style="font-size:20px;margin-top:6px">You're booked to meet ${esc(a.petName)}</h3>
          <p class="small muted" style="margin-top:4px">${a.booking.canChange ? 'You can change or cancel this time until 24 hours before.' : 'It\'s less than 24 hours away — message the shelter if you can\'t make it.'}</p>
          ${a.booking.canChange ? `<div class="row" style="margin-top:12px"><button class="btn btn-sm" type="button" data-booking="change">${icons.edit}Change time</button>
            <button class="btn btn-sm btn-ghost" type="button" data-booking="cancel" style="color:var(--danger)">${icons.x}Cancel</button></div>` : ''}`
          : `<h3 style="font-size:20px;margin-top:6px">Choose a time to meet ${esc(a.petName)}</h3>
          ${a.booking.message ? `<div class="tl-note" style="margin-top:8px"><b>Shelter:</b> ${esc(a.booking.message)}</div>` : ''}`}
        <div id="slotPicker" style="margin-top:14px" ${a.booking.slotId ? 'hidden' : ''}></div></div>` : ''}

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
    if (a.booking && !a.booking.slotId) loadSlots(a);
    if (location.hash === '#booking' && $('#booking')) setTimeout(() => $('#booking').scrollIntoView({ block: 'start', behavior: 'smooth' }), 150);
  }

  // ---------- meet & greet booking ----------
  async function loadSlots(a) {
    const box = $('#slotPicker'); box.hidden = false;
    box.innerHTML = '<div class="skeleton" style="height:90px"></div>';
    let slots;
    try { ({ slots } = await PawPalAPI.get(`/applications/${encodeURIComponent(a.id)}/slots`)); } catch (err) { box.innerHTML = errorHTML(err.message); return; }
    if (!slots.length) { box.innerHTML = '<p class="small muted">There are no free times right now — the shelter will add more soon, or you can message them below.</p>'; return; }
    const days = new Map();
    slots.forEach((sl) => { const k = new Date(sl.start).toDateString(); if (!days.has(k)) days.set(k, []); days.get(k).push(sl); });
    box.innerHTML = `<div class="slot-picker" role="group" aria-label="Free meet and greet times">${[...days].map(([, list]) => `<div><h4>${esc(new Date(list[0].start).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' }))}</h4>
      <div class="slot-choices">${list.map((sl) => `<button type="button" class="slot-choice" data-slot="${esc(sl.id)}" data-start="${esc(sl.start)}" aria-pressed="false">${esc(new Date(sl.start).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' }))}</button>`).join('')}</div></div>`).join('')}</div>
      <div class="row" style="margin-top:14px"><button class="btn btn-primary" type="button" id="bookBtn" disabled>Choose a time above</button>
        ${a.booking.slotId ? '<button class="btn btn-ghost" type="button" data-booking="keep">Keep my current time</button>' : ''}</div>`;
  }
  $('#appDetail').addEventListener('click', async (e) => {
    const choice = e.target.closest('.slot-choice[data-slot]');
    if (choice) {
      $$('#slotPicker [data-slot]').forEach((b) => b.setAttribute('aria-pressed', String(b === choice)));
      const btn = $('#bookBtn'); btn.disabled = false; btn.dataset.slot = choice.dataset.slot;
      btn.textContent = `Book ${new Date(choice.dataset.start).toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}`;
      return;
    }
    const a = apps.find((x) => x.id === selected);
    if (e.target.closest('#bookBtn')) {
      const btn = $('#bookBtn'); setBusy(btn, true, 'Booking…');
      try {
        const r = await PawPalAPI.post(`/applications/${encodeURIComponent(a.id)}/book`, { slotId: btn.dataset.slot });
        toast(r.message); apps[apps.findIndex((x) => x.id === a.id)] = r.application; renderList(); renderDetail();
      } catch (err) { setBusy(btn, false); toast(err.message, 'error'); if (err.status === 409) loadSlots(a); }
      return;
    }
    const action = e.target.closest('[data-booking]')?.dataset.booking;
    if (action === 'change') loadSlots(a);
    if (action === 'keep') { $('#slotPicker').hidden = true; }
    if (action === 'cancel') {
      if (!(await confirm({ title: 'Cancel your meet & greet?', message: `The time will be freed for someone else. Your application for ${a.petName} stays open and you can book another time.`, confirmText: 'Cancel meet & greet', danger: true }))) return;
      try { const r = await PawPalAPI.post(`/applications/${encodeURIComponent(a.id)}/cancel-booking`); toast(r.message, 'info'); apps[apps.findIndex((x) => x.id === a.id)] = r.application; renderList(); renderDetail(); }
      catch (err) { toast(err.message, 'error'); }
    }
  });

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
