// Full notification history with unread filter and mark-all-read. Works for adopters and staff.
(async () => {
  const { $, $$, noteHTML, emptyHTML, errorHTML, toast } = PawPal;
  await PawPal.booted;
  let list = []; let filter = 'all';
  const render = () => {
    const shown = filter === 'unread' ? list.filter((n) => !n.read) : list;
    $('#nAll').textContent = list.length; $('#nUnread').textContent = list.filter((n) => !n.read).length;
    $('#noteList').innerHTML = shown.length ? shown.map(noteHTML).join('') : `<div class="card-body">${emptyHTML({ icon: 'bell', title: filter === 'unread' ? 'You\'re all caught up' : 'No notifications yet', text: 'We\'ll let you know here when something changes.' })}</div>`;
  };
  async function load() {
    try { list = (await PawPalAPI.get('/notifications', { limit: 200 })).notifications; render(); }
    catch (err) { $('#noteList').innerHTML = `<div class="card-body">${errorHTML(err.message)}</div>`; }
  }
  $$('[data-filter]').forEach((t) => t.addEventListener('click', () => { filter = t.dataset.filter; $$('[data-filter]').forEach((x) => x.setAttribute('aria-selected', String(x === t))); render(); }));
  $('#markAll').addEventListener('click', async () => {
    try { await PawPalAPI.post('/notifications/read-all'); list.forEach((n) => { n.read = true; }); render(); PawPal.loadBell(); toast('All caught up'); }
    catch (err) { toast(err.message, 'error'); }
  });
  load();
})();
