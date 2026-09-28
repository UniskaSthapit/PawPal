// Staff dashboard — live shelter stats and recent applications.
(async () => {
  const { $, esc, fmtDate, fmtDateTime, initials, statusBadge, scoreBadge } = PawPal;
  const hour = new Date().getHours();
  $('#today').textContent = new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const user = await PawPal.ready;
  if (user) $('#greet').textContent = `🐾 Good ${hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'}, ${user.name.split(' ')[0]}`;

  const trend = (el, pct, suffix = 'vs last month') => {
    const up = pct >= 0;
    el.className = `stat-trend ${up ? 'trend-up' : 'trend-down'}`;
    el.textContent = `${up ? '▲ +' : '▼ '}${pct}% ${suffix}`;
  };

  try {
    const d = await PawPalAPI.get('/analytics/dashboard');
    $('#sAvail').textContent = d.availablePets;
    $('#tAvail').className = 'stat-trend trend-up';
    $('#tAvail').textContent = `${d.newPetsThisMonth} added this month`;
    $('#sOpen').textContent = d.openApplications;
    trend($('#tOpen'), d.newApplicationsChange, 'new vs last month');
    $('#sAdopted').textContent = d.adoptedThisMonth;
    trend($('#tAdopted'), d.adoptedChange);
    $('#sEmail').textContent = `${d.emailSuccessRate}%`;
    $('#tEmail').className = `stat-trend ${d.emailSuccessRate >= 90 ? 'trend-up' : 'trend-down'}`;
    $('#tEmail').textContent = d.emailsSent ? `${d.emailsSent} email${d.emailsSent === 1 ? '' : 's'} sent` : 'No emails sent yet';
    $('#welcomeSub').textContent = d.pendingReview
      ? `${d.pendingReview} application${d.pendingReview > 1 ? 's are' : ' is'} waiting for review.`
      : 'All applications are reviewed — nice work!';
    $('#visitsList').innerHTML = d.upcomingVisits.length ? d.upcomingVisits.map((v) => `<a class="visit-item" href="applications.html?open=${encodeURIComponent(v.id)}">
        <span class="visit-date">${esc(fmtDateTime(v.visitAt))}</span><b>${esc(v.name)}</b><span>meeting ${esc(v.petName)}</span></a>`).join('')
      : '<p class="pp-muted">No visits booked. Shortlist an applicant and schedule a visit from Applications.</p>';
  } catch (err) { PawPal.toast(err.message, 'error'); }

  try {
    const { applications } = await PawPalAPI.get('/applications', { limit: 6 });
    $('#recentBody').innerHTML = applications.length ? applications.map((a) => `<tr>
        <td><div class="applicant"><div class="avatar">${esc(initials(a.name))}</div><span class="applicant-name">${esc(a.name)}</span></div></td>
        <td><div class="pet-name">${esc(a.petName)}</div><div class="pet-breed">${esc(a.petBreed)}</div></td>
        <td>${scoreBadge(a.score)}</td><td class="muted">${fmtDate(a.submittedAt)}</td><td>${statusBadge(a.status)}</td>
        <td><a href="applications.html?open=${encodeURIComponent(a.id)}" class="action-link">Review</a></td></tr>`).join('')
      : '<tr><td colspan="6"><div class="pp-empty"><h3>No applications yet</h3><p>They will appear here as soon as adopters apply.</p></div></td></tr>';
  } catch (err) { $('#recentBody').innerHTML = `<tr><td colspan="6">${esc(err.message)}</td></tr>`; }
})();
