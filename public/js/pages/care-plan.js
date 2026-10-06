// "First 30 days" care plan for an approved adoption. Adopters see their own; staff can view and regenerate.
// "Download PDF" uses the browser's print dialog (Save as PDF) with a print stylesheet — no server PDF library.
(async () => {
  const { $, esc, icons, params, photo, sized, fmtDate, toast, setBusy, errorHTML, aiLabel, confirm } = PawPal;
  const u = await PawPal.booted;
  const id = params.get('id');
  const root = $('#carePlan');
  const staff = PawPal.isStaffUser(u);
  if (staff) { $('#backLink').href = `applications.html?id=${encodeURIComponent(id || '')}`; $('#backLink').textContent = 'Applications'; }
  if (!id) { root.innerHTML = errorHTML('No application was chosen.'); return; }

  const SECTION_ICON = { before: 'home', days1to3: 'heart', week1: 'calendar', weeks2to4: 'calendar', feeding: 'paw', exercise: 'sparkle', vet: 'stethoscope', training: 'check', warning: 'alert' };
  function render(data) {
    const { carePlan: plan, pet, application: app } = data;
    const img = pet ? photo(pet) : PawPal.PLACEHOLDER;
    root.innerHTML = `
      <header class="care-head">
        <img src="${esc(sized(img, 300))}" alt="${esc(app.petName)}" data-fallback="${PawPal.FALLBACK[pet?.type] || PawPal.PLACEHOLDER}">
        <div><span class="src-label src-ai">${icons.clipboard}PawPal care plan</span>
          <h2 class="h2" style="margin-top:6px">${esc(app.petName)}'s first 30 days</h2>
          <p class="muted small">${esc([pet?.type, pet?.breed].filter(Boolean).join(' · '))} · Prepared ${esc(fmtDate(plan.generatedAt))} · ${esc(aiLabel(plan.source, 'PawPal care templates'))}</p></div>
      </header>
      <p class="care-intro">${esc(plan.intro)}</p>
      <div class="care-disclaimer" role="note">${icons.info}<span><b>${esc(plan.disclaimer || 'This is general guidance, not veterinary advice.')}</b> If you're worried about ${esc(app.petName)}'s health, call your vet.</span></div>
      <div class="care-grid">
        ${plan.sections.map((s) => `<section class="care-section ${s.key === 'warning' ? 'care-warn' : ''}" data-section="${esc(s.key)}">
          <h3>${icons[SECTION_ICON[s.key]] || icons.check}${esc(s.title)}</h3>
          <ul class="cp-list">${s.items.map((x) => `<li><span class="care-box" aria-hidden="true"></span><span>${esc(x)}</span></li>`).join('')}</ul>
          ${s.key === 'vet' ? `<a class="btn btn-sm no-print" style="margin-top:10px" href="vet-finder.html">${icons.stethoscope}Find a vet near you</a><p class="print-only small">Find a vet: ${esc(location.origin)}/vet-finder.html</p>` : ''}
        </section>`).join('')}
      </div>
      <footer class="care-foot small muted">PawPal · ${esc(location.host)} · General guidance only, not veterinary advice.</footer>`;
    $('#printBtn').disabled = false;
    $('#regenBtn').hidden = !data.canRegenerate;
  }

  async function load() {
    try { render(await PawPalAPI.get(`/applications/${encodeURIComponent(id)}/care-plan`)); }
    catch (err) {
      root.innerHTML = `${errorHTML(err.message)}<div class="row" style="margin-top:12px"><a class="btn" href="${staff ? 'applications.html' : 'my-applications.html'}">Back to applications</a></div>`;
      if (staff && /prepared/.test(err.message)) $('#regenBtn').hidden = false; // still generating, or it failed: staff can create it now
    }
  }
  $('#printBtn').addEventListener('click', () => window.print());
  $('#regenBtn').addEventListener('click', async () => {
    if (!await confirm({ title: 'Regenerate the care plan?', message: 'This replaces the current plan and lets the adopter know it was updated.', confirmText: 'Regenerate' })) return;
    const btn = $('#regenBtn'); setBusy(btn, true, 'Regenerating…');
    try { const r = await PawPalAPI.post(`/applications/${encodeURIComponent(id)}/care-plan`); toast(r.message); await load(); }
    catch (err) { toast(err.message, 'error'); }
    finally { setBusy(btn, false); }
  });
  load();
})();
