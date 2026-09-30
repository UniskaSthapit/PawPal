// Development mailbox: emails and SMS recorded when no provider is configured (disabled in production).
(async () => {
  const { $, esc, timeAgo, errorHTML } = PawPal;
  await PawPal.booted;
  let emails = [];
  async function load() {
    try {
      emails = (await PawPalAPI.get('/dev/emails', { to: $('#mbFilter').value.trim() })).emails;
      $('#mbList').innerHTML = emails.length ? emails.map((m, i) => `<button class="app-item card" data-mail="${i}" style="display:block;text-align:left;padding:12px 14px;width:100%;border:1px solid var(--line)"><b style="font-size:15px">${esc(m.subject)}</b><span class="small muted" style="display:block">${esc(m.to)} · ${esc(timeAgo(m.sentAt))}</span></button>`).join('') : '<p class="muted">No emails yet.</p>';
      if (emails[0]) $('#mbView').srcdoc = emails[0].html;
    } catch (err) { $('#mbList').innerHTML = errorHTML(err.status === 404 ? 'The dev mailbox is only available in local development without an email provider.' : err.message); }
    try {
      const sms = (await PawPalAPI.get('/dev/sms')).messages;
      $('#smsList').innerHTML = sms.length ? sms.map((s) => `<div class="card card-pad small"><b>${esc(s.to)}</b> · <span class="muted">${esc(timeAgo(s.sentAt))}</span><p style="margin-top:4px">${esc(s.body)}</p></div>`).join('') : '<p class="muted small">No text messages yet.</p>';
    } catch { $('#smsList').innerHTML = '<p class="muted small">SMS log unavailable (a real SMS provider is configured).</p>'; }
  }
  $('#mbList').addEventListener('click', (e) => { const b = e.target.closest('[data-mail]'); if (b) $('#mbView').srcdoc = emails[b.dataset.mail].html; });
  $('#mbRefresh').addEventListener('click', load);
  $('#mbFilter').addEventListener('change', load);
  load();
})();
