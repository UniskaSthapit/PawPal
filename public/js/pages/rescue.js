// Rescue animals page: static content plus the rescue & rehabilitation animals waiting right now.
(async () => {
  const { $, icons, petCardHTML, emptyHTML, errorHTML } = PawPal;
  await PawPal.booted;
  const grid = $('#rescueGrid');
  grid.innerHTML = PawPal.skeletonCards(4);
  try {
    const { pets } = await PawPalAPI.get('/pets', { category: 'rescue', sort: 'newest', limit: 8 });
    grid.innerHTML = pets.length ? pets.map((p, i) => petCardHTML(p, { index: i, compare: true })).join('')
      : emptyHTML({ icon: 'heart', title: 'All our rescue animals have found homes', text: 'New rescue animals arrive every week. Check back soon, or let PawPal suggest other pets that suit you.',
        action: `<a class="btn btn-primary" href="ai-matching.html">${icons.sparkle}Find my PawPal</a>` });
    PawPal.reveal();
  } catch (err) { grid.innerHTML = errorHTML(`We couldn't load rescue animals: ${err.message}`); }
})();
