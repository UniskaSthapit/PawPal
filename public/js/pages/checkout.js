// Adoption-fee checkout — a PAYMENT SIMULATION. Only test cards are accepted and the card details are sent once to
// PawPal's server, which keeps just the brand and last 4 digits. Nothing is saved in the browser.
(async () => {
  const { $, $$, esc, icons, params, sized, toast, setBusy, errorHTML } = PawPal;
  await PawPal.booted;
  const appId = params.get('app');
  const root = $('#checkout');
  const aud = (n) => `$${Number(n).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (!appId) { root.innerHTML = errorHTML('No adoption was chosen.'); return; }

  // ---- the same checks the server makes (the server is the one that decides) ----
  const TEST = { '4242424242424242': 1, '4000000000000002': 1, '4000000000009995': 1 };
  const luhn = (d) => { let s = 0; for (let i = 0; i < d.length; i++) { let x = Number(d[d.length - 1 - i]); if (i % 2) { x *= 2; if (x > 9) x -= 9; } s += x; } return s % 10 === 0; };
  function validate(v) {
    const errors = {};
    const digits = v.number.replace(/[\s-]/g, '');
    if (v.name.trim().length < 2 || !/^[\p{L}][\p{L}' .-]*$/u.test(v.name.trim())) errors.name = 'Enter the name on the card.';
    if (!/^\d{12,19}$/.test(digits)) errors.number = 'Enter the card number (digits only).';
    else if (!luhn(digits)) errors.number = 'That card number isn\'t valid — check the digits.';
    else if (!TEST[digits]) errors.number = 'Use a test card for this simulation (for example 4242 4242 4242 4242).';
    const m = /^(\d{2})\/(\d{2})$/.exec(v.expiry.replace(/\s/g, ''));
    if (!m) errors.expiry = 'Enter the expiry date as MM/YY.';
    else if (Number(m[1]) < 1 || Number(m[1]) > 12) errors.expiry = 'The expiry month must be between 01 and 12.';
    else if (new Date(2000 + Number(m[2]), Number(m[1]), 1) <= new Date()) errors.expiry = 'This card has expired.';
    if (!/^\d{3}$/.test(v.cvc)) errors.cvc = 'The CVC is the 3 digits on the back of the card.';
    return errors;
  }
  const showErrors = (errors) => {
    ['name', 'number', 'expiry', 'cvc'].forEach((f) => {
      const input = $(`#c_${f}`); const box = $(`#e_${f}`);
      input.setAttribute('aria-invalid', String(Boolean(errors[f]))); box.textContent = errors[f] || '';
    });
    const firstBad = ['name', 'number', 'expiry', 'cvc'].find((f) => errors[f]);
    if (firstBad) $(`#c_${firstBad}`).focus();
  };

  let data;
  async function load() {
    try { data = await PawPalAPI.get(`/payments/application/${encodeURIComponent(appId)}`); }
    catch (err) { root.innerHTML = errorHTML(err.message); return; }
    render();
  }

  function summaryHTML() {
    const a = data.application;
    return `<aside class="card card-pad pay-summary">
      <img src="${esc(sized(a.petPhoto || PawPal.PLACEHOLDER, 600))}" alt="${esc(a.petName)}" data-fallback="${PawPal.PLACEHOLDER}">
      <div><span class="src-label src-shelter">${icons.building}${esc(data.shelter?.name || 'Shelter')}</span><h2 class="h3" style="margin-top:6px">Adopting ${esc(a.petName)}</h2></div>
      <div class="pay-total"><span>Adoption fee</span><b id="amount">${data.amount !== null ? aud(data.amount) : '—'}</b></div>
      <p class="tiny muted">The fee helps cover vaccinations, desexing, microchipping and care while ${esc(a.petName)} waited for you.</p></aside>`;
  }

  function render() {
    const s = data.paymentStatus;
    if (s === 'paid') {
      root.innerHTML = `<div class="checkout"><div class="card card-pad fee-card fee-paid"><span class="src-label">${icons.checkCircle}Paid</span>
        <h2 class="h3" style="margin-top:6px">The adoption fee has been paid</h2>
        <p class="small" style="margin-top:6px">Receipt ${esc(data.payment?.receiptNo || '')}. Thank you!</p>
        <a class="btn btn-primary" style="margin-top:12px" href="receipt.html?id=${encodeURIComponent(data.payment?.id || '')}">${icons.file}View receipt</a></div>${summaryHTML()}</div>`;
      return;
    }
    if (s === 'not_due' || s === 'no_fee') {
      root.innerHTML = `<div style="margin-top:20px">${errorHTML(s === 'no_fee' ? 'There is no adoption fee for this adoption.' : 'The adoption fee is due once the adoption is complete.')}</div>`;
      return;
    }
    root.innerHTML = `<div class="checkout">
      <form class="card card-pad stack" id="payForm" method="post" action="#" novalidate autocomplete="off" style="--stack:16px">
        ${s === 'pay_in_person' ? `<div class="alert alert-info">${icons.info}<div>You chose to pay at the shelter. You can still pay here instead.</div></div>` : ''}
        <h2 class="h3">Pay by card</h2>
        <div class="field"><label for="c_name">Name on card</label><input class="input" id="c_name" maxlength="80" autocomplete="off" spellcheck="false" aria-describedby="e_name"><span class="error" id="e_name" aria-live="polite"></span></div>
        <div class="field"><label for="c_number">Card number</label><input class="input mono" id="c_number" inputmode="numeric" maxlength="23" autocomplete="off" placeholder="4242 4242 4242 4242" aria-describedby="e_number"><span class="error" id="e_number" aria-live="polite"></span></div>
        <div class="card-row">
          <div class="field"><label for="c_expiry">Expiry (MM/YY)</label><input class="input mono" id="c_expiry" inputmode="numeric" maxlength="5" autocomplete="off" placeholder="12/30" aria-describedby="e_expiry"><span class="error" id="e_expiry" aria-live="polite"></span></div>
          <div class="field"><label for="c_cvc">CVC</label><input class="input mono" id="c_cvc" inputmode="numeric" maxlength="3" autocomplete="off" placeholder="123" aria-describedby="e_cvc"><span class="error" id="e_cvc" aria-live="polite"></span></div>
        </div>
        <div id="payError"></div>
        <button class="btn btn-primary btn-lg" type="submit" id="payBtn">${icons.checkCircle}Pay ${aud(data.amount)}</button>
        ${s === 'pay_in_person' ? '' : `<button class="btn btn-ghost" type="button" id="inPersonBtn">${icons.building}I'll pay at the shelter instead</button>`}
        <details class="small"><summary>Test cards for this simulation</summary>
          <div class="test-cards" style="margin-top:8px">${data.testCards.map((c) => `<button type="button" data-card="${esc(c.number)}"><code>${esc(c.number)}</code><span class="muted">${esc({ succeeded: 'Payment succeeds', declined: 'Card declined', insufficient_funds: 'Insufficient funds' }[c.result] || c.result)}</span></button>`).join('')}
          <p class="tiny muted">Use any future expiry date, any 3-digit CVC and any name.</p></div></details>
      </form>
      ${summaryHTML()}</div>`;

    const number = $('#c_number'); const expiry = $('#c_expiry'); const cvc = $('#c_cvc');
    number.addEventListener('input', () => { const d = number.value.replace(/\D/g, '').slice(0, 19); number.value = d.replace(/(\d{4})(?=\d)/g, '$1 '); });
    expiry.addEventListener('input', (e) => { let d = expiry.value.replace(/\D/g, '').slice(0, 4); if (d.length >= 3 || (d.length === 2 && e.inputType !== 'deleteContentBackward')) d = `${d.slice(0, 2)}/${d.slice(2)}`; expiry.value = d; });
    cvc.addEventListener('input', () => { cvc.value = cvc.value.replace(/\D/g, '').slice(0, 3); });
    $$('[data-card]').forEach((b) => b.addEventListener('click', () => { number.value = b.dataset.card; number.dispatchEvent(new Event('input')); expiry.focus(); }));

    $('#payForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      $('#payError').innerHTML = '';
      const v = { name: $('#c_name').value, number: number.value, expiry: expiry.value, cvc: cvc.value };
      const errors = validate(v);
      showErrors(errors);
      if (Object.keys(errors).length) return;
      const btn = $('#payBtn'); setBusy(btn, true, 'Processing…');
      try {
        const r = await PawPalAPI.post('/payments/checkout', { applicationId: appId, card: v });
        cvc.value = ''; number.value = '';
        location.href = `receipt.html?id=${encodeURIComponent(r.payment.id)}`;
      } catch (err) {
        setBusy(btn, false);
        cvc.value = '';
        if (err.status === 409 && err.data?.payment) { toast(err.message, 'info'); await load(); return; }
        if (err.data?.field) showErrors({ [err.data.field]: err.message });
        else $('#payError').innerHTML = errorHTML(err.message);
      }
    });
    $('#inPersonBtn')?.addEventListener('click', async () => {
      const btn = $('#inPersonBtn'); setBusy(btn, true, 'Saving…');
      try { const r = await PawPalAPI.post('/payments/pay-in-person', { applicationId: appId }); toast(r.message); await load(); }
      catch (err) { setBusy(btn, false); toast(err.message, 'error'); }
    });
  }
  load();
})();
