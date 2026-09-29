// Staff overview: KPIs, pipeline, latest applications, appointments, assistant shortcut, insights.
(async () => {
  const { $, esc, icons, statusBadge, scoreBadge, timeAgo, fmtDateTime, errorHTML } = PawPal;
  const u = await PawPal.booted;
  const hour = new Date().getHours();
  $('#hello').textContent = `${hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'}, ${u.name.split(' ')[0]}`;
  if (u.role === 'admin') $('#helloSub').textContent = 'Administrator view — data across all shelters.';
  $('#askForm').addEventListener('submit', (e) => { e.preventDefault(); location.href = `assistant.html?q=${encodeURIComponent($('#askQ').value.trim() || 'Which applications need review?')}`; });

  let d;
  try { d = await PawPalAPI.get('/analytics/dashboard'); } catch (err) { $('#kpis').innerHTML = errorHTML(err.message); return; }
  const delta = (n) => (n ? `<span class="delta ${n > 0 ? 'up' : 'down'}">${n > 0 ? '▲' : '▼'} ${Math.abs(n)}% vs last month</span>` : '<span class="delta muted">No change vs last month</span>');
  $('#kpis').innerHTML = `
    <a class="kpi" href="pets.html?status=Available"><div class="k-top"><span class="k-ic">${icons.paw}</span></div><b>${d.availablePets}</b><span>Pets available</span><span class="delta muted">${d.onHoldPets} on hold · ${d.draftPets} drafts</span></a>
    <a class="kpi" href="applications.html?status=open"><div class="k-top"><span class="k-ic">${icons.file}</span></div><b>${d.openApplications}</b><span>Open applications</span><span class="delta ${d.pendingReview ? 'down' : 'muted'}">${d.pendingReview} awaiting review</span></a>
    <a class="kpi" href="enquiries.html"><div class="k-top"><span class="k-ic">${icons.message}</span></div><b>${d.openEnquiries}</b><span>Unanswered enquiries</span><span class="delta muted">Reply from the Enquiries tab</span></a>
    <a class="kpi" href="analytics.html"><div class="k-top"><span class="k-ic">${icons.home}</span></div><b>${d.adoptedThisMonth}</b><span>Adopted this month</span>${delta(d.adoptedChange)}</a>`;
  $('#pipeline').innerHTML = d.pipeline.map((p) => `<a href="applications.html?status=${encodeURIComponent(p.status)}"><b>${p.count}</b><span>${esc(p.status)}</span></a>`).join('');
  $('#recent').innerHTML = d.recent.length ? d.recent.map((a) => `<a class="list-row" href="applications.html?id=${encodeURIComponent(a.id)}">
      <img src="${esc(PawPal.sized(a.petPhoto || PawPal.PLACEHOLDER, 200))}" alt="" data-fallback="${PawPal.PLACEHOLDER}">
      <div class="grow"><b>${esc(a.name)} → ${esc(a.petName)}</b><span class="sub">${esc(timeAgo(a.submittedAt))}</span></div>${scoreBadge(a.score)}${statusBadge(a.status)}</a>`).join('')
    : '<div class="card-body muted">No applications yet.</div>';
  $('#upcoming').innerHTML = d.upcoming.length ? d.upcoming.map((a) => `<a class="list-row" href="applications.html?id=${encodeURIComponent(a.id)}">
      <span class="thumb" style="display:grid;place-items:center;background:var(--sky-soft);color:var(--sky)">${icons.calendar}</span>
      <div class="grow"><b>${esc(fmtDateTime(a.appointmentAt))}</b><span class="sub">${esc(a.status)} · ${esc(a.name)} &amp; ${esc(a.petName)}</span></div></a>`).join('')
    : '<div class="card-body muted small">No upcoming appointments.</div>';
  try {
    const ins = await PawPalAPI.get('/analytics/insights');
    $('#insights').innerHTML = ins.insights.length ? ins.insights.map((t) => `<div class="insight">${icons.bulb}<span>${esc(t)}</span></div>`).join('') : '<p class="muted small">Not enough activity yet for insights.</p>';
  } catch { $('#insights').innerHTML = '<p class="muted small">Insights are unavailable right now.</p>'; }
})();
