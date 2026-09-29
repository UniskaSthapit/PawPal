// Written cruelty concern → PawPal team (POST /api/contact with a cruelty topic).
(async () => {
  const { $, esc, icons, setBusy, errorHTML } = PawPal;
  await PawPal.booted;
  $('#reportForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const where = $('#rWhere').value.trim(); const what = $('#rWhat').value.trim();
    if (!where || what.length < 10) { $('#rMsg').innerHTML = errorHTML('Please tell us where the animal is and what you have seen (at least 10 characters).'); return; }
    const email = $('#rEmail').value.trim();
    const btn = $('#rBtn'); setBusy(btn, true, 'Sending…');
    try {
      await PawPalAPI.post('/contact', { name: $('#rName').value.trim() || 'Anonymous reporter', email: email || 'anonymous@pawpal.app', topic: 'Cruelty report',
        message: `CRUELTY CONCERN — ${$('#rType').value}\nLocation: ${where}\n\n${what}${email ? '' : '\n\n(Reporter chose to stay anonymous.)'}` });
      $('#reportForm .card-body').innerHTML = `<div class="alert alert-success" style="grid-column:1/-1">${icons.checkCircle}<div><b>Thank you — your report was sent.</b> Our team will pass it to the relevant authority. If the animal's situation becomes urgent, call your state inspectorate straight away.</div></div>`;
    } catch (err) { $('#rMsg').innerHTML = errorHTML(err.message); setBusy(btn, false); }
  });
})();
