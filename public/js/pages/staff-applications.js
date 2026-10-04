// Staff applications: pipeline tabs, search/sort/filter, detail with AI summary, status workflow
// (with appointment scheduling and a message to the adopter), message thread and private notes.
(async () => {
  const { $, $$, esc, icons, statusBadge, scoreBadge, fmtDate, fmtDateTime, timeAgo, toast, setBusy, errorHTML, emptyHTML, modal, params } = PawPal;
  await PawPal.booted;
  const FLOW_NEXT = { Submitted: ['Under Review', 'Info Requested', 'Declined'], 'Under Review': ['Interview', 'Meet & Greet', 'Info Requested', 'Approved', 'Declined'],
    'Info Requested': ['Under Review', 'Declined'], Interview: ['Meet & Greet', 'Approved', 'Info Requested', 'Declined'], 'Meet & Greet': ['Approved', 'Meet & Greet', 'Declined'],
    Approved: ['Adoption Scheduled', 'Adopted', 'Declined'], 'Adoption Scheduled': ['Adopted', 'Adoption Scheduled', 'Declined'] };
  const NEEDS_DATE = ['Interview', 'Meet & Greet', 'Adoption Scheduled'];
  const TEMPLATES = { 'Info Requested': 'Could you please send us ', Declined: 'Thank you for applying. ', Approved: 'Congratulations! ', 'Meet & Greet': 'We\'d love you to come and meet ', Interview: 'We\'d like a quick 15-minute phone chat. ' };
  let apps = []; let counts = {}; let statuses = [];
  let tab = params.get('status') || 'open'; let selected = params.get('id');

  async function load() {
    try {
      const res = await PawPalAPI.get('/applications', { status: tab === 'all' ? '' : tab, q: $('#appQ').value.trim(), petId: $('#appPet').value, sort: $('#appSort').value });
      apps = res.applications; counts = res.counts; statuses = res.statuses;
      renderTabs(); renderList();
      if (selected) renderDetail(selected);
      else if (apps[0] && window.innerWidth > 1100) renderDetail(apps[0].id);
      else $('#appDetail').innerHTML = '';
    } catch (err) { $('#appList').innerHTML = `<div class="card-body">${errorHTML(err.message)}</div>`; }
  }
  function renderTabs() {
    const open = Object.entries(counts).filter(([s]) => !['Adopted', 'Declined', 'Withdrawn'].includes(s)).reduce((t, [, n]) => t + n, 0);
    const all = Object.values(counts).reduce((t, n) => t + n, 0);
    $('#appTabs').innerHTML = [['open', 'Open', open], ['all', 'All', all], ...statuses.map((s) => [s, s, counts[s] || 0])]
      .map(([k, l, n]) => `<button class="tab" role="tab" data-tab="${esc(k)}" aria-selected="${tab === k}">${esc(l)} <span class="n">${n}</span></button>`).join('');
  }
  function renderList() {
    $('#appList').innerHTML = apps.length ? apps.map((a) => `<button class="app-row" role="listitem" data-app="${esc(a.id)}" aria-current="${a.id === selected}">
      <img src="${esc(PawPal.sized(a.petPhoto || PawPal.PLACEHOLDER, 120))}" alt="" data-fallback="${PawPal.PLACEHOLDER}">
      <div style="min-width:0"><b>${esc(a.name)}</b><span class="small muted">${esc(a.petName)} · ${esc(timeAgo(a.submittedAt))}</span><div style="margin-top:4px">${statusBadge(a.status)}${a.missing?.length >= 2 ? ' <span class="badge badge-honey">Incomplete</span>' : ''}</div></div>
      ${scoreBadge(a.score)}</button>`).join('') : `<div class="card-body">${emptyHTML({ icon: 'inbox', title: 'Nothing here', text: 'No applications match this view.' })}</div>`;
  }

  async function renderDetail(id) {
    selected = id;
    history.replaceState(null, '', `applications.html?${new URLSearchParams({ ...(tab !== 'open' ? { status: tab } : {}), id })}`);
    $$('.app-row').forEach((r) => r.setAttribute('aria-current', String(r.dataset.app === id)));
    $('#appDetail').innerHTML = '<div class="skeleton" style="height:420px;border-radius:20px"></div>';
    let res;
    try { res = await PawPalAPI.get(`/applications/${encodeURIComponent(id)}`); } catch (err) { $('#appDetail').innerHTML = errorHTML(err.message); return; }
    const a = res.application;
    const closed = ['Adopted', 'Declined', 'Withdrawn'].includes(a.status);
    const next = FLOW_NEXT[a.status] || [];
    const yn = (v) => (v === true ? 'Yes' : v === false ? 'No' : '—');
    $('#appDetail').innerHTML = `<div class="stack page-fade" style="--stack:16px">
      <div class="card card-pad"><div class="row-between" style="align-items:flex-start;flex-wrap:nowrap;gap:16px">
        <div style="min-width:0"><div class="row">${statusBadge(a.status)}<span class="small muted">#${res.rank} of ${res.totalForPet} for ${esc(a.petName)}</span></div>
          <h2 class="h2" style="margin-top:8px">${esc(a.name)}</h2>
          <p class="small muted">Applied for <a href="add-pet.html?id=${encodeURIComponent(a.petId)}">${esc(a.petName)}</a> · ${esc(fmtDate(a.submittedAt))}</p>
          <p class="small" style="margin-top:6px">${icons.mail} <a href="mailto:${esc(a.email)}">${esc(a.email)}</a>${a.phone ? ` · ${icons.phone} <a href="tel:${esc(a.phone)}">${esc(a.phone)}</a>` : ''}</p></div>
        <div class="center"><div class="score-ring" style="--p:${a.score}"><span>${a.score}</span></div><div class="tiny muted" style="margin-top:4px">${esc(a.label)}</div></div></div>
        ${a.appointmentAt && !closed ? `<div class="alert alert-info" style="margin-top:14px">${icons.calendar}<div><b>${esc(a.status)}:</b> ${esc(fmtDateTime(a.appointmentAt))}</div></div>` : ''}
        ${a.missing?.length ? `<div class="alert alert-warn" style="margin-top:10px">${icons.info}<div>Missing: ${esc(a.missing.join(', '))}</div></div>` : ''}</div>

      <div class="card"><div class="card-head"><div><span class="src-label src-ai">${icons.sparkle}AI summary</span><h3>Summary for review</h3></div><button class="btn btn-sm" id="sumBtn">${icons.sparkle}Summarise</button></div>
        <div class="card-body" id="sumBody"><p class="small muted">Get a concise summary of this application and what to check at interview. The applicant's own answers are used — never your private notes.</p></div></div>

      ${['Submitted', 'Under Review', 'Info Requested', 'Interview', 'Meet & Greet'].includes(a.status) ? `<div class="card" id="bookingCard"><div class="card-head"><h3>Meet &amp; greet booking</h3><a class="small" href="availability.html">Availability</a></div><div class="card-body stack" style="--stack:10px">
        ${a.slotId ? `<p>${icons.calendar} <b>Booked by ${esc(a.name.split(' ')[0])}</b> for ${esc(fmtDateTime(a.appointmentAt))}. They can change it until 24 hours before.</p>`
          : a.bookingInvite ? `<p class="small">Invited ${esc(timeAgo(a.bookingInvite.at))} by ${esc(a.bookingInvite.by)} — waiting for ${esc(a.name.split(' ')[0])} to choose a time.</p>`
          : `<p class="small muted">Let ${esc(a.name.split(' ')[0])} pick from your free times instead of arranging a time by message.</p>`}
        ${a.slotId ? '' : `<div><button class="btn ${a.bookingInvite ? '' : 'btn-primary'}" type="button" id="inviteBtn">${icons.calendar}${a.bookingInvite ? 'Send the invite again' : 'Invite to book a meet & greet'}</button></div>`}
      </div></div>` : ''}

      ${a.status === 'Adopted' && a.feeDue > 0 ? `<div class="card" id="payCard"><div class="card-head"><div><span class="src-label src-shelter">${icons.checkCircle}Simulated payment</span><h3>Adoption fee</h3></div>
        <b>$${esc(a.feeDue)}</b></div><div class="card-body stack" style="--stack:10px">
        ${a.paymentStatus === 'paid' ? `<p class="small"><span class="badge badge-sage">Paid</span> <a href="receipt.html?id=${encodeURIComponent(a.paymentId || '')}">View receipt</a></p>`
          : `<p class="small">${a.paymentStatus === 'pay_in_person' ? `<span class="badge badge-honey">Paying at the shelter</span> ${esc(a.name.split(' ')[0])} will pay in person.` : '<span class="badge badge-honey">Due</span> Not paid yet.'}</p>
        <div><button class="btn btn-sm" type="button" id="recordPayBtn">${icons.checkCircle}Record payment taken at the shelter</button></div>`}
      </div></div>` : ''}

      ${['Approved', 'Adoption Scheduled', 'Adopted'].includes(a.status) ? `<div class="card" id="careCard"><div class="card-head"><div><span class="src-label src-ai">${icons.clipboard}First 30 days</span><h3>Care plan</h3></div>
        ${a.carePlan ? `<a class="btn btn-sm" id="viewCare" href="care-plan.html?id=${encodeURIComponent(a.id)}">${icons.file}View</a>` : ''}</div>
        <div class="card-body stack" style="--stack:10px">
        ${a.carePlan ? `<p class="small">Prepared ${esc(timeAgo(a.carePlan.generatedAt))} (${esc(PawPal.aiLabel(a.carePlan.source, 'care templates'))}) and shared with ${esc(a.name.split(' ')[0])}.</p>`
          : `<p class="small muted">The care plan is being prepared for ${esc(a.name.split(' ')[0])}. If it doesn't appear, create it now.</p>`}
        <div><button class="btn btn-sm" type="button" id="careBtn">${icons.refresh}${a.carePlan ? 'Regenerate' : 'Create care plan'}</button></div>
      </div></div>` : ''}

      ${closed ? '' : `<form class="card" id="statusForm"><div class="card-head"><h3>Update status</h3></div><div class="card-body stack" style="--stack:12px">
        <div class="field"><label for="newStatus">Move to</label><select class="select" id="newStatus">${next.map((s) => `<option>${esc(s)}</option>`).join('')}<option disabled>──────────</option>${statuses.filter((s) => !next.includes(s) && s !== a.status && s !== 'Withdrawn').map((s) => `<option>${esc(s)}</option>`).join('')}</select></div>
        <div class="field" id="dateField" hidden><label for="apptAt">Appointment date &amp; time</label><input class="input" type="datetime-local" id="apptAt"></div>
        <div class="field"><label for="statusMsg">Message to ${esc(a.name.split(' ')[0])} <span class="muted small" id="msgHint">(optional — included in their email)</span></label><textarea class="textarea" id="statusMsg" maxlength="1000" style="min-height:90px"></textarea></div>
        <button class="btn btn-primary" type="submit" id="statusBtn">Update &amp; notify applicant</button></div></form>`}

      <div class="card"><div class="card-head"><h3>Answers</h3><span class="small muted">Score breakdown on the right</span></div><div class="card-body grid" style="grid-template-columns:minmax(0,1.2fr) minmax(0,1fr)">
        <dl class="kv"><dt>Home</dt><dd>${esc(a.livingType)}${a.ownership ? ` · ${esc(a.ownership)}` : ''}</dd>${a.ownership === 'Rent' ? `<dt>Landlord OK</dt><dd>${yn(a.landlordPermission)}</dd>` : ''}
          <dt>Adults</dt><dd>${esc(a.householdAdults || '—')}</dd><dt>Children</dt><dd>${yn(a.hasChildren)}${a.childrenAges ? ` (${esc(a.childrenAges)})` : ''}</dd>
          <dt>Other pets</dt><dd>${yn(a.hasOtherPets)}${a.otherPetsDetails ? ` — ${esc(a.otherPetsDetails)}` : ''}</dd><dt>Activity</dt><dd>${esc(['', 'Relaxed', 'Moderate', 'Very active'][a.activityLevel] || '—')}</dd>
          <dt>Alone</dt><dd>${esc(a.hoursAlone)} hrs/day</dd><dt>Week</dt><dd>${esc(a.workSchedule || '—')}</dd><dt>Experience</dt><dd>${esc(a.experience)}</dd></dl>
        <ul class="plain breakdown">${(a.breakdown || []).map((b) => `<li><span>${esc(b.text)}</span><b>+${b.points}</b></li>`).join('')}${(a.notes || []).map((n) => `<li style="color:var(--honey-ink)"><span>${icons.alert} ${esc(n)}</span></li>`).join('')}</ul>
        <div style="grid-column:1/-1">${a.experienceDetails ? `<p class="label">Experience</p><p class="small">${esc(a.experienceDetails)}</p>` : ''}<p class="label" style="margin-top:10px">Why they want to adopt</p><p class="small">${esc(a.motivation)}</p></div></div></div>

      <div class="card"><div class="card-head"><h3>Messages</h3></div><div class="card-body">
        <div class="msg-thread">${(a.messages || []).length ? a.messages.map((m) => `<div class="thread-msg ${m.from === 'staff' ? 'staff' : ''}"><div class="who">${esc(m.from === 'staff' ? `${m.name} (staff)` : a.name)}<span>${esc(timeAgo(m.at))}</span></div><p>${esc(m.text)}</p></div>`).join('') : '<p class="small muted">No messages yet.</p>'}</div>
        <form id="msgForm" style="margin-top:12px;display:grid;grid-template-columns:1fr auto;gap:8px"><label class="sr-only" for="msgText">Message applicant</label><input class="input" id="msgText" maxlength="2000" placeholder="Message ${esc(a.name.split(' ')[0])} (they'll be emailed)"><button class="btn btn-dark" aria-label="Send">${icons.send}</button></form></div></div>

      <div class="card" style="border-color:#E3CDBE;background:#FFFBF7"><div class="card-head"><div><span class="src-label" style="color:var(--brand-ink)">${icons.lock}Internal</span><h3>Private staff notes</h3></div></div><div class="card-body">
        <label class="sr-only" for="staffNotes">Private notes</label><textarea class="textarea" id="staffNotes" maxlength="3000" style="min-height:90px" placeholder="Only visible to shelter staff">${esc(a.staffNotes || '')}</textarea>
        <button class="btn btn-sm" id="notesBtn" style="margin-top:8px">Save notes</button></div></div>

      <div class="card"><div class="card-head"><h3>History</h3></div><div class="card-body"><ol class="timeline">${a.history.map((h, i) => `<li class="tl-item ${i === a.history.length - 1 ? 'current' : 'done'}"><span class="tl-dot">${icons.check}</span>
        <div class="tl-content"><h4>${esc(h.status)}</h4><div class="when">${esc(fmtDateTime(h.at))} · ${esc(h.by || '')}</div>${h.note ? `<div class="tl-note">${esc(h.note)}</div>` : ''}</div></li>`).join('')}</ol></div></div>
    </div>`;

    const syncStatus = () => {
      const s = $('#newStatus')?.value;
      if (!s) return;
      $('#dateField').hidden = !NEEDS_DATE.includes(s);
      $('#msgHint').textContent = s === 'Info Requested' ? '(required — tell them what you need)' : '(optional — included in their email)';
      if (!$('#statusMsg').value && TEMPLATES[s]) $('#statusMsg').placeholder = `${TEMPLATES[s]}…`;
    };
    $('#newStatus')?.addEventListener('change', syncStatus); syncStatus();
    $('#statusForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const status = $('#newStatus').value;
      const body = { status, message: $('#statusMsg').value.trim() };
      if (NEEDS_DATE.includes(status)) { if (!$('#apptAt').value) return toast('Choose a date and time for the appointment.', 'error'); body.appointmentAt = new Date($('#apptAt').value).toISOString(); }
      if (status === 'Adopted' && !(await PawPal.confirm({ title: `Complete ${a.petName}'s adoption?`, message: `${a.petName} will be marked adopted and every other open application for ${a.petName} will be closed and notified.`, confirmText: 'Complete adoption' }))) return;
      const btn = $('#statusBtn'); setBusy(btn, true, 'Updating…');
      try { const r = await PawPalAPI.patch(`/applications/${encodeURIComponent(a.id)}/status`, body); toast(r.message, PawPal.emailToastType(r)); load(); }
      catch (err) { setBusy(btn, false); toast(err.message, 'error'); }
    });
    $('#sumBtn').addEventListener('click', async () => {
      const btn = $('#sumBtn'); setBusy(btn, true, 'Summarising…');
      try {
        const s = await PawPalAPI.get(`/ai/applications/${encodeURIComponent(a.id)}/summary`);
        $('#sumBody').innerHTML = `<div class="ai-panel"><p style="white-space:pre-wrap">${esc(s.summary)}</p>
          ${s.strengths.length ? `<ul class="plain reason-list pos" style="margin-top:10px">${s.strengths.map((x) => `<li>${icons.check}<span>${esc(x)}</span></li>`).join('')}</ul>` : ''}
          ${s.considerations.length ? `<ul class="plain reason-list con" style="margin-top:6px">${s.considerations.map((x) => `<li>${icons.info}<span>${esc(x)}</span></li>`).join('')}</ul>` : ''}
          <p class="tiny muted" style="margin-top:10px">${esc(`Generated by ${PawPal.aiLabel(s.source, 'PawPal\'s rules engine')}`)} — a starting point, not a decision.</p></div>`;
      } catch (err) { toast(err.message, 'error'); }
      setBusy(btn, false);
    });
    $('#inviteBtn')?.addEventListener('click', () => PawPal.modal({ title: `Invite ${a.name.split(' ')[0]} to book a meet & greet`,
      body: `<div class="stack"><p class="small muted">They'll get an email and a notification with a link to choose one of your free times for ${esc(a.petName)}.</p>
        <div class="field"><label for="inviteMsg">Message (optional)</label><textarea class="textarea" id="inviteMsg" maxlength="1000" placeholder="e.g. Bring your other dog along if you can!"></textarea></div><div id="inviteErr"></div></div>`,
      actions: [{ label: 'Cancel', value: false }, { label: 'Send invite', variant: 'btn-primary', onClick: async (m, btn) => {
        setBusy(btn, true, 'Sending…');
        try { const r = await PawPalAPI.post(`/applications/${encodeURIComponent(a.id)}/invite-booking`, { message: $('#inviteMsg', m).value.trim() }); toast(r.message, PawPal.emailToastType(r)); renderDetail(a.id); return true; }
        catch (err) { setBusy(btn, false); $('#inviteErr', m).innerHTML = errorHTML(err.message); return false; }
      } }] }));
    $('#recordPayBtn')?.addEventListener('click', async () => {
      if (!(await PawPal.confirm({ title: `Record the $${a.feeDue} adoption fee as paid?`, message: `Use this when ${a.name.split(' ')[0]} paid at the shelter. A receipt is emailed to them.`, confirmText: 'Record payment' }))) return;
      const btn = $('#recordPayBtn'); setBusy(btn, true, 'Recording…');
      try { const r = await PawPalAPI.post(`/payments/application/${encodeURIComponent(a.id)}/record`); toast(r.message); renderDetail(a.id); }
      catch (err) { setBusy(btn, false); toast(err.message, 'error'); }
    });
    $('#careBtn')?.addEventListener('click', async () => {
      if (a.carePlan && !(await PawPal.confirm({ title: 'Regenerate the care plan?', message: `This replaces the current plan and lets ${a.name.split(' ')[0]} know it was updated.`, confirmText: 'Regenerate' }))) return;
      const btn = $('#careBtn'); setBusy(btn, true, 'Preparing…');
      try { const r = await PawPalAPI.post(`/applications/${encodeURIComponent(a.id)}/care-plan`); toast(r.message); renderDetail(a.id); }
      catch (err) { setBusy(btn, false); toast(err.message, 'error'); }
    });
    $('#msgForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = $('#msgText').value.trim(); if (text.length < 2) return;
      try { const r = await PawPalAPI.post(`/applications/${encodeURIComponent(a.id)}/messages`, { text }); toast(r.message, PawPal.emailToastType(r)); renderDetail(a.id); } catch (err) { toast(err.message, 'error'); }
    });
    $('#notesBtn').addEventListener('click', async () => {
      try { const r = await PawPalAPI.patch(`/applications/${encodeURIComponent(a.id)}/notes`, { staffNotes: $('#staffNotes').value }); toast(r.message); } catch (err) { toast(err.message, 'error'); }
    });
  }

  $('#appTabs').addEventListener('click', (e) => { const t = e.target.closest('[data-tab]'); if (t) { tab = t.dataset.tab; selected = null; load(); } });
  $('#appList').addEventListener('click', (e) => { const r = e.target.closest('[data-app]'); if (r) { renderDetail(r.dataset.app); if (window.innerWidth <= 1100) $('#appDetail').scrollIntoView({ behavior: 'smooth' }); } });
  let t; $('#appQ').addEventListener('input', () => { clearTimeout(t); t = setTimeout(load, 250); });
  $('#appPet').addEventListener('change', load); $('#appSort').addEventListener('change', load);
  try {
    const { pets } = await PawPalAPI.get('/pets', { all: 1 });
    $('#appPet').insertAdjacentHTML('beforeend', pets.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join(''));
    if (params.get('petId')) $('#appPet').value = params.get('petId');
  } catch { /* ignore */ }
  load();
})();
