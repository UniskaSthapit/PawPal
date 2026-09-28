// ============================================================
// ui.js — shared layout and helpers used by every page
// Renders the navigation, sidebars and footer, knows who is logged in,
// and provides toasts, dialogs and formatting helpers.
// ============================================================
const PawPal = (() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const params = new URLSearchParams(location.search);
  const page = location.pathname.split('/').pop() || 'home.html';

  // ---------- formatting ----------
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
  const fmtDateTime = (iso) => (iso ? new Date(iso).toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—');
  const timeAgo = (iso) => {
    const s = Math.round((Date.now() - new Date(iso)) / 1000);
    if (s < 60) return 'just now';
    const m = Math.round(s / 60); if (m < 60) return `${m} min ago`;
    const h = Math.round(m / 60); if (h < 24) return `${h} hr${h > 1 ? 's' : ''} ago`;
    const d = Math.round(h / 24); if (d < 7) return `${d} day${d > 1 ? 's' : ''} ago`;
    return fmtDate(iso);
  };
  const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
  const ageText = (age) => (age === 0 ? 'Under 1 year' : `${age} year${age === 1 ? '' : 's'}`);
  const PLACEHOLDER = 'images/pet-placeholder.svg';
  const photo = (pet, i = 0) => (pet?.photos && pet.photos[i]) || pet?.petPhoto || PLACEHOLDER;

  // ---------- icons ----------
  const svg = (paths, extra = '') => `<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true" ${extra}>${paths}</svg>`;
  const icons = {
    heart: svg('<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>'),
    pin: svg('<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>'),
    chevron: svg('<polyline points="6 9 12 15 18 9"/>', 'stroke-width="2.5"'),
    bell: svg('<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>'),
    grid: svg('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>'),
    smile: svg('<path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2z"/><path d="M8 9a1 1 0 1 0 2 0A1 1 0 0 0 8 9zm6 0a1 1 0 1 0 2 0A1 1 0 0 0 14 9zm-7 6s1.5 2 5 2 5-2 5-2"/>'),
    file: svg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>'),
    chart: svg('<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>'),
    gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'),
    pulse: svg('<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>'),
    user: svg('<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>'),
    logout: svg('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>'),
    sparkle: svg('<path d="M12 3l1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2z"/>'),
    home: svg('<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>'),
    menu: svg('<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>'),
    close: svg('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'),
    check: svg('<polyline points="20 6 9 17 4 12"/>', 'stroke-width="3"'),
    instagram: svg('<rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/>'),
    facebook: svg('<path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>'),
    // ---- extended icon set (polish pass) ----
    // Outline icons on a 24x24 grid, sized with CSS. These replace every emoji
    // that used to stand in for an interface icon.
    paw: svg('<ellipse cx="12" cy="15.5" rx="4.2" ry="3.4"/><ellipse cx="6.2" cy="10.6" rx="2" ry="2.6"/><ellipse cx="10" cy="7.4" rx="2" ry="2.7"/><ellipse cx="14" cy="7.4" rx="2" ry="2.7"/><ellipse cx="17.8" cy="10.6" rx="2" ry="2.6"/>'),
    dog: svg('<path d="M4.5 8.5 3 4l4.5 2"/><path d="M19.5 8.5 21 4l-4.5 2"/><path d="M5 10a7 7 0 0 1 14 0v3a7 7 0 0 1-14 0z"/><circle cx="9.5" cy="11" r=".9" fill="currentColor"/><circle cx="14.5" cy="11" r=".9" fill="currentColor"/><path d="M12 14v1.6M10.4 17c.8.7 2.4.7 3.2 0"/>'),
    cat: svg('<path d="M4 9 4.5 4 9 7"/><path d="M20 9 19.5 4 15 7"/><path d="M4 11a8 8 0 0 1 16 0v2a8 8 0 0 1-16 0z"/><circle cx="9.5" cy="12" r=".9" fill="currentColor"/><circle cx="14.5" cy="12" r=".9" fill="currentColor"/><path d="M12 14.5v1M3 13h3M18 13h3"/>'),
    rabbit: svg('<path d="M8.5 9C7.5 6 7.8 3 9 3s1.8 3 1.4 6"/><path d="M15.5 9c1-3 .7-6-.5-6s-1.8 3-1.4 6"/><path d="M5.5 14.5a6.5 6.5 0 0 1 13 0v.5a6.5 6.5 0 0 1-13 0z"/><circle cx="10" cy="14" r=".9" fill="currentColor"/><circle cx="14" cy="14" r=".9" fill="currentColor"/><path d="M12 16.5v1"/>'),
    bird: svg('<path d="M16 5.5a3.5 3.5 0 1 0-7 0c0 4-4 4.5-4 8.5a6 6 0 0 0 12 0c0-2 2-3.5 2-6.5"/><circle cx="14.5" cy="6" r=".9" fill="currentColor"/><path d="M9 5 5.5 6.5 9 8"/><path d="M10 20v1.5M14 20v1.5"/>'),
    fish: svg('<path d="M3 12c3-4.5 7.5-6 11-4.5 2.5 1 4 3 4.6 4.5-.6 1.5-2.1 3.5-4.6 4.5C11 18 6 16.5 3 12z"/><path d="M18.6 12 22 8.5v7z"/><circle cx="8" cy="11" r=".9" fill="currentColor"/>'),
    reptile: svg('<path d="M4 13a8 8 0 0 1 16 0"/><path d="M4 13h16c0 2.5-3.6 4-8 4s-8-1.5-8-4z"/><path d="M6 17.5 4.5 20M18 17.5 19.5 20"/><circle cx="10" cy="10" r=".9" fill="currentColor"/><circle cx="14" cy="10" r=".9" fill="currentColor"/>'),
    building: svg('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2M10 21v-3h4v3"/>'),
    tree: svg('<path d="M12 3 5 11h4l-3 5h5v5h2v-5h5l-3-5h4z"/>'),
    clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>'),
    briefcase: svg('<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 12h18"/>'),
    users: svg('<circle cx="9" cy="8" r="3.2"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M16 5.2a3.2 3.2 0 0 1 0 6.1M17.5 20a6 6 0 0 0-2.2-4.6"/>'),
    child: svg('<circle cx="12" cy="6" r="3"/><path d="M12 9v6M8 12h8M9 21l3-4 3 4"/>'),
    alert: svg('<path d="M12 3 2.5 20h19z"/><path d="M12 9v5M12 17h.01"/>'),
    info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 8h.01"/>'),
    search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
    filter: svg('<path d="M3 5h18l-7 8v6l-4-2v-4z"/>'),
    mail: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6.5 8.5 6 8.5-6"/>'),
    phone: svg('<path d="M6 3h3l2 5-2.5 1.5a11 11 0 0 0 5 5L15 12l5 2v3a2 2 0 0 1-2.2 2A15 15 0 0 1 4 5.2 2 2 0 0 1 6 3z"/>'),
    calendar: svg('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
    stethoscope: svg('<path d="M6 3v5a4 4 0 0 0 8 0V3"/><path d="M6 3H4M14 3h2M10 12v3a4 4 0 0 0 8 0v-1"/><circle cx="18" cy="11" r="2"/>'),
    shield: svg('<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="m9 12 2 2 4-4"/>'),
    star: svg('<path d="m12 3.5 2.7 5.6 6.1.8-4.5 4.3 1.2 6.1-5.5-3-5.5 3 1.2-6.1L3.2 9.9l6.1-.8z"/>'),
    gift: svg('<rect x="3" y="8" width="18" height="13" rx="2"/><path d="M3 12h18M12 8v13"/><path d="M8.5 8a2.5 2.5 0 1 1 1.8-4.2C11.4 4.9 12 8 12 8s.6-3.1 1.7-4.2A2.5 2.5 0 1 1 15.5 8"/>'),
    trendUp: svg('<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>'),
    trendDown: svg('<path d="m3 7 6 6 4-4 8 8"/><path d="M15 17h6v-6"/>'),
    edit: svg('<path d="M4 20h4L20 8l-4-4L4 16z"/><path d="m14 6 4 4"/>'),
    trash: svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/>'),
    eye: svg('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>'),
    download: svg('<path d="M12 3v12M7.5 10.5 12 15l4.5-4.5"/><path d="M4 20h16"/>'),
    upload: svg('<path d="M12 21V9M7.5 13.5 12 9l4.5 4.5"/><path d="M4 4h16"/>'),
    camera: svg('<rect x="3" y="7" width="18" height="13" rx="2"/><circle cx="12" cy="13.5" r="3.5"/><path d="M9 7l1.2-2.5h3.6L15 7"/>'),
    play: svg('<circle cx="12" cy="12" r="9"/><path d="m10 8.5 6 3.5-6 3.5z"/>'),
    plus: svg('<path d="M12 5v14M5 12h14"/>'),
    arrowRight: svg('<path d="M4 12h15M13 6l6 6-6 6"/>'),
    external: svg('<path d="M14 4h6v6M20 4 11 13"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'),
    dollar: svg('<path d="M12 3v18"/><path d="M16.5 7.5A3.5 3.5 0 0 0 13 5h-2a3 3 0 0 0 0 6h2.5a3 3 0 0 1 0 6H11a3.5 3.5 0 0 1-3.5-2.5"/>'),
    handshake: svg('<path d="m3 12 4-4 5 2 5-2 4 4-4 5-5-3-5 3z"/>'),
    bulb: svg('<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 1 3.5 10.9V16h-7v-2.1A6 6 0 0 1 12 3z"/>'),
    clipboard: svg('<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2.8h6V4M8.5 10h7M8.5 14h7M8.5 18h4"/>'),
    box: svg('<path d="m3 8 9-5 9 5v8l-9 5-9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>'),
    sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19"/>'),
    linkedin: svg('<path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/>'),
  };

  // ---------- status + score badges ----------
  const STATUS_CLASS = { Pending: 'badge-pending', Shortlisted: 'badge-shortlisted', 'Visit Scheduled': 'badge-visit',
    Approved: 'badge-approved', Rejected: 'badge-rejected', Adopted: 'badge-adopted', Withdrawn: 'badge-withdrawn',
    Available: 'badge-approved', 'Pending Adoption': 'badge-visit', Draft: 'badge-withdrawn' };
  const statusBadge = (s) => `<span class="badge ${STATUS_CLASS[s] || 'badge-pending'}">${esc(s)}</span>`;
  const scoreBadge = (n) => `<span class="badge ${n >= 80 ? 'score-high' : n >= 60 ? 'score-mid' : 'score-low'}" title="AI suitability score">${n}</span>`;

  // ---------- toasts ----------
  function toast(message, type = 'success') {
    let wrap = $('#toastWrap');
    if (!wrap) { wrap = document.createElement('div'); wrap.id = 'toastWrap'; wrap.className = 'toast-wrap'; wrap.setAttribute('aria-live', 'polite'); document.body.appendChild(wrap); }
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.innerHTML = `<span class="toast-dot"></span><span>${esc(message)}</span>`;
    wrap.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, type === 'error' ? 5200 : 3400);
  }

  // ---------- dialogs ----------
  function modal({ title, body, actions = [], wide = false, onOpen }) {
    return new Promise((resolve) => {
      const back = document.createElement('div');
      back.className = 'pp-modal-back';
      back.innerHTML = `<div class="pp-modal ${wide ? 'pp-modal-wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="ppModalTitle">
        <div class="pp-modal-head"><h2 id="ppModalTitle">${esc(title)}</h2>
          <button class="pp-icon-btn" data-close aria-label="Close">${icons.close}</button></div>
        <div class="pp-modal-body">${body}</div>
        ${actions.length ? `<div class="pp-modal-actions">${actions.map((a, i) =>
    `<button class="pp-btn ${a.variant || 'pp-btn-ghost'}" data-action="${i}">${esc(a.label)}</button>`).join('')}</div>` : ''}
      </div>`;
      const prevFocus = document.activeElement;
      const close = (value) => {
        back.classList.remove('show');
        document.removeEventListener('keydown', onKey);
        setTimeout(() => back.remove(), 200);
        prevFocus?.focus?.();
        resolve(value);
      };
      const onKey = (e) => { if (e.key === 'Escape') close(null); };
      back.addEventListener('click', async (e) => {
        if (e.target === back || e.target.closest('[data-close]')) return close(null);
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const action = actions[btn.dataset.action];
        if (action.onClick) {
          const keepOpen = await action.onClick(back, btn);
          if (keepOpen === false) return;
        }
        close(action.value ?? true);
      });
      document.addEventListener('keydown', onKey);
      document.body.appendChild(back);
      requestAnimationFrame(() => back.classList.add('show'));
      onOpen?.(back, close);
      setTimeout(() => ($('input,textarea,select,[data-action]', back) || $('[data-close]', back))?.focus(), 60);
    });
  }

  const confirmDialog = ({ title, message, confirmText = 'Confirm', danger = false }) =>
    modal({ title, body: `<p class="pp-modal-text">${esc(message)}</p>`,
      actions: [{ label: 'Cancel', value: false }, { label: confirmText, variant: danger ? 'pp-btn-danger' : 'pp-btn-primary', value: true }] })
      .then((v) => v === true);

  function setBusy(btn, busy, label) {
    if (!btn) return;
    if (busy) { btn.dataset.label = btn.innerHTML; btn.disabled = true; btn.classList.add('is-busy'); btn.innerHTML = `<span class="pp-spinner"></span>${esc(label || 'Please wait…')}`; }
    else { btn.disabled = false; btn.classList.remove('is-busy'); if (btn.dataset.label) btn.innerHTML = btn.dataset.label; }
  }

  // ---------- favourites (saved in this browser) ----------
  const favs = {
    all: () => { try { return JSON.parse(localStorage.getItem('pawpal_favs')) || []; } catch { return []; } },
    has: (id) => favs.all().includes(id),
    toggle: (id) => { const list = favs.all(); const i = list.indexOf(id); if (i >= 0) list.splice(i, 1); else list.push(id);
      try { localStorage.setItem('pawpal_favs', JSON.stringify(list)); } catch { /* storage unavailable */ } return i < 0; },
  };

  // ---------- pet card (home, AI matches, etc.) ----------
  const TRAIT_CLASS = [['kid', 'badge-kids'], ['play', 'badge-playful'], ['active', 'badge-active'], ['energ', 'badge-active'],
    ['smart', 'badge-smart'], ['learn', 'badge-smart'], ['apartment', 'badge-apartment'], ['calm', 'badge-calm'], ['quiet', 'badge-calm'],
    ['curious', 'badge-curious'], ['gentle', 'badge-gentle']];
  const traitClass = (t) => (TRAIT_CLASS.find(([k]) => t.toLowerCase().includes(k)) || [null, 'badge-gentle'])[1];

  function petCardHTML(pet, { match } = {}) {
    const fav = favs.has(pet.id);
    return `<article class="pet-card" data-id="${esc(pet.id)}">
      <div class="pet-card-img-wrap">
        <img src="${esc(photo(pet))}" alt="${esc(pet.name)} the ${esc(pet.breed)}" loading="lazy" onerror="this.onerror=null;this.src='${PLACEHOLDER}'"/>
        <button class="pet-card-heart ${fav ? 'is-fav' : ''}" data-fav="${esc(pet.id)}" aria-pressed="${fav}" aria-label="Save ${esc(pet.name)}">${icons.heart}</button>
        <span class="pet-card-type">${esc(pet.type)}</span>
        ${match !== undefined ? `<span class="pet-card-match">${match}% match</span>` : ''}
        ${pet.status === 'Pending Adoption' ? '<span class="pet-card-pending">Adoption pending</span>' : ''}
      </div>
      <div class="pet-card-body">
        <h3 class="pet-card-name">${esc(pet.name)}</h3>
        <div class="pet-card-breed">${esc(pet.breed)} &middot; ${esc(ageText(pet.age))}</div>
        ${pet.location ? `<div class="pet-card-location">${icons.pin}${esc(pet.location)}</div>` : ''}
        <div class="pet-card-badges">${(pet.traits || []).slice(0, 2).map((t) => `<span class="pet-badge-tag ${traitClass(t)}">${esc(t)}</span>`).join('')}</div>
        <a class="pet-card-cta" href="pet-profile.html?id=${encodeURIComponent(pet.id)}">Meet ${esc(pet.name)}</a>
      </div>
    </article>`;
  }
  // One listener handles every heart button on the page
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-fav]');
    if (!btn) return;
    e.preventDefault();
    const on = favs.toggle(btn.dataset.fav);
    btn.classList.toggle('is-fav', on);
    btn.setAttribute('aria-pressed', on);
    toast(on ? 'Saved to your favourites' : 'Removed from favourites');
  });

  // ---------- current user ----------
  let user = null;
  const ready = PawPalAPI.get('/auth/me').then((d) => { user = d.user; return user; }).catch(() => null);

  async function logout() {
    await PawPalAPI.post('/auth/logout').catch(() => {});
    location.href = 'home.html';
  }

  // ---------- navigation ----------
  const publicLinks = [
    ['Browse Pets', 'home.html#pets'],
    ['Dogs', 'home.html?type=dog#pets'],
    ['Cats', 'home.html?type=cat#pets'],
    ['Other Pets', 'home.html?type=other#pets'],
    ['AI Match', 'ai-matching.html'],
    ['Find a Vet', 'vet-finder.html'],
  ];

  function authSlotHTML(u) {
    if (!u) return `<a class="pawpal-btn-login" href="login.html">Log In</a><a class="pawpal-btn-signup" href="login.html?mode=signup">Sign Up</a>`;
    const first = esc(u.name.split(' ')[0]);
    const menu = u.role === 'staff'
      ? `<a href="index.html">${icons.grid}Admin dashboard</a><a href="applications.html">${icons.file}Applications</a><a href="settings.html">${icons.gear}Settings</a>`
      : `<a href="my-applications.html">${icons.file}My applications</a><a href="vet-finder.html">${icons.pulse}Find a vet</a><a href="profile.html">${icons.user}My profile</a>`;
    return `${u.role === 'user' ? `<div class="pp-bell-wrap">
        <button class="pp-icon-btn pp-bell" id="bellBtn" aria-label="Notifications" aria-expanded="false">${icons.bell}<span class="pp-bell-count" id="bellCount" hidden></span></button>
        <div class="pp-pop pp-bell-pop" id="bellPop" hidden><div class="pp-pop-head"><b>Notifications</b><button class="pp-link-btn" id="readAll">Mark all read</button></div><div id="bellList" class="pp-bell-list"><p class="pp-muted pp-pad">Loading…</p></div></div>
      </div>` : ''}
      <div class="pp-user-wrap">
        <button class="pp-user-btn" id="userBtn" aria-expanded="false"><span class="pp-avatar">${esc(initials(u.name))}</span><span class="pp-user-name">${first}</span>${icons.chevron}</button>
        <div class="pp-pop pp-user-pop" id="userPop" hidden>
          <div class="pp-pop-head pp-user-head"><b>${esc(u.name)}</b><span>${esc(u.email)}</span>${u.role === 'staff' ? '<span class="pawpal-badge-admin">Staff</span>' : ''}</div>
          ${menu}<button class="pp-pop-logout" data-logout>${icons.logout}Log out</button>
        </div>
      </div>`;
  }

  function renderPublicNav(nav, u) {
    const current = (href) => {
      const [file, query] = href.split('#')[0].split('?');
      if (file !== page) return false;
      const type = params.get('type');
      return query ? query === `type=${type}` : (!type || file !== 'home.html');
    };
    nav.innerHTML = `
      <a class="pawpal-nav-logo" href="home.html"><img src="images/logo.png" alt=""/><span class="pawpal-nav-logo-text">PawPal</span></a>
      <button class="pp-icon-btn pp-burger" id="burger" aria-label="Open menu" aria-expanded="false">${icons.menu}</button>
      <div class="pawpal-nav-center" id="navLinks">
        ${publicLinks.map(([label, href]) => `<a class="pawpal-nav-link ${current(href) ? 'is-current' : ''}" href="${href}">${label}</a>`).join('')}
        <div class="pawpal-dropdown-wrap">
          <button class="pawpal-dropdown-btn" id="aboutBtn" aria-expanded="false">About PawPal ${icons.chevron}</button>
          <div class="pawpal-dropdown-menu" id="aboutMenu">
            <a href="about.html#mission">Our mission</a><a href="about.html#story">How it started</a>
            <a href="home.html#how">How it works</a><a href="about.html#team">Our team</a>
            <a href="ending-animal-cruelty.html">Ending animal cruelty</a><a href="contact.html">Contact us</a>
          </div>
        </div>
      </div>
      <div class="pawpal-nav-auth" id="authSlot">${authSlotHTML(u)}</div>`;
  }

  function renderAdminNav(nav, u) {
    nav.innerHTML = `
      <a class="pawpal-nav-logo" href="index.html"><img src="images/logo.png" alt=""/><span class="pawpal-nav-logo-text">PawPal</span><span class="pawpal-badge-admin">Admin Panel</span></a>
      <button class="pp-icon-btn pp-burger pp-burger-admin" id="adminBurger" aria-label="Open admin menu">${icons.menu}</button>
      <div class="pawpal-nav-right"><a href="home.html" target="_blank" rel="noopener">View website</a></div>
      <div class="pawpal-nav-auth" id="authSlot">${authSlotHTML(u)}</div>`;
  }

  function renderAdminSidebar(aside) {
    const items = [['dashboard', 'index.html', icons.grid, 'Dashboard'], ['pets', 'pets.html', icons.smile, 'Manage Pets'],
      ['applications', 'applications.html', icons.file, 'Applications'], ['analytics', 'analytics.html', icons.chart, 'Analytics'],
      ['settings', 'settings.html', icons.gear, 'Settings']];
    const active = page === 'add-pet.html' ? 'pets.html' : page;
    aside.innerHTML = items.map(([id, href, icon, label]) =>
      `<a class="sidebar-item ${href === active ? 'active' : ''}" data-page="${id}" href="${href}" ${href === active ? 'aria-current="page"' : ''}>${icon}${label}</a>`).join('') +
      `<button class="sidebar-item sidebar-logout" data-logout>${icons.logout}Log out</button>`;
  }

  function renderUserSidebar(aside) {
    const items = [['home.html', icons.heart, 'Browse Pets'], ['my-applications.html', icons.file, 'My Applications'],
      ['ai-matching.html', icons.sparkle, 'AI Match'], ['vet-finder.html', icons.pulse, 'Find a Vet'], ['profile.html', icons.user, 'My Profile']];
    aside.innerHTML = items.map(([href, icon, label]) =>
      `<a class="app-sidebar-item ${href === page ? 'active' : ''}" href="${href}" ${href === page ? 'aria-current="page"' : ''}>${icon}${label}</a>`).join('');
  }

  function renderFooter(el) {
    el.className = 'pawpal-footer';
    el.innerHTML = `<div class="pawpal-footer-inner">
      <div class="pawpal-footer-top">
        <div>
          <div class="pawpal-footer-logo"><img src="images/logo.png" alt=""/><span class="pawpal-footer-logo-text">PawPal</span></div>
          <p class="pawpal-footer-tagline">Connecting hearts, one paw at a time.</p>
          <p class="pawpal-footer-motto">Because Every Paw Matters</p>
        </div>
        <div class="pawpal-footer-links">
          <a href="about.html#mission">About PawPal</a><a href="home.html#how">Adoption process</a>
          <a href="home.html#stories">Rescue stories</a><a href="ending-animal-cruelty.html">Ending animal cruelty</a>
          <a href="contact.html">Contact us</a><a href="about.html#privacy">Privacy policy</a>
        </div>
        <div class="pawpal-footer-social">
          <a href="https://www.instagram.com" target="_blank" rel="noopener" aria-label="Instagram">${icons.instagram}</a>
          <a href="https://www.facebook.com" target="_blank" rel="noopener" aria-label="Facebook">${icons.facebook}</a>
          <a href="https://www.linkedin.com" target="_blank" rel="noopener" aria-label="LinkedIn">${icons.linkedin}</a>
        </div>
      </div>
      <div class="pawpal-footer-bottom">&copy; ${new Date().getFullYear()} PawPal AI. All rights reserved. &nbsp;&middot;&nbsp; <em>Because Every Paw Matters</em></div>
    </div>`;
  }

  // ---------- notifications bell ----------
  async function loadBell() {
    const list = $('#bellList');
    if (!list) return;
    try {
      const { notifications, unread } = await PawPalAPI.get('/notifications');
      const count = $('#bellCount');
      count.hidden = !unread;
      count.textContent = unread > 9 ? '9+' : unread;
      list.innerHTML = notifications.length ? notifications.map((n) => `<a class="pp-note ${n.read ? '' : 'unread'}" href="${esc(n.link || 'my-applications.html')}">
          <b>${esc(n.title)}</b><span>${esc(n.message)}</span><small>${timeAgo(n.at)}</small></a>`).join('')
        : '<p class="pp-muted pp-pad">You\'re all caught up.</p>';
    } catch { list.innerHTML = '<p class="pp-muted pp-pad">Could not load notifications.</p>'; }
  }

  // ---------- global click handling for menus ----------
  function togglePop(btn, pop) {
    const open = pop.hidden;
    $$('.pp-pop').forEach((p) => { p.hidden = true; });
    $$('[aria-expanded="true"]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
    pop.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
  }
  document.addEventListener('click', async (e) => {
    const t = e.target;
    if (t.closest('[data-logout]')) return logout();
    if (t.closest('#userBtn')) return togglePop($('#userBtn'), $('#userPop'));
    if (t.closest('#bellBtn')) { togglePop($('#bellBtn'), $('#bellPop')); if (!$('#bellPop').hidden) loadBell(); return; }
    if (t.closest('#readAll')) { await PawPalAPI.post('/notifications/read-all').catch(() => {}); return loadBell(); }
    if (t.closest('#aboutBtn')) { const m = $('#aboutMenu'); const open = !m.classList.contains('open');
      m.classList.toggle('open', open); $('#aboutBtn').classList.toggle('open', open); $('#aboutBtn').setAttribute('aria-expanded', open); return; }
    if (t.closest('#burger')) { const open = document.body.classList.toggle('nav-open'); $('#burger').setAttribute('aria-expanded', open); return; }
    if (t.closest('#adminBurger')) { document.body.classList.toggle('sidebar-open'); return; }
    if (!t.closest('.pp-pop')) { $$('.pp-pop').forEach((p) => { p.hidden = true; }); }
    if (!t.closest('.pawpal-dropdown-wrap')) { $('#aboutMenu')?.classList.remove('open'); $('#aboutBtn')?.classList.remove('open'); }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $$('.pp-pop').forEach((p) => { p.hidden = true; }); });


  // ---------- icon hydration ----------
  // Markup can write <span data-icon="paw"></span> and get a real SVG here,
  // so the new pages use proper icons instead of emoji.
  function hydrateIcons(root = document) {
    root.querySelectorAll('[data-icon]').forEach((el) => {
      const name = el.dataset.icon;
      if (!icons[name] || el.dataset.iconDone) return;
      el.insertAdjacentHTML('afterbegin', icons[name]);
      el.dataset.iconDone = '1';
    });
  }

  // ---------- scroll reveal for [data-reveal] ----------
  let revealObs;
  function reveal(root = document) {
    const items = [...root.querySelectorAll('[data-reveal]:not(.revealed)')];
    if (!items.length) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) {
      items.forEach((el) => el.classList.add('revealed'));
      return;
    }
    revealObs ||= new IntersectionObserver((entries, obs) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('revealed'); obs.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -40px 0px', threshold: 0.05 });
    items.forEach((el) => revealObs.observe(el));
  }

  // ---------- boot: render shared layout ----------
  document.addEventListener('DOMContentLoaded', async () => {
    const nav = $('[data-nav]');
    const footer = $('[data-footer]');
    if (footer) renderFooter(footer);
    const aside = $('[data-sidebar]');
    if (aside?.dataset.sidebar === 'admin') renderAdminSidebar(aside);
    if (aside?.dataset.sidebar === 'user') renderUserSidebar(aside);
    // Render the nav immediately (logged-out look), then update once we know the user
    if (nav?.dataset.nav === 'admin') renderAdminNav(nav, null); else if (nav) renderPublicNav(nav, null);
    hydrateIcons();
    reveal();
    const u = await ready;
    if (nav && u) $('#authSlot').innerHTML = authSlotHTML(u);
    if (u?.role === 'user') loadBell();
    if (!sessionStorage.getItem('pp_visit') && nav?.dataset.nav !== 'admin') {
      sessionStorage.setItem('pp_visit', '1');
      PawPalAPI.post('/events', { type: 'visit' }).catch(() => {});
    }
  });

  return { $, $$, params, page, esc, fmtDate, fmtDateTime, timeAgo, initials, ageText, photo, icons, PLACEHOLDER,
    statusBadge, scoreBadge, toast, modal, confirm: confirmDialog, setBusy, favs, petCardHTML, traitClass,
    ready, get user() { return user; }, logout, loadBell, hydrateIcons, reveal };
})();
