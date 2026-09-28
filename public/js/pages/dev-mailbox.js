// Dev mailbox — shows emails PawPal "sent" when no SMTP server is configured.
(() => {
  const { $, esc, timeAgo } = PawPal;
  let emails = [];
  async function load() {
    try {
      const r = await PawPalAPI.get('/dev/emails', { to: $('#mailFilter').value.trim() });
      emails = r.emails;
      $('#mailList').innerHTML = emails.length ? emails.map((m, i) => `<button class="mail-item" data-i="${i}">
          <span class="mail-type">${esc(m.type.replace('-', ' '))}</span><b>${esc(m.subject)}</b><span>To: ${esc(m.to)}</span><small>${timeAgo(m.sentAt)}</small></button>`).join('')
        : '<div class="pp-empty"><h3>No emails yet</h3><p>Sign up for an account or submit an application and the email will appear here.</p></div>';
    } catch (err) {
      $('#mailbox').innerHTML = `<div class="pp-empty"><h3>Mailbox unavailable</h3><p>${esc(err.message === 'Not available.' ? 'A real email server is configured, so emails are delivered to real inboxes instead.' : err.message)}</p></div>`;
    }
  }
  $('#mailList').addEventListener('click', (e) => {
    const b = e.target.closest('.mail-item');
    if (!b) return;
    document.querySelectorAll('.mail-item').forEach((x) => x.classList.toggle('active', x === b));
    const m = emails[b.dataset.i];
    const frame = document.createElement('iframe');
    frame.title = m.subject;
    frame.className = 'mail-frame';
    frame.sandbox = 'allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation';
    frame.srcdoc = m.html.replace('<head>', '<head><base target="_top">').replace('<html>', '<html><head><base target="_top"></head>');
    $('#mailView').innerHTML = `<div class="mail-meta"><b>${esc(m.subject)}</b><span>To ${esc(m.to)} · ${new Date(m.sentAt).toLocaleString('en-AU')}</span></div>`;
    $('#mailView').appendChild(frame);
  });
  $('#mailRefresh').addEventListener('click', load);
  $('#mailFilter').addEventListener('change', load);
  load();
})();
