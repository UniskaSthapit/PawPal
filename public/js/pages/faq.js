// FAQ page: questions from /api/faq (the same answers the assistant uses), with search and deep links.
(async () => {
  const { $, $$, esc, icons } = PawPal;
  await PawPal.booted;
  let faq = [];
  const render = (q = '') => {
    const t = q.trim().toLowerCase();
    const list = t ? faq.filter((f) => `${f.q} ${f.a}`.toLowerCase().includes(t)) : faq;
    $('#faqList').innerHTML = list.map((f) => `<details id="${esc(f.id)}"><summary>${esc(f.q)}<span class="pm">${icons.plus}</span></summary><p>${esc(f.a)}</p></details>`).join('');
    $('#faqEmpty').hidden = list.length > 0;
  };
  try { faq = (await PawPalAPI.get('/faq')).faq; render(); }
  catch (err) { $('#faqList').innerHTML = PawPal.errorHTML('We couldn\'t load the questions right now. Please refresh the page.'); return; }
  $('#faqQ').addEventListener('input', (e) => render(e.target.value));
  const target = location.hash && document.getElementById(location.hash.slice(1));
  if (target) { target.open = true; target.scrollIntoView(); }
  $$('#faqList details').length && $('#faqList details').setAttribute('open', '');
})();
