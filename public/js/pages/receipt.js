// Printable receipt for a (simulated) adoption-fee payment. Only the card brand and last 4 digits were ever kept.
(async () => {
  const { $, esc, icons, params, errorHTML } = PawPal;
  const u = await PawPal.booted;
  const id = params.get('id');
  const root = $('#receipt');
  if (PawPal.isStaffUser(u)) { $('#backLink').href = 'applications.html'; $('#backLink').textContent = 'Applications'; }
  if (!id) { root.innerHTML = errorHTML('No receipt was chosen.'); return; }
  let r;
  try { r = await PawPalAPI.get(`/payments/${encodeURIComponent(id)}`); }
  catch (err) { root.innerHTML = errorHTML(err.message); return; }
  const p = r.payment;
  const when = new Date(p.paidAt).toLocaleString('en-AU', { dateStyle: 'long', timeStyle: 'short' });
  root.innerHTML = `
    <div class="row-between" style="align-items:flex-start">
      <div><span class="src-label src-shelter">${icons.checkCircle}Payment received</span><h2 class="h2" style="margin-top:6px">PawPal</h2>
        <p class="small muted">${esc(r.shelter?.name || '')}${r.shelter?.address ? `<br>${esc(r.shelter.address)}` : ''}${r.shelter?.phone ? `<br>${esc(r.shelter.phone)}` : ''}</p></div>
      <div style="text-align:right"><div class="amount" id="receiptAmount">$${Number(p.amount).toFixed(2)}</div><div class="small muted">AUD</div></div>
    </div>
    <dl>
      <dt>Receipt number</dt><dd id="receiptNo">${esc(p.receiptNo)}</dd>
      <dt>Date</dt><dd>${esc(when)}</dd>
      <dt>For</dt><dd>Adoption fee — ${esc(r.application.petName)}${r.application.petBreed ? ` (${esc(r.application.petBreed)})` : ''}</dd>
      <dt>Adopter</dt><dd>${esc(r.application.adopter)}</dd>
      <dt>Paid with</dt><dd id="paidWith">${esc(p.last4 ? `${p.brand} ending ${p.last4}` : p.brand)}</dd>
    </dl>
    <div class="sim-banner" style="margin-top:22px">${icons.info}<div><b>PAYMENT SIMULATION</b> No real money was taken. This receipt is for demonstration only.</div></div>`;
  $('#printBtn').disabled = false;
  $('#printBtn').addEventListener('click', () => window.print());
})();
