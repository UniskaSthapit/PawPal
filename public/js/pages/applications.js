// Staff: review applications — AI ranking (FR-08), status workflow (FR-09), auto emails (FR-12).
(async () => {
  const { $, esc, fmtDate, fmtDateTime, initials, statusBadge, scoreBadge, toast, modal, setBusy, params } = PawPal;
  $('#today').textContent = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
  const STATUSES = ['Pending', 'Shortlisted', 'Visit Scheduled', 'Approved', 'Rejected', 'Adopted', 'Withdrawn'];
  const DOT = { Pending: '#E65100', Shortlisted: '#C9A227', 'Visit Scheduled': '#1565C0', Approved: '#2E7D32', Rejected: '#C62828', Adopted: '#C85A3E', Withdrawn: '#9C8F84' };
  let apps = [];
  let statusFilter = params.get('status') || '';

  function renderChips() {
    const count = (s) => apps.filter((a) => a.status === s).length;
    $('#statusChips').innerHTML = [`<button class="status-chip ${!statusFilter ? 'active' : ''}" data-s="">All <b>${apps.length}</b></button>`]
      .concat(STATUSES.map((s) => `<button class="status-chip ${statusFilter === s ? 'active' : ''}" data-s="${s}"><span class="app-summary-dot" style="background:${DOT[s]}"></span>${s} <b>${count(s)}</b></button>`)).join('');
  }

  function render() {
    const q = $('#appSearch').value.trim().toLowerCase();
    const pet = $('#petFilter').value;
    const byScore = $('#sortSel').value === 'score' || Boolean(pet);
    $('#rankNote').hidden = !pet;
    const list = apps.filter((a) => (!statusFilter || a.status === statusFilter) && (!pet || a.petId === pet)
      && (!q || `${a.name} ${a.email} ${a.petName}`.toLowerCase().includes(q)))
      .sort(byScore ? (a, b) => b.score - a.score : (a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
    $('#appBody').innerHTML = list.length ? list.map((a, i) => `<tr>
        <td><div class="applicant">${pet ? `<span class="rank-num">#${i + 1}</span>` : ''}<div class="avatar">${esc(initials(a.name))}</div><div><span class="applicant-name">${esc(a.name)}</span><div class="pet-breed">${esc(a.email)}</div></div></div></td>
        <td><div class="pet-name">${esc(a.petName)}</div><div class="pet-breed">${esc(a.petBreed)}</div></td>
        <td>${scoreBadge(a.score)} <span class="muted">${esc(a.label.replace(' Match', ''))}</span></td>
        <td class="muted">${fmtDate(a.submittedAt)}</td><td>${statusBadge(a.status)}</td>
        <td><button class="action-link" data-open="${esc(a.id)}">Review</button></td></tr>`).join('')
      : '<tr><td colspan="6"><div class="pp-empty"><div class="pp-empty-emoji">📭</div><h3>No applications match</h3><p>Try another status, pet or search term.</p></div></td></tr>';
  }

  async function load() {
    try {
      ({ applications: apps } = await PawPalAPI.get('/applications'));
      const pets = [...new Map(apps.map((a) => [a.petId, a.petName])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
      const current = $('#petFilter').value || params.get('pet') || '';
      $('#petFilter').innerHTML = '<option value="">All pets</option>' + pets.map(([id, name]) => `<option value="${esc(id)}">${esc(name)}</option>`).join('');
      $('#petFilter').value = current;
      renderChips();
      render();
    } catch (err) { $('#appBody').innerHTML = `<tr><td colspan="6">${esc(err.message)}</td></tr>`; }
  }

  // ---------- review dialog ----------
  async function openReview(id) {
    let data;
    try { data = await PawPalAPI.get(`/applications/${encodeURIComponent(id)}`); } catch (err) { return toast(err.message, 'error'); }
    const a = data.application;
    const ringColor = a.score >= 80 ? '#388E3C' : a.score >= 60 ? '#D4A853' : '#C62828';
    const closed = ['Adopted', 'Withdrawn'].includes(a.status);
    const nextOptions = STATUSES.filter((s) => s !== 'Withdrawn' && (s !== a.status || s === 'Visit Scheduled'));
    const suggested = { Pending: 'Shortlisted', Shortlisted: 'Visit Scheduled', 'Visit Scheduled': 'Approved', Approved: 'Adopted', Rejected: 'Pending' }[a.status];
    const tomorrow = new Date(Date.now() + 86400000); tomorrow.setHours(11, 0, 0, 0);
    const localIso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

    const body = `
      <div class="review-head">
        <div class="pp-score-ring" style="--v:${a.score};--ring:${ringColor}"><span>${a.score}</span></div>
        <div class="review-head-text">
          <b>${esc(a.label)}</b>
          <span>Ranked <b>#${data.rank}</b> of ${data.totalForPet} applicant${data.totalForPet > 1 ? 's' : ''} for ${esc(a.petName)}</span>
          <span>${statusBadge(a.status)} · submitted ${fmtDate(a.submittedAt)}</span>
        </div>
      </div>
      <div class="pp-grid-2 review-grid">
        <section>
          <h4>How the AI scored this application</h4>
          <ul class="pp-breakdown">${a.breakdown.map((b) => `<li class="${/RISK|poor|mismatch/i.test(b.text) ? 'risk' : ''}"><span>${esc(b.text)}</span><b>+${b.points}</b></li>`).join('')}</ul>
          ${a.notes?.length ? `<p class="review-note">⚠️ ${a.notes.map(esc).join(' ')}</p>` : ''}
          <h4>History</h4>
          <ol class="pp-timeline">${a.history.map((h) => `<li><b>${esc(h.status)}</b> — ${esc(h.by)}<small>${esc(fmtDateTime(h.at))}${h.note ? ` · “${esc(h.note)}”` : ''}</small></li>`).join('')}</ol>
        </section>
        <section>
          <h4>Applicant</h4>
          <dl class="pp-kv">
            <dt>Name</dt><dd>${esc(a.name)}</dd><dt>Email</dt><dd><a href="mailto:${esc(a.email)}">${esc(a.email)}</a></dd>
            <dt>Phone</dt><dd>${esc(a.phone || '—')}</dd><dt>Suburb</dt><dd>${esc(a.address || '—')}</dd>
            <dt>Home</dt><dd>${esc(a.livingType)}</dd><dt>Activity</dt><dd>${['', 'Relaxed', 'Moderate', 'Very active'][a.activityLevel]}</dd>
            <dt>Alone per day</dt><dd>about ${a.hoursAlone} hrs</dd><dt>Children</dt><dd>${a.hasChildren ? 'Yes' : 'No'}</dd>
            <dt>Other pets</dt><dd>${a.hasOtherPets ? 'Yes' : 'No'}</dd><dt>Experience</dt><dd>${esc(a.experience)}</dd>
            ${a.visitAt ? `<dt>Visit</dt><dd>${esc(fmtDateTime(a.visitAt))}</dd>` : ''}
          </dl>
          <h4>Why they want to adopt</h4><p class="review-quote">${esc(a.motivation)}</p>
          ${a.experienceDetails ? `<h4>Previous pets</h4><p class="review-quote">${esc(a.experienceDetails)}</p>` : ''}
          <h4><label for="staffNotes">Private staff notes</label></h4>
          <textarea class="pp-textarea" id="staffNotes" placeholder="Only staff can see these notes">${esc(a.staffNotes || '')}</textarea>
          <button class="pp-btn pp-btn-soft pp-btn-sm" id="saveNotes" type="button">Save notes</button>
        </section>
      </div>
      ${closed ? `<div class="pp-alert pp-alert-info">This application is ${a.status.toLowerCase()} and can no longer be changed.</div>` : `
      <div class="status-panel">
        <h4>Update status</h4>
        <div class="status-panel-row">
          <div class="pp-field"><label for="newStatus">New status</label><select class="pp-select" id="newStatus">${nextOptions.map((s) => `<option ${s === suggested ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
          <div class="pp-field" id="visitField"><label for="visitAt">Visit date and time</label><input class="pp-input" type="datetime-local" id="visitAt" value="${localIso(a.visitAt ? new Date(a.visitAt) : tomorrow)}"/></div>
        </div>
        <div class="pp-field"><label for="statusMsg">Message to the applicant (optional)</label><textarea class="pp-textarea" id="statusMsg" maxlength="600" placeholder="Included in the email PawPal sends automatically"></textarea></div>
        <p class="pp-hint" id="statusHint"></p>
      </div>`}`;

    const hints = {
      Shortlisted: 'The applicant is emailed that they are shortlisted and a visit will be arranged.',
      'Visit Scheduled': 'The applicant receives an email with the visit date and time. The pet is marked "Adoption pending".',
      Approved: 'The applicant is emailed that they are approved.',
      Rejected: 'The applicant is emailed kindly and pointed to the AI quiz.',
      Adopted: `Completes the adoption: ${a.petName} is marked Adopted and every other open application for ${a.petName} is closed and notified automatically (FR-12).`,
      Pending: 'Moves the application back to pending review.',
    };

    await modal({
      title: `${a.name} → ${a.petName}`, wide: true, body,
      actions: closed ? [{ label: 'Close' }] : [{ label: 'Close' }, {
        label: 'Update status', variant: 'pp-btn-primary', onClick: async (root, btn) => {
          const status = root.querySelector('#newStatus').value;
          const payload = { status, message: root.querySelector('#statusMsg').value };
          if (status === 'Visit Scheduled') payload.visitAt = new Date(root.querySelector('#visitAt').value).toISOString();
          setBusy(btn, true, 'Updating…');
          try {
            const r = await PawPalAPI.patch(`/applications/${a.id}/status`, payload);
            toast(r.message);
            load();
            return true;
          } catch (err) { toast(err.message, 'error'); setBusy(btn, false); return false; }
        },
      }],
      onOpen: (root) => {
        const sel = root.querySelector('#newStatus');
        const sync = () => {
          if (!sel) return;
          root.querySelector('#visitField').hidden = sel.value !== 'Visit Scheduled';
          root.querySelector('#statusHint').textContent = hints[sel.value] || '';
        };
        sel?.addEventListener('change', sync);
        sync();
        root.querySelector('#saveNotes').addEventListener('click', async (e) => {
          setBusy(e.target, true, 'Saving…');
          try { await PawPalAPI.patch(`/applications/${a.id}/notes`, { staffNotes: root.querySelector('#staffNotes').value }); toast('Notes saved'); }
          catch (err) { toast(err.message, 'error'); }
          setBusy(e.target, false);
        });
      },
    });
  }

  // ---------- events ----------
  $('#statusChips').addEventListener('click', (e) => { const c = e.target.closest('[data-s]'); if (!c) return; statusFilter = c.dataset.s; renderChips(); render(); });
  ['appSearch', 'petFilter', 'sortSel'].forEach((id) => $('#' + id).addEventListener('input', render));
  $('#appBody').addEventListener('click', (e) => { const b = e.target.closest('[data-open]'); if (b) openReview(b.dataset.open); });

  await load();
  if (params.get('open')) openReview(params.get('open'));
})();
