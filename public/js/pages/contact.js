// Contact us — enquiry form (posts to the existing /api/contact endpoint),
// shelter contact details and opening hours. Also powers the site-wide
// "Send a message" modal used from the navigation and footer.
(() => {
  const { $, esc, icons, toast, setBusy, hydrateIcons, params } = PawPal;

  const DETAILS = [
    ['phone', 'Shelter line', '(03) 9000 1234', 'tel:0390001234', 'Monday to Sunday, 9am – 5pm'],
    ['mail', 'Email', 'hello@pawpal.example', 'mailto:hello@pawpal.example', 'Replies within one business day'],
    ['pin', 'Shelter address', '14 Ballarat Road, Footscray VIC 3011', null, 'Visits by appointment'],
    ['alert', 'Injured or stray animal', '(03) 9000 1299', 'tel:0390001299', 'Urgent line, staffed 7am – 9pm'],
  ];

  const HOURS = [
    ['Monday – Friday', '9:00am – 5:00pm'],
    ['Saturday', '9:00am – 4:00pm'],
    ['Sunday', '10:00am – 3:00pm'],
    ['Public holidays', 'Closed'],
  ];

  function fill(form) {
    const u = PawPal.user;
    if (!u) return;
    const name = form.querySelector('[id$="Name"]');
    const email = form.querySelector('[id$="Email"]');
    if (name && !name.value) name.value = u.name;
    if (email && !email.value) email.value = u.email;
  }

  async function submit({ name, email, phone, subject, message }) {
    const body = [subject ? `Subject: ${subject}` : '', phone ? `Phone: ${phone}` : '', message]
      .filter(Boolean).join('\n');
    return PawPalAPI.post('/contact', { name, email, message: body });
  }

  const doneHTML = (msg) => `<div class="pp-state pp-state-ok" style="padding:32px 12px">
      <div class="pp-state-ico" data-icon="check"></div>
      <h3>Message sent</h3><p>${esc(msg)}</p>
      <div class="pp-state-actions">
        <a class="pp-btn pp-btn-ghost pp-btn-sm" href="home.html#pets">Keep browsing pets</a>
        <button class="pp-btn pp-btn-soft pp-btn-sm" id="againBtn">Send another message</button>
      </div>
    </div>`;

  // ---------- page form ----------
  function initPage() {
    const form = $('#contactForm');
    if (!form) return;
    const preset = params.get('subject');
    if (preset) {
      const opt = [...$('#cSubject').options].find((o) => o.value.toLowerCase().includes(preset.toLowerCase()));
      if (opt) $('#cSubject').value = opt.value;
    }
    PawPal.ready.then(() => fill(form));

    $('#contactFacts').innerHTML = DETAILS.map(([icon, label, value, href, note]) => `
      <div class="pp-fact">
        <div class="pp-icon-tile" data-icon="${icon}"></div>
        <div><b>${esc(label)}</b>${href ? `<a href="${esc(href)}">${esc(value)}</a>` : `<span>${esc(value)}</span>`}
        <span style="display:block;opacity:.8">${esc(note)}</span></div>
      </div>`).join('');

    $('#hours').innerHTML = HOURS.map(([day, time]) =>
      `<tr><th scope="row">${esc(day)}</th><td>${esc(time)}</td></tr>`).join('');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = {
        name: $('#cName').value.trim(), email: $('#cEmail').value.trim(), phone: $('#cPhone').value.trim(),
        subject: $('#cSubject').value, message: $('#cMsg').value.trim(),
      };
      if (!data.name || !data.email || !data.message) return toast('Please add your name, email and a message.', 'error');
      setBusy($('#cSend'), true, 'Sending…');
      try {
        const r = await submit(data);
        form.hidden = true;
        $('#formDone').hidden = false;
        $('#formDone').innerHTML = doneHTML(r.message || 'An adoption coordinator will reply within one business day.');
        hydrateIcons();
        $('#againBtn').onclick = () => { form.reset(); form.hidden = false; $('#formDone').hidden = true; };
      } catch (err) { toast(err.message, 'error'); }
      setBusy($('#cSend'), false);
    });
    hydrateIcons();
  }

  // ---------- site-wide modal ----------
  function contactModal() {
    const wrap = document.createElement('div');
    wrap.className = 'pp-dialog-backdrop';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-label', 'Send the shelter a message');
    wrap.innerHTML = `<div class="pp-dialog pp-dialog-single" style="position:relative">
        <button class="pp-dialog-close" aria-label="Close">${icons.close}</button>
        <div class="pp-dialog-body">
          <span class="pp-eyebrow">${icons.mail} Contact the shelter</span>
          <h2>Send us a message</h2>
          <p class="pp-small">We reply to every enquiry, usually within one business day.</p>
          <form id="mForm" style="margin-top:18px">
            <div class="pp-field"><label for="mName">Your name</label><input class="pp-input" id="mName" autocomplete="name"/></div>
            <div class="pp-field"><label for="mEmail">Email address</label><input class="pp-input" id="mEmail" type="email" autocomplete="email"/></div>
            <div class="pp-field"><label for="mMsg">Message</label><textarea class="pp-textarea" id="mMsg" style="min-height:96px"></textarea></div>
            <div class="pp-dialog-actions">
              <button class="pp-btn pp-btn-primary" id="mSend" type="submit">${icons.mail} Send message</button>
              <a class="pp-link-btn" href="contact.html">Full contact details</a>
            </div>
          </form>
          <div id="mDone" hidden></div>
        </div>
      </div>`;
    const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('.pp-dialog-close')) close(); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(wrap);
    fill(wrap);
    wrap.querySelector('#mForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = { name: wrap.querySelector('#mName').value.trim(), email: wrap.querySelector('#mEmail').value.trim(),
        message: wrap.querySelector('#mMsg').value.trim() };
      if (!data.name || !data.email || !data.message) return toast('Please add your name, email and a message.', 'error');
      setBusy(wrap.querySelector('#mSend'), true, 'Sending…');
      try {
        const r = await submit(data);
        wrap.querySelector('#mForm').hidden = true;
        const done = wrap.querySelector('#mDone');
        done.hidden = false;
        done.innerHTML = doneHTML(r.message || 'An adoption coordinator will reply within one business day.');
        PawPal.hydrateIcons(done);
        done.querySelector('#againBtn').onclick = close;
      } catch (err) { toast(err.message, 'error'); }
      setBusy(wrap.querySelector('#mSend'), false);
    });
    wrap.querySelector('.pp-dialog-close').focus();
  }

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-contact-modal]')) { e.preventDefault(); contactModal(); }
  });
  document.addEventListener('DOMContentLoaded', initPage);
  window.PawPalContactModal = contactModal;

  // ---------- "who to contact for what" and visit guidance ----------
  const ROUTES = [
    ['alert', 'An animal in danger', 'Do not use the form. Call the urgent line on (03) 9000 1299, or 000 if a person is also at risk.', 'ending-animal-cruelty.html#report', 'Report cruelty'],
    ['clipboard', 'An application you have lodged', 'Status changes are emailed automatically and shown under My Applications — check there first.', 'my-applications.html', 'My applications'],
    ['info', 'How adoption works', 'The three steps from search to adoption, and what each one involves, are set out on the homepage.', 'home.html#how', 'How it works'],
    ['handshake', 'Volunteering or fostering', 'Tell us your availability and which animals you would like to work with, and we will send induction dates.', 'contact.html?subject=Volunteering', 'Enquire about volunteering'],
    ['gift', 'Donating money or goods', 'Money, sponsoring an animal, or dropping off food and bedding during opening hours.', 'ending-animal-cruelty.html#support', 'Donation portal'],
    ['stethoscope', 'Veterinary questions', 'We cannot give clinical advice by email. Find a clinic near you and ring them directly.', 'vet-finder.html', 'Find a vet'],
  ];

  const VISIT = [
    'Bring photo ID and your adoption paperwork if you have it',
    'Bring everyone who lives with you, including children',
    'Allow about 45 minutes so nobody feels rushed',
    'Leave your own pets at home unless staff have asked you to bring them',
    'Wear clothes and shoes you do not mind getting muddy',
    'Let us know in advance if anyone needs step-free access or a quieter time of day',
  ];

  function initExtras() {
    const routes = $('#routeGrid');
    if (routes) {
      routes.innerHTML = ROUTES.map(([icon, title, text, href, label]) => `
        <article class="pp-card pp-card-hover pp-feature" data-reveal>
          <div class="pp-icon-tile" data-icon="${icon}"></div>
          <h3 style="font-size:1.06rem">${esc(title)}</h3>
          <p style="font-size:.92rem">${esc(text)}</p>
          <a class="pp-link-btn" href="${href}">${esc(label)}</a>
        </article>`).join('');
    }
    const visit = $('#visitList');
    if (visit) {
      visit.innerHTML = VISIT.map((t) => `<li>${PawPal.icons.check}<span>${esc(t)}</span></li>`).join('');
    }
    PawPal.hydrateIcons();
    PawPal.reveal();
  }
  document.addEventListener('DOMContentLoaded', initExtras);

})();
