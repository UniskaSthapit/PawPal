// Contact form (POST /api/contact) and the live list of shelters.
(async () => {
  const { $, esc, icons, setBusy, errorHTML } = PawPal;
  const u = await PawPal.booted;
  if (u) { $('#cName').value = u.name; $('#cEmail').value = u.email; }
  try {
    const { shelters } = await PawPalAPI.get('/shelters');
    $('#shelterList').innerHTML = shelters.map((s) => `<div class="card card-pad"><div class="shelter-card"><span class="s-ic">${icons.building}</span><div>
      <h3 style="font-size:19px">${esc(s.name)}</h3><p class="small muted">${esc(s.address || `${s.suburb}, ${s.state}`)}</p>
      <dl class="kv small" style="margin-top:10px">${s.hours ? `<dt>Hours</dt><dd>${esc(s.hours)}</dd>` : ''}${s.phone ? `<dt>Phone</dt><dd><a href="tel:${esc(s.phone.replace(/[^\d+]/g, ''))}">${esc(s.phone)}</a></dd>` : ''}${s.email ? `<dt>Email</dt><dd><a href="mailto:${esc(s.email)}">${esc(s.email)}</a></dd>` : ''}</dl></div></div></div>`).join('');
  } catch { $('#shelterList').innerHTML = ''; }
  $('#contactForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#cBtn'); setBusy(btn, true, 'Sending…');
    try {
      const r = await PawPalAPI.post('/contact', { name: $('#cName').value, email: $('#cEmail').value, topic: $('#cTopic').value, message: $('#cMsg').value });
      $('#cMsgBox').innerHTML = `<div class="alert alert-success">${icons.checkCircle}<div>${esc(r.message)}</div></div>`; $('#cMsg').value = '';
    } catch (err) { $('#cMsgBox').innerHTML = errorHTML(err.message); }
    setBusy(btn, false);
  });
})();
