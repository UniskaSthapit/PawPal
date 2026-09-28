// ============================================================
// Ending animal cruelty — help numbers, educational content, the
// reporting form, demo news and the cruelty-prevention donation portal.
// All numbers and news items are clearly labelled demo content for this
// university prototype; no real authority is contacted.
// ============================================================
(() => {
  const { $, $$, esc, icons, toast, setBusy, hydrateIcons, reveal } = PawPal;

  // ---------- help numbers ----------
  const LINES = [
    { icon: 'alert', tone: 'pp-icon-tile-solid', label: 'Urgent animal welfare line',
      number: '(03) 9000 1299', href: 'tel:0390001299',
      when: 'Staffed 7am – 9pm, seven days',
      note: 'An animal in immediate danger: locked in a hot vehicle, badly injured, being harmed, or unable to stand.' },
    { icon: 'phone', tone: '', label: 'Shelter enquiries and non-urgent reports',
      number: '(03) 9000 1234', href: 'tel:0390001234',
      when: 'Monday to Sunday, 9am – 5pm',
      note: 'Ongoing neglect, an animal you have been worried about for a while, or advice about a situation.' },
    { icon: 'shield', tone: 'pp-icon-tile-sage', label: 'Police (life-threatening emergencies)',
      number: '000', href: 'tel:000',
      when: 'Always available',
      note: 'Use 000 where a person is also in danger, or where a crime is happening in front of you.' },
  ];

  const REPORT_ITEMS = [
    'The exact address, or the nearest cross-street and a landmark',
    'What you saw, and the date and time you saw it',
    'How many animals are involved, and what kind',
    'The animal\'s condition — weight, injuries, whether it can stand and walk',
    'Whether there is food, clean water and shade or shelter',
    'Photographs or video, only if you can take them safely and legally from public land',
    'Whether you have spoken to the owner, and what they said',
    'Your contact details, so an inspector can call you back for detail — you may also report anonymously',
  ];

  // ---------- what counts as cruelty ----------
  const TYPES = [
    ['box', 'Neglect', 'Failing to provide enough food, clean water, shelter from heat and cold, or a clean living '
      + 'space. This is the single most common form of cruelty, and it is an offence everywhere in Australia.'],
    ['stethoscope', 'Untreated illness or injury', 'Leaving a sick or injured animal without veterinary care — an '
      + 'untreated wound, a severe skin condition, an obvious limp, or an animal clearly in pain.'],
    ['home', 'Abandonment', 'Leaving an animal behind at a property, dumping them somewhere, or tying them up and '
      + 'walking away. Rehoming an animal responsibly is legal; abandoning them is not.'],
    ['users', 'Too many animals at one property', 'Hoarding situations rarely start with bad intent. Two undesexed '
      + 'animals become twenty in a few years, and conditions deteriorate faster than anyone can manage.'],
    ['alert', 'Physical harm', 'Hitting, kicking, throwing, choking, or using equipment in a way that injures. It '
      + 'includes deliberately setting animals to fight each other.'],
    ['sun', 'Animals left in vehicles', 'The inside of a parked car can climb well past 50°C within minutes, even '
      + 'with a window down. A dog can die in that time.'],
  ];

  // ---------- after you report ----------
  const AFTER = [
    ['Your report is logged', 'An operator takes the detail and grades the urgency. Immediate danger is dispatched '
      + 'the same day; ongoing neglect is usually scheduled within a few days.'],
    ['An inspector visits', 'They attend the address, speak to whoever is there, and assess the animals. Most owners '
      + 'let them in, and most are not hostile — many are simply overwhelmed.'],
    ['Advice or a direction is given', 'The usual outcome is practical: get this animal to a vet, build shelter, '
      + 'reduce numbers, desex these animals. Directions carry a deadline.'],
    ['A follow-up visit checks compliance', 'If the direction has been met, the case closes. If it has not, the '
      + 'matter escalates.'],
    ['Animals are seized only if necessary', 'Removal is a last resort, used when an animal cannot safely stay. '
      + 'Seized animals come into shelter care, are treated, and are eventually listed for adoption.'],
    ['Serious cases go to court', 'A small proportion of cases are prosecuted, which can result in fines, a ban on '
      + 'keeping animals, or imprisonment depending on the state and the severity.'],
  ];

  // ---------- warning signs and prevention ----------
  const SIGNS = [
    'Visible ribs, hips or spine on an animal who is not elderly',
    'No shade, shelter or dry bedding in any weather',
    'Water bowl empty, dirty, tipped over or frozen',
    'A wound, limp, lump or eye problem that never gets better',
    'Matted coat, overgrown nails, or a collar grown into the neck',
    'An animal tethered on a short chain for long periods',
    'A dog barking or howling for hours, day after day',
    'Faeces building up in a run, pen or yard',
    'Animals left behind at a property after people appear to have moved out',
  ];

  const PREVENT = [
    ['heart', 'Desexing', 'Desexing prevents the unwanted litters that fill shelters and lead to hoarding situations.'],
    ['dollar', 'Affordable vet care', 'Many owners do not neglect deliberately; they cannot afford the bill. Subsidised '
      + 'treatment keeps animals well and keeps them in their homes.'],
    ['bulb', 'Education before adoption', 'Honest listings that spell out cost, time and lifespan prevent the '
      + 'impulse adoptions that end in surrender.'],
    ['handshake', 'Community support', 'Pet food banks and temporary foster care help people through illness, housing '
      + 'loss and family violence without surrendering their animals.'],
  ];

  // ---------- demo news ----------
  const NEWS = [
    ['Shelter update', '3 days ago', 'Community desexing weekend books out in 40 minutes',
      'All 60 subsidised desexing appointments for our western suburbs weekend were taken within the hour. A second '
      + 'weekend is being scheduled, and the waitlist is open through the contact form.'],
    ['Prevention', '2 weeks ago', 'Twenty-three cats rehomed after a single hoarding case',
      'Every cat removed from one property in June has now been desexed, vaccinated and adopted, including Mochi and '
      + 'her five kittens. The owner is receiving ongoing support rather than prosecution.'],
    ['Education', 'Last month', 'Hot car campaign reaches nine primary schools',
      'Our outreach volunteers ran 45-minute sessions on why a parked car becomes dangerous within minutes, and what '
      + 'a child should do if they see an animal shut inside one.'],
  ];

  const FUNDS = [
    ['$25', 'emergency food and bedding for an animal seized overnight'],
    ['$75', 'a veterinary assessment for a neglected animal on intake'],
    ['$150', 'one subsidised desexing through the community programme'],
    ['$400', 'a week of treatment and foster care for a recovering animal'],
  ];

  const AMOUNTS = [[35, 'Emergency care pack'], [75, 'A vet assessment'], [150, 'A community desexing']];
  let amount = 75;

  // ---------- render ----------
  function renderAmounts() {
    $('#cAmounts').innerHTML = AMOUNTS.map(([v, note]) => `
      <button class="pp-amount ${v === amount ? 'is-on' : ''}" data-amt="${v}">$${v}<small>${esc(note)}</small></button>`).join('');
    $('#cAmt').textContent = `$${amount}`;
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('#helpLines').innerHTML = LINES.map((l) => `
      <article class="help-line" data-reveal>
        <div class="pp-icon-tile pp-icon-tile-lg ${l.tone}" data-icon="${l.icon}"></div>
        <span class="help-line-label">${esc(l.label)}</span>
        <a class="help-line-number" href="${esc(l.href)}">${esc(l.number)}</a>
        <span class="pp-chip pp-chip-sage" data-icon="clock">${esc(l.when)}</span>
        <p>${esc(l.note)}</p>
      </article>`).join('');

    $('#reportList').innerHTML = REPORT_ITEMS.map((t) => `<li>${icons.check}<span>${esc(t)}</span></li>`).join('');
    $('#signsList').innerHTML = SIGNS.map((t) => `<li>${icons.eye}<span>${esc(t)}</span></li>`).join('');

    $('#typesGrid').innerHTML = TYPES.map(([icon, title, text]) => `
      <article class="pp-card pp-card-hover pp-feature" data-reveal>
        <div class="pp-icon-tile" data-icon="${icon}"></div>
        <h3>${esc(title)}</h3><p>${esc(text)}</p>
      </article>`).join('');

    $('#afterSteps').innerHTML = AFTER.map(([title, text]) => `
      <li class="pp-step" data-reveal><h3>${esc(title)}</h3><p>${esc(text)}</p></li>`).join('');

    $('#preventGrid').innerHTML = PREVENT.map(([icon, title, text]) => `
      <article class="pp-card pp-feature" data-reveal>
        <div class="pp-icon-tile pp-icon-tile-sage" data-icon="${icon}"></div>
        <h3 style="font-size:1.05rem">${esc(title)}</h3><p style="font-size:.9rem">${esc(text)}</p>
      </article>`).join('');

    $('#newsGrid').innerHTML = NEWS.map(([tag, when, title, text]) => `
      <article class="pp-card pp-card-hover news-card" data-reveal>
        <div class="news-meta"><span class="pp-chip pp-chip-gold">${esc(tag)}</span><span class="pp-small">${esc(when)}</span></div>
        <h3>${esc(title)}</h3><p>${esc(text)}</p>
      </article>`).join('');

    $('#fundList').innerHTML = FUNDS.map(([amt, what]) =>
      `<li>${icons.check}<span><strong>${esc(amt)}</strong> — ${esc(what)}</span></li>`).join('');

    renderAmounts();

    // ---------- donation portal ----------
    $('#cAmounts').addEventListener('click', (e) => {
      const btn = e.target.closest('.pp-amount');
      if (!btn) return;
      amount = Number(btn.dataset.amt);
      $('#cOwn').value = '';
      renderAmounts();
    });
    $('#cOwn').addEventListener('input', (e) => {
      const v = Number(e.target.value);
      if (v > 0) { amount = v; $$('.pp-amount').forEach((b) => b.classList.remove('is-on')); $('#cAmt').textContent = `$${v}`; }
    });
    $('#cGive').addEventListener('click', () => {
      const match = AMOUNTS.filter(([v]) => v <= amount).slice(-1)[0];
      $('#portalCard').querySelectorAll('.pp-amounts, .pp-field, #cGive').forEach((el) => { el.hidden = true; });
      const done = $('#cDone');
      done.hidden = false;
      done.innerHTML = `<div class="pp-state pp-state-ok" style="padding:18px 0">
          <div class="pp-state-ico" data-icon="heart"></div>
          <h3>Thank you</h3>
          <p>A $${amount} donation would fund ${esc(match ? match[1].toLowerCase() : 'emergency care')} for an animal
             coming out of a cruelty case. No payment has been taken — this is a prototype.</p>
          <div class="pp-state-actions">
            <a class="pp-btn pp-btn-primary pp-btn-sm" href="home.html#stories">Read our rescue stories</a>
            <button class="pp-btn pp-btn-ghost pp-btn-sm" id="cAgain">Change amount</button>
          </div>
        </div>`;
      hydrateIcons(done);
      done.querySelector('#cAgain').onclick = () => location.reload();
    });

    // ---------- written report ----------
    $('#reportForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const where = $('#rWhere').value.trim();
      const what = $('#rWhat').value.trim();
      if (!where || !what) return toast('Please tell us where the animal is and what you have seen.', 'error');
      setBusy($('#rSend'), true, 'Submitting…');
      const body = [`CRUELTY REPORT (demo)`, `Location: ${where}`, `Concern: ${$('#rType').value}`,
        $('#rContact').value.trim() ? `Reporter contact: ${$('#rContact').value.trim()}` : 'Reporter: anonymous',
        '', what].join('\n');
      try {
        await PawPalAPI.post('/contact', {
          name: $('#rContact').value.trim() ? 'Cruelty report' : 'Anonymous cruelty report',
          email: 'reports@pawpal.example', message: body,
        });
        $('#reportForm').hidden = true;
        const done = $('#reportDone');
        done.hidden = false;
        done.innerHTML = `<div class="pp-state pp-state-ok" style="padding:24px 0">
            <div class="pp-state-ico" data-icon="check"></div>
            <h3>Report received</h3>
            <p>Your report has been logged with the shelter team. If the animal is in immediate danger, please also
               call the urgent line on (03) 9000 1299 rather than waiting for a written response.</p>
            <div class="pp-state-actions">
              <a class="pp-btn pp-btn-ghost pp-btn-sm" href="#report">Submit another report</a>
            </div>
          </div>`;
        hydrateIcons(done);
      } catch (err) { toast(err.message, 'error'); }
      setBusy($('#rSend'), false);
    });

    hydrateIcons();
    reveal();
  });
})();
