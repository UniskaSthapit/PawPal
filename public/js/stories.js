// ============================================================
// RESCUE STORIES
// Six fictional demo rescue stories, written for this university
// prototype. They are labelled as demo content wherever they appear and
// do not describe real animals, people or organisations.
//
// Any page can render them:
//   <div class="stories-grid" data-stories="3"></div>
// Cards show an excerpt; "Read the full story" opens a dialog.
// ============================================================
(() => {
  const STORIES = [
    {
      id: 'biscuit',
      name: 'Biscuit',
      title: 'Found tied to a fence, now the loudest snorer in Grandville',
      species: 'Dog',
      when: 'Rescued 14 months ago',
      outcome: 'Adopted',
      tags: ['Neglect case', 'Golden Retriever', 'Rehomed in 9 weeks'],
      photo: 'https://images.unsplash.com/photo-1591160690555-5debfba289f0?w=900&h=620&fit=crop&auto=format&q=80',
      art: 'images/pets/dog-c.svg',
      excerpt: 'A council ranger found Biscuit tied to a fence behind a closed shopping strip, underweight and with no '
        + 'collar. Nine weeks of care later, he went home with a family who had been waiting for a big, gentle dog.',
      body: [
        'A council ranger called the shelter on a Tuesday morning about a dog tied to a fence behind a closed shopping '
        + 'strip. He had been there overnight. No collar, no microchip, about eight kilos underweight, and so quiet '
        + 'that two people had walked past assuming he belonged to someone inside.',
        'Our veterinary liaison arranged a full health check that afternoon. Biscuit needed a dental procedure, '
        + 'treatment for a skin infection and, more than anything, food and rest. For the first fortnight he stayed '
        + 'with a foster carer, because a kennel is a frightening place for a dog who has already been left somewhere '
        + 'and abandoned.',
        'What surprised everyone was his temperament. Dogs who arrive that way are often wary of hands and sudden '
        + 'noise. Biscuit leaned into every person who sat down near him, and within days he was carrying a soft toy '
        + 'around the foster house like a trophy. Our care specialist wrote one line in his notes: "wants to be '
        + 'near people, all of the time."',
        'He was listed on PawPal at nine weeks, and a family who had been checking the site every Sunday for a large, '
        + 'gentle dog applied the same evening. They met on the Saturday. Biscuit fell asleep on the visit-room floor '
        + 'while the paperwork was being explained, which the coordinator took as a decision.',
        'His family send updates. He has learned to catch a ball about half the time, he snores loudly enough to be '
        + 'heard from the next room, and nobody has ever seen him alone in a room by choice.',
      ],
    },
    {
      id: 'mochi',
      name: 'Mochi',
      title: 'Arrived with five kittens and a deep distrust of everything',
      species: 'Cat',
      when: 'Rescued 8 months ago',
      outcome: 'All six adopted',
      tags: ['Hoarding case', 'Foster care', 'Six adoptions'],
      photo: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=900&h=620&fit=crop&auto=format&q=80',
      art: 'images/pets/cat-a.svg',
      excerpt: 'Mochi came out of a house with twenty-three other cats, pregnant and terrified. She raised five '
        + 'kittens in foster care, and all six of them now live in homes of their own.',
      body: [
        'Mochi was one of twenty-three cats removed from a single property. The owner had not set out to cause harm — '
        + 'two unneutered cats had become twenty-three in under three years, and by the time anyone intervened the '
        + 'house was beyond managing. That is what most hoarding cases look like: not cruelty, but a situation that '
        + 'outgrew somebody quietly.',
        'She was pregnant on arrival and frightened of open space. Our shelter manager placed her with an experienced '
        + 'foster carer the same day, in a quiet room with a covered bed and no expectations. She gave birth to five '
        + 'kittens eleven days later.',
        'For six weeks Mochi would not let anyone touch her while the kittens fed. The foster carer sat in the room '
        + 'each evening and read aloud, which sounds sentimental but is simply how a cat learns that a person in the '
        + 'room is not an event. By week seven, Mochi was headbutting her hand for attention.',
        'The kittens were vaccinated, desexed and listed together, and all five were adopted within a month — kittens '
        + 'usually are. Mochi took longer, as adult cats from hoarding situations often do, because her profile said '
        + 'honestly that she needed a calm adult home and time to settle.',
        'She went home with a retired couple who had specifically asked for a cat who would take a while to trust '
        + 'them. Eight months on, she sleeps on the back of their sofa and supervises the garden through the window.',
      ],
    },
    {
      id: 'coco',
      name: 'Coco',
      title: 'The Easter rabbit nobody had planned for',
      species: 'Rabbit',
      when: 'Rescued 5 months ago',
      outcome: 'Adopted',
      tags: ['Impulse purchase', 'Rabbit care', 'Rehomed in 6 weeks'],
      photo: 'https://images.unsplash.com/photo-1585110396000-c9ffd4e4b308?w=900&h=620&fit=crop&auto=format&q=80',
      art: 'images/pets/rabbit-a.svg',
      excerpt: 'Bought as an Easter present, surrendered by June. Coco is the reason our rabbit profiles now spell out '
        + 'exactly how much work a rabbit is — and she found the right home because of it.',
      body: [
        'Coco arrived in June, which is the season for surrendered rabbits. She had been bought at Easter for a child '
        + 'who loved her, in a household that had not realised rabbits live eight to twelve years, need several hours '
        + 'out of their enclosure daily, and produce a great deal of mess for something so small.',
        'To be fair to the family, they did the right thing in the end: they rang the shelter, brought her in with her '
        + 'enclosure and hay, and answered every question honestly. Our intake notes recorded that she was litter '
        + 'trained, healthy, and completely unbothered by being handled.',
        'What she needed was not rehabilitation but an accurate listing. Our care specialist spent a week with her and '
        + 'wrote a profile that said plainly what a rabbit costs in time: daily fresh hay and vegetables, regular '
        + 'nail trims, a rabbit-savvy vet, and floor time every single day.',
        'That honesty filtered the applications down from eleven to three, which is exactly what it is supposed to do. '
        + 'The family who adopted her had kept rabbits before and had already booked a vet who sees them.',
        'Coco now has a run in a converted spare room and rearranges her hay every night. Her profile is also the '
        + 'reason every rabbit on PawPal carries a "special needs" line about daily care — a small change that came '
        + 'directly from her file.',
      ],
    },
    {
      id: 'nibbles', name: 'Nibbles', title: 'The hamster who escaped a flooded garage', species: 'Hamster', when: 'Rescued 8 months ago', outcome: 'Adopted',
      tags: ['Small animal', 'Syrian hamster', 'Rehomed in 3 weeks'],
      photo: 'https://images.unsplash.com/photo-1425082661705-1834bfd09dca?w=900&h=620&fit=crop&auto=format&q=80', art: 'images/pets/small-a.svg',
      excerpt: 'After a storm, Nibbles was found in a soggy cage in a neighbour\'s garage, cold and very hungry. A week of warmth and a proper burrow later, he was stuffing his cheeks like nothing had happened.',
      body: ['Neighbours heard scratching in a flooded garage and found a cage lifted onto a shelf, the bedding soaked through. Nibbles was cold, thin and hiding in a cardboard tube.',
        'He spent a week in a warm foster room with deep bedding, and a wheel that he ignored until day five, when he ran on it all night. A student who had always wanted a hamster adopted him and sends photos of his cheeks stuffed with sunflower seeds.'] },
    {
      id: 'juniper', name: 'Juniper', title: 'A shy tabby who chose her person', species: 'Cat', when: 'Rescued 11 months ago', outcome: 'Adopted',
      tags: ['Stray', 'Tabby', 'Rehomed in 6 weeks'],
      photo: 'https://images.unsplash.com/photo-1574158622682-e40e69881006?w=900&h=620&fit=crop&auto=format&q=80', art: 'images/pets/cat-c.svg',
      excerpt: 'Juniper lived behind a bakery for a winter before a kind worker started leaving out food. She wouldn\'t be touched for a month, and then one afternoon she climbed into a lap and stayed.',
      body: ['A baker noticed a thin tabby sheltering by the bins and left out food each morning. After weeks of patience she was finally coaxed into a carrier.',
        'At the shelter Juniper hid for days. Volunteers simply sat quietly nearby until she came out. She chose her adopter by curling up on her jacket at the first visit, and now spends her days asleep in a sunny window.'] },
    {
      id: 'kiwi', name: 'Kiwi', title: 'The budgie who learned to whistle again', species: 'Bird', when: 'Rescued 5 months ago', outcome: 'Adopted',
      tags: ['Surrendered', 'Budgerigar', 'Rehomed in 5 weeks'],
      photo: 'images/pets/bird-b.svg', art: 'images/pets/bird-b.svg',
      excerpt: 'Kiwi was surrendered when her elderly owner moved into care. She had stopped singing entirely. With company, sunshine and a lot of patient whistling, the songs came back.',
      body: ['Kiwi\'s owner of nine years moved into aged care and could not take her. She arrived quiet and fluffed up, and refused to sing.',
        'Our carers played soft recordings and whistled to her daily. In the third week she answered back. She now lives with a retired teacher who whistles good morning, and Kiwi whistles it right back.'] }
  ];

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function cardHTML(s) {
    return `<article class="story-card">
      <div class="pp-media pp-media-hover story-media">
        <img src="${esc(s.photo)}" alt="${esc(s.name)}, a rescued ${esc(s.species.toLowerCase())}" loading="lazy"
             onerror="this.onerror=null;this.src='${esc(s.art)}'"/>
        <span class="pp-media-tag" data-icon="check">${esc(s.outcome)}</span>
      </div>
      <div class="story-body">
        <span class="story-when" data-icon="calendar">${esc(s.when)}</span>
        <h3>${esc(s.title)}</h3>
        <p>${esc(s.excerpt)}</p>
        <div class="story-tags">${s.tags.map((t) => `<span class="pp-chip">${esc(t)}</span>`).join('')}</div>
        <button class="pp-link-btn" data-story="${esc(s.id)}">Read ${esc(s.name)}'s full story</button>
      </div>
    </article>`;
  }

  function openStory(id) {
    const s = STORIES.find((x) => x.id === id);
    if (!s) return;
    const icons = (typeof PawPal !== 'undefined' && PawPal.icons) || {};
    const wrap = document.createElement('div');
    wrap.className = 'pp-dialog-backdrop';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-label', `${s.name}'s rescue story`);
    wrap.innerHTML = `<div class="pp-dialog story-dialog">
        <div class="pp-dialog-art story-dialog-art">
          <img src="${esc(s.photo)}" alt="" onerror="this.onerror=null;this.src='${esc(s.art)}'"/>
          <button class="pp-dialog-close" aria-label="Close story">${icons.close || '&times;'}</button>
        </div>
        <div class="pp-dialog-body">
          <span class="pp-eyebrow">${icons.paw || ''} Rescue story · ${esc(s.when)}</span>
          <h2>${esc(s.title)}</h2>
          <div class="story-tags" style="margin:12px 0 16px">${s.tags.map((t) => `<span class="pp-chip">${esc(t)}</span>`).join('')}</div>
          ${s.body.map((para) => `<p style="margin-bottom:12px">${esc(para)}</p>`).join('')}
          <p class="pp-dialog-note">Demo story written for this university prototype. It does not describe a real
             animal, person or organisation.</p>
          <div class="pp-dialog-actions">
            <a class="pp-btn pp-btn-primary" href="home.html#pets">Meet pets waiting now</a>
            <a class="pp-btn pp-btn-ghost" href="ending-animal-cruelty.html#support">Support the shelter</a>
          </div>
        </div>
      </div>`;
    const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('.pp-dialog-close')) close(); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(wrap);
    if (typeof PawPal !== 'undefined') PawPal.hydrateIcons(wrap);
    wrap.querySelector('.pp-dialog-close').focus();
  }

  // Horizontal carousel: arrow buttons + gentle auto-scroll while in view (paused on hover/focus/touch, off for reduced motion)
  function carousel(host) {
    if (host.dataset.carousel) return;
    host.dataset.carousel = '1';
    host.tabIndex = 0; host.setAttribute('role', 'region'); host.setAttribute('aria-label', 'Rescue stories carousel');
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const nav = document.createElement('div');
    nav.className = 'stories-nav';
    nav.innerHTML = '<button type="button" aria-label="Previous stories">&#8249;</button><button type="button" aria-label="Next stories">&#8250;</button>';
    host.after(nav);
    const go = (d) => host.scrollBy({ left: d * (Math.min(360, host.clientWidth * 0.85) + 24), behavior: still ? 'auto' : 'smooth' });
    nav.children[0].onclick = () => go(-1); nav.children[1].onclick = () => go(1);
    if (still) return;
    let inView = false, paused = false, looping = false, pos = 0, dir = 1;
    const tick = () => {
      if (!inView) { looping = false; return; }
      if (!paused) {
        const max = host.scrollWidth - host.clientWidth;
        pos += 0.6 * dir;
        if (pos >= max) { pos = max; dir = -1; } else if (pos <= 0) { pos = 0; dir = 1; }
        host.scrollLeft = pos;
      }
      requestAnimationFrame(tick);
    };
    const hold = () => { paused = true; }, free = () => { pos = host.scrollLeft; paused = false; };
    ['pointerenter', 'focusin', 'touchstart'].forEach((ev) => host.addEventListener(ev, hold, { passive: true }));
    ['pointerleave', 'focusout', 'touchend'].forEach((ev) => host.addEventListener(ev, free, { passive: true }));
    new IntersectionObserver(([e]) => { inView = e.isIntersecting; if (inView && !looping) { looping = true; pos = host.scrollLeft; requestAnimationFrame(tick); } }, { threshold: 0.35 }).observe(host);
  }

  function render() {
    document.querySelectorAll('[data-stories]').forEach((host) => {
      const limit = Number(host.dataset.stories) || STORIES.length;
      host.innerHTML = STORIES.slice(0, limit).map(cardHTML).join('');
      if (typeof PawPal !== 'undefined') { PawPal.hydrateIcons(host); PawPal.reveal(host); }
      carousel(host);
    });
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-story]');
    if (btn) { e.preventDefault(); openStory(btn.dataset.story); }
  });
  document.addEventListener('DOMContentLoaded', render);
  window.PawPalStories = { STORIES, render, openStory };
})();
