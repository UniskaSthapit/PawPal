// Staff enquiries: reply (emails the adopter) or close.
(async () => {
  const { $, $$, esc, icons, timeAgo, toast, setBusy, emptyHTML, errorHTML } = PawPal;
  await PawPal.booted;
  let filter = 'Open';
  async function load() {
    try {
      const { enquiries, open } = await PawPalAPI.get('/enquiries', { status: filter });
      $('#nOpen').textContent = open;
      $('#enqList').innerHTML = enquiries.length ? enquiries.map((e) => `<article class="card card-pad" data-enq="${esc(e.id)}">
        <div class="row-between"><div class="row"><span class="avatar">${esc(PawPal.initials(e.name))}</span><div><b>${esc(e.name)}</b> asked about <a href="add-pet.html?id=${encodeURIComponent(e.petId)}">${esc(e.petName)}</a><div class="tiny muted">${esc(timeAgo(e.at))}</div></div></div>
          <span class="badge ${e.status === 'Open' ? 'badge-brand' : e.status === 'Answered' ? 'badge-sage' : ''}">${esc(e.status)}</span></div>
        <div class="thread-msg" style="margin-top:12px"><p>${esc(e.message)}</p></div>
        ${e.reply ? `<div class="thread-msg staff" style="margin-top:8px"><div class="who">${esc(e.repliedBy || 'Staff')}<span>${esc(timeAgo(e.repliedAt))}</span></div><p>${esc(e.reply)}</p></div>` : ''}
        ${e.status === 'Open' ? `<form class="stack" style="--stack:8px;margin-top:12px" data-reply="${esc(e.id)}"><label class="sr-only" for="r-${esc(e.id)}">Reply</label><textarea class="textarea" id="r-${esc(e.id)}" style="min-height:80px" maxlength="2000" placeholder="Write your reply — it will be emailed to ${esc(e.name.split(' ')[0])}"></textarea>
          <div class="row"><button class="btn btn-primary btn-sm" type="submit">${icons.send}Send reply</button><button class="btn btn-ghost btn-sm" type="button" data-close="${esc(e.id)}">Close without reply</button></div></form>` : ''}</article>`).join('')
        : emptyHTML({ icon: 'inbox', title: filter === 'Open' ? 'No open enquiries' : 'Nothing here', text: filter === 'Open' ? 'You\'re all caught up.' : '' });
    } catch (err) { $('#enqList').innerHTML = errorHTML(err.message); }
  }
  $('#enqTabs').addEventListener('click', (e) => { const t = e.target.closest('[data-f]'); if (!t) return; filter = t.dataset.f; $$('#enqTabs .tab').forEach((x) => x.setAttribute('aria-selected', String(x === t))); load(); });
  $('#enqList').addEventListener('submit', async (e) => {
    const f = e.target.closest('[data-reply]'); if (!f) return;
    e.preventDefault();
    const reply = f.querySelector('textarea').value.trim(); if (reply.length < 2) return toast('Write a reply first.', 'error');
    const btn = f.querySelector('button[type=submit]'); setBusy(btn, true, 'Sending…');
    try { const r = await PawPalAPI.post(`/enquiries/${encodeURIComponent(f.dataset.reply)}/reply`, { reply }); toast(r.message); load(); } catch (err) { setBusy(btn, false); toast(err.message, 'error'); }
  });
  $('#enqList').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-close]'); if (!b) return;
    try { await PawPalAPI.post(`/enquiries/${encodeURIComponent(b.dataset.close)}/close`); toast('Enquiry closed'); load(); } catch (err) { toast(err.message, 'error'); }
  });
  load();
})();
