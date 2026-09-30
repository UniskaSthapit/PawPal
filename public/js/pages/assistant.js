// Shelter assistant: questions answered from the staff member's permitted shelter data.
(async () => {
  const { $, esc, icons, params } = PawPal;
  await PawPal.booted;
  const body = $('#asstBody');
  const add = (html) => { body.insertAdjacentHTML('beforeend', html); body.scrollTop = body.scrollHeight; };
  let busy = false;
  async function ask(q) {
    q = q.trim(); if (!q || busy) return;
    busy = true; $('#asstQ').value = '';
    add(`<div class="msg msg-user">${esc(q)}</div>`);
    add('<div class="msg msg-bot typing" aria-label="Thinking"><i></i><i></i><i></i></div>');
    try {
      const r = await PawPalAPI.post('/ai/shelter', { question: q });
      body.querySelector('.typing')?.remove();
      add(`<div class="msg msg-bot">${esc(r.reply)}</div>${r.items?.length ? `<div class="msg-pets">${r.items.slice(0, 10).map((it) => `<a class="mini-pet" href="${esc(it.link)}" style="grid-template-columns:1fr auto"><div><b>${esc(it.label)}</b><span>${esc(it.sub)}</span></div>${icons.chevronRight}</a>`).join('')}</div>` : ''}
        <div class="msg-meta">${icons.sparkle}${r.source === 'rules' ? 'PawPal rules engine' : r.source === 'anthropic' ? 'Claude' : 'OpenAI'} · your shelter's live data</div>`);
    } catch (err) { body.querySelector('.typing')?.remove(); add(`<div class="msg msg-bot">Sorry — ${esc(err.message)}</div>`); }
    busy = false;
  }
  $('#asstForm').addEventListener('submit', (e) => { e.preventDefault(); ask($('#asstQ').value); });
  $('#asstQ').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask($('#asstQ').value); } });
  $('#asstSuggest').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) ask(b.textContent); });
  if (params.get('q')) ask(params.get('q'));
})();
