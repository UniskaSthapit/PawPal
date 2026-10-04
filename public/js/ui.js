// ============================================================
// ui.js — shared layout and helpers used by every page.
// Pages declare <body data-layout="public|account|staff" data-page="…"> and put content in <main id="main">.
// This script renders the header, footer and dashboard sidebars, and provides toasts, modals,
// favourites, pet cards, formatting helpers and the shared motion toolkit
// (scroll reveals, momentum carousels, scroll-driven horizontal rails, count-ups, smooth accordions).
// ============================================================
const PawPal = (() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const params = new URLSearchParams(location.search);
  const page = location.pathname.split('/').pop() || 'home.html';
  const layout = document.body.dataset.layout || 'public';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hasShell = layout === 'account' || layout === 'staff';
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

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
  const ageText = (age) => (age === 0 ? 'Under 1 yr' : `${age} yr${age === 1 ? '' : 's'}`);
  const ageLong = (age) => (age === 0 ? 'Under 1 year' : `${age} year${age === 1 ? '' : 's'}`);
  const energyText = (n) => ['Low energy', 'Moderate energy', 'High energy'][(Number(n) || 2) - 1];
  const statusClass = (s) => `st st-${String(s).replace(/[^A-Za-z]/g, '')}`;
  const statusBadge = (s) => `<span class="${statusClass(s)}">${esc(s)}</span>`;
  const scoreBadge = (n) => `<span class="score ${n >= 80 ? 'score-high' : n >= 60 ? 'score-mid' : 'score-low'}" title="Suitability score">${n}</span>`;
  // Which engine produced an AI answer (shown so people always know)
  const aiLabel = (source, fallback = 'PawPal matching engine') => (source && source !== 'rules' ? 'PawPal assistant' : fallback);
  const money = (n) => (n ? `$${Number(n).toLocaleString('en-AU')}` : 'Contact shelter');

  // ---------- images ----------
  const FALLBACK = { Dog: 'images/pets/dog-a.svg', Cat: 'images/pets/cat-a.svg', Rabbit: 'images/pets/rabbit-a.svg', Bird: 'images/pets/bird-a.svg', 'Guinea Pig': 'images/pets/small-a.svg',
    Hamster: 'images/pets/small-c.svg', Reptile: 'images/pets/lizard-a.svg', Fish: 'images/pets/fish-a.svg', 'Farm Animal': 'images/pets/goat-a.svg', Other: 'images/pets/small-b.svg' };
  const PLACEHOLDER = 'images/pet-placeholder.svg';
  const photo = (pet, i = 0) => (pet?.photos && pet.photos[i]) || pet?.petPhoto || FALLBACK[pet?.type] || PLACEHOLDER;
  // Responsive Unsplash sizes; uploaded and local images are used as-is
  const sized = (url, w) => (/images\.unsplash\.com/.test(url) ? url.replace(/([?&])w=\d+/, `$1w=${w}`).replace(/([?&])h=\d+/, `$1h=${Math.round(w * 0.8)}`) : url);
  const srcset = (url) => (/images\.unsplash\.com/.test(url) ? `${sized(url, 480)} 480w, ${sized(url, 800)} 800w, ${sized(url, 1200)} 1200w` : '');
  // Broken images fall back to a friendly illustration (error events don't bubble, so listen in capture phase)
  document.addEventListener('error', (e) => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement) || img.dataset.fellBack) return;
    img.dataset.fellBack = '1';
    img.removeAttribute('srcset');
    img.src = img.dataset.fallback || PLACEHOLDER;
  }, true);

  // ---------- icons ----------
  const svg = (paths, extra = '') => `<svg fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true" ${extra}>${paths}</svg>`;
  const icons = {
    heart: svg('<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21.2l7.8-7.7 1-1.1a5.5 5.5 0 0 0 0-7.8z"/>'),
    pin: svg('<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>'),
    chevron: svg('<path d="m6 9 6 6 6-6"/>'),
    chevronLeft: svg('<path d="m15 18-6-6 6-6"/>'),
    chevronRight: svg('<path d="m9 18 6-6-6-6"/>'),
    bell: svg('<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>'),
    grid: svg('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'),
    file: svg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8"/>'),
    chart: svg('<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>'),
    gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
    user: svg('<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>'),
    users: svg('<circle cx="9" cy="8" r="3.2"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M16 5.2a3.2 3.2 0 0 1 0 6.1M18 20a6 6 0 0 0-2.4-4.8"/>'),
    logout: svg('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>'),
    sparkle: svg('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 3v4M17 5h4M5 17v4M3 19h4"/>'),
    home: svg('<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>'),
    menu: svg('<path d="M3 6h18M3 12h18M3 18h18"/>'),
    close: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
    check: svg('<path d="M20 6 9 17l-5-5"/>'),
    checkCircle: svg('<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>'),
    x: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
    paw: svg('<ellipse cx="12" cy="15.5" rx="4.2" ry="3.4"/><ellipse cx="6.2" cy="10.6" rx="2" ry="2.6"/><ellipse cx="10" cy="7.4" rx="2" ry="2.7"/><ellipse cx="14" cy="7.4" rx="2" ry="2.7"/><ellipse cx="17.8" cy="10.6" rx="2" ry="2.6"/>'),
    dog: svg('<path d="M4.5 8.5 3 4l4.5 2M19.5 8.5 21 4l-4.5 2"/><path d="M5 10a7 7 0 0 1 14 0v3a7 7 0 0 1-14 0z"/><circle cx="9.5" cy="11" r=".9" fill="currentColor"/><circle cx="14.5" cy="11" r=".9" fill="currentColor"/><path d="M12 14v1.6M10.4 17c.8.7 2.4.7 3.2 0"/>'),
    cat: svg('<path d="M4 9 4.5 4 9 7M20 9l-.5-5L15 7"/><path d="M4 11a8 8 0 0 1 16 0v2a8 8 0 0 1-16 0z"/><circle cx="9.5" cy="12" r=".9" fill="currentColor"/><circle cx="14.5" cy="12" r=".9" fill="currentColor"/><path d="M12 14.5v1M3 13h3M18 13h3"/>'),
    rabbit: svg('<path d="M8.5 9C7.5 6 7.8 3 9 3s1.8 3 1.4 6M15.5 9c1-3 .7-6-.5-6s-1.8 3-1.4 6"/><path d="M5.5 14.5a6.5 6.5 0 0 1 13 0v.5a6.5 6.5 0 0 1-13 0z"/><circle cx="10" cy="14" r=".9" fill="currentColor"/><circle cx="14" cy="14" r=".9" fill="currentColor"/>'),
    building: svg('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2M10 21v-3h4v3"/>'),
    tree: svg('<path d="M12 3 5 11h4l-3 5h5v5h2v-5h5l-3-5h4z"/>'),
    clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>'),
    child: svg('<circle cx="12" cy="6" r="3"/><path d="M12 9v6M8 12h8M9 21l3-4 3 4"/>'),
    alert: svg('<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>'),
    info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 8h.01"/>'),
    help: svg('<circle cx="12" cy="12" r="9"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/>'),
    search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
    filter: svg('<path d="M3 5h18M6 12h12M10 19h4"/>'),
    mail: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6.5 8.5 6 8.5-6"/>'),
    phone: svg('<path d="M6 3h3l2 5-2.5 1.5a11 11 0 0 0 5 5L15 12l5 2v3a2 2 0 0 1-2.2 2A15 15 0 0 1 4 5.2 2 2 0 0 1 6 3z"/>'),
    calendar: svg('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
    stethoscope: svg('<path d="M6 3v5a4 4 0 0 0 8 0V3M6 3H4M14 3h2M10 12v3a4 4 0 0 0 8 0v-1"/><circle cx="18" cy="11" r="2"/>'),
    shield: svg('<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="m9 12 2 2 4-4"/>'),
    star: svg('<path d="m12 3.5 2.7 5.6 6.1.8-4.5 4.3 1.2 6.1-5.5-3-5.5 3 1.2-6.1L3.2 9.9l6.1-.8z"/>'),
    edit: svg('<path d="M4 20h4L20 8l-4-4L4 16z"/><path d="m14 6 4 4"/>'),
    trash: svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/>'),
    eye: svg('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>'),
    download: svg('<path d="M12 3v12M7.5 10.5 12 15l4.5-4.5M4 20h16"/>'),
    upload: svg('<path d="M12 21V9M7.5 13.5 12 9l4.5 4.5M4 4h16"/>'),
    camera: svg('<rect x="3" y="7" width="18" height="13" rx="2"/><circle cx="12" cy="13.5" r="3.5"/><path d="M9 7l1.2-2.5h3.6L15 7"/>'),
    plus: svg('<path d="M12 5v14M5 12h14"/>'),
    arrowRight: svg('<path d="M5 12h14M13 6l6 6-6 6"/>'),
    arrowLeft: svg('<path d="M19 12H5M11 6l-6 6 6 6"/>'),
    external: svg('<path d="M14 4h6v6M20 4 11 13"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'),
    send: svg('<path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/>'),
    message: svg('<path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12z"/>'),
    zap: svg('<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>'),
    archive: svg('<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4"/>'),
    inbox: svg('<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.7 4H7.3a2 2 0 0 0-1.8 1.1z"/>'),
    gift: svg('<rect x="3" y="8" width="18" height="13" rx="2"/><path d="M3 12h18M12 8v13M8.5 8a2.5 2.5 0 1 1 1.8-4.2C11.4 4.9 12 8 12 8s.6-3.1 1.7-4.2A2.5 2.5 0 1 1 15.5 8"/>'),
    handshake: svg('<path d="m11 17 2 2a1 1 0 1 0 3-3M14 14l2.5 2.5a1 1 0 1 0 3-3l-3.9-3.9a2.8 2.8 0 0 0-4 0l-.9.9a1 1 0 1 1-3-3l2.8-2.8a5.8 5.8 0 0 1 7 .9L21 7M3 7l2-2 4 1M3 7v6l7 7"/>'),
    ruler: svg('<path d="M21.3 15.3 8.7 2.7a1 1 0 0 0-1.4 0L2.7 7.3a1 1 0 0 0 0 1.4l12.6 12.6a1 1 0 0 0 1.4 0l4.6-4.6a1 1 0 0 0 0-1.4z"/><path d="m7.5 10.5 2-2M10.5 13.5l2-2M13.5 16.5l2-2"/>'),
    cake: svg('<path d="M4 21v-8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8M4 16s1.5-1 4-1 4 2 4 2 1.5-2 4-2 4 1 4 1M2 21h20M12 11V7M12 4h.01"/>'),
    venus: svg('<circle cx="12" cy="9" r="5"/><path d="M12 14v7M9 18h6"/>'),
    mars: svg('<circle cx="10" cy="14" r="5"/><path d="M14 10l6-6M15 4h5v5"/>'),
    instagram: svg('<rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/>'),
    facebook: svg('<path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>'),
    linkedin: svg('<path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/>'),
    refresh: svg('<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8M21 3v5h-5"/>'),
    list: svg('<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>'),
    trendUp: svg('<path d="m3 17 6-6 4 4 8-8M15 7h6v6"/>'),
    dollar: svg('<path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>'),
    bulb: svg('<path d="M9 18h6M10 21h4M12 3a6 6 0 0 1 3.5 10.9V16h-7v-2.1A6 6 0 0 1 12 3z"/>'),
    lock: svg('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
    smartphone: svg('<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/>'),
    clipboard: svg('<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2.8h6V4M8.5 10h7M8.5 14h7M8.5 18h4"/>'),
    minus: svg('<path d="M5 12h14"/>'),
    pause: svg('<path d="M9 5v14M15 5v14"/>'),
    play: svg('<path d="m7 4 13 8-13 8z"/>'),
    bird: svg('<path d="M16 7h.01"/><path d="M3.4 18H12a8 8 0 0 0 8-8V7a4 4 0 0 0-7.28-2.3L2 20"/><path d="m20 7 2 .5-2 .5M10 18v3M14 17.75V21"/><path d="M7 18a6 6 0 0 0 3.84-10.61"/>'),
    fish: svg('<path d="M6.5 12c.94-3.46 4.94-6 8.5-6 3.56 0 6.06 2.54 7 6-.94 3.47-3.44 6-7 6s-7.56-2.53-8.5-6Z"/><path d="M18 12v.5"/><path d="M7 10.67C7 8 5.58 5.97 2.73 5.5c-1 1.5-1 5 .23 6.5-1.24 1.5-1.24 5-.23 6.5C5.58 18.03 7 16 7 13.33"/>'),
    turtle: svg('<path d="m12 10 2 4v3a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-3a8 8 0 1 0-16 0v3a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-3l2-4h4Z"/><path d="M4.82 7.9 8 10M15.18 7.9 12 10M16.93 10H20a2 2 0 0 1 0 4H2"/>'),
    barn: svg('<path d="M3 21V10l9-6 9 6v11"/><path d="M8 21v-6h8v6"/><path d="m8 15 8 6M16 15l-8 6"/><path d="M10 10h4"/>'),
    globe: svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>'),
  };
  const icon = (name) => icons[name] || '';

  // Toast colour for a response that reports an email: sent → success, skipped (demo address / turned off) → info, failed → error
  const emailToastType = (r) => ({ failed: 'error', skipped: 'info' }[r?.emailStatus] || 'success');

  // ---------- toasts ----------
  function toast(message, type = 'success') {
    let wrap = $('#toastWrap');
    if (!wrap) { wrap = document.createElement('div'); wrap.id = 'toastWrap'; wrap.className = 'toast-wrap'; wrap.setAttribute('role', 'status'); wrap.setAttribute('aria-live', 'polite'); document.body.appendChild(wrap); }
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.innerHTML = `${type === 'error' ? icons.alert : type === 'info' ? icons.info : icons.checkCircle}<span>${esc(message)}</span>`;
    wrap.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, type === 'error' ? 5500 : 3500);
  }

  // ---------- accessible modal ----------
  function modal({ title, body, actions = [], wide = false, onOpen }) {
    return new Promise((resolve) => {
      const back = document.createElement('div');
      back.className = 'modal-back';
      const id = `m${Math.random().toString(36).slice(2, 8)}`;
      back.innerHTML = `<div class="modal ${wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="${id}">
        <div class="modal-head"><h2 id="${id}">${esc(title)}</h2><button class="icon-btn" data-close aria-label="Close">${icons.close}</button></div>
        <div class="modal-body">${body}</div>
        ${actions.length ? `<div class="modal-actions">${actions.map((a, i) => `<button class="btn ${a.variant || ''}" data-action="${i}">${esc(a.label)}</button>`).join('')}</div>` : ''}
      </div>`;
      const prevFocus = document.activeElement;
      const close = (value) => {
        back.classList.remove('show');
        document.removeEventListener('keydown', onKey);
        document.body.style.overflow = '';
        setTimeout(() => back.remove(), 200);
        prevFocus?.focus?.();
        resolve(value);
      };
      const onKey = (e) => {
        if (e.key === 'Escape') close(null);
        if (e.key === 'Tab') { // keep focus inside the dialog
          const f = $$('button:not([disabled]),[href],input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])', back).filter((x) => x.offsetParent !== null);
          if (!f.length) return;
          if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
          else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
        }
      };
      back.addEventListener('mousedown', (e) => { if (e.target === back) close(null); });
      back.addEventListener('click', async (e) => {
        if (e.target.closest('[data-close]')) return close(null);
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
      document.body.style.overflow = 'hidden';
      requestAnimationFrame(() => back.classList.add('show'));
      onOpen?.(back, close);
      setTimeout(() => ($('input:not([type=hidden]),textarea,select', back) || $('[data-action]', back) || $('[data-close]', back))?.focus(), 60);
    });
  }
  const confirmDialog = ({ title, message, confirmText = 'Confirm', danger = false }) =>
    modal({ title, body: `<p class="muted">${esc(message)}</p>`,
      actions: [{ label: 'Cancel', value: false }, { label: confirmText, variant: danger ? 'btn-danger' : 'btn-primary', value: true }] }).then((v) => v === true);

  function setBusy(btn, busy, label) {
    if (!btn) return;
    if (busy) { btn.dataset.label = btn.innerHTML; btn.disabled = true; btn.classList.add('is-busy'); btn.innerHTML = `<span class="spinner"></span>${esc(label || 'Please wait…')}`; }
    else { btn.disabled = false; btn.classList.remove('is-busy'); if (btn.dataset.label) btn.innerHTML = btn.dataset.label; }
  }
  const errorHTML = (msg) => `<div class="alert alert-error" role="alert">${icons.alert}<div>${esc(msg)}</div></div>`;
  const emptyHTML = ({ icon: ic = 'paw', title, text = '', action = '' }) => `<div class="empty"><div class="e-icon">${icons[ic] || icons.paw}</div><h3>${esc(title)}</h3>${text ? `<p>${esc(text)}</p>` : ''}${action}</div>`;
  const skeletonCards = (n = 6) => Array.from({ length: n }, () => '<div class="skeleton skel-card" aria-hidden="true"></div>').join('');

  // ---------- current user ----------
  let user = null;
  const ready = PawPalAPI.get('/auth/me').then((d) => { user = d.user; return user; }).catch(() => null);
  const isStaffUser = (u) => u && (u.role === 'staff' || u.role === 'admin');

  async function logout() {
    await PawPalAPI.post('/auth/logout').catch(() => {});
    try { localStorage.removeItem('pp_convo'); } catch { /* ignore */ }
    location.href = 'home.html';
  }

  // ---------- favourites (database for adopters, this browser for visitors) ----------
  const LOCAL_KEY = 'pawpal_favs';
  const readLocal = () => { try { return JSON.parse(localStorage.getItem(LOCAL_KEY)) || []; } catch { return []; } };
  const writeLocal = (ids) => { try { localStorage.setItem(LOCAL_KEY, JSON.stringify(ids)); } catch { /* storage unavailable */ } };
  const favIds = new Set(readLocal());
  const favsReady = ready.then(async (u) => {
    if (u?.role !== 'user') return favIds;
    const local = readLocal();
    if (local.length) { await PawPalAPI.post('/favourites', { ids: local }).catch(() => {}); writeLocal([]); }
    const { ids } = await PawPalAPI.get('/favourites').catch(() => ({ ids: [] }));
    favIds.clear(); ids.forEach((id) => favIds.add(id));
    return favIds;
  });
  const favs = {
    has: (id) => favIds.has(id),
    ready: favsReady,
    async toggle(id, name = 'this pet') {
      const on = !favIds.has(id);
      if (on) favIds.add(id); else favIds.delete(id);
      if (user?.role === 'user') {
        try { on ? await PawPalAPI.post(`/favourites/${encodeURIComponent(id)}`) : await PawPalAPI.del(`/favourites/${encodeURIComponent(id)}`); }
        catch (err) { if (on) favIds.delete(id); else favIds.add(id); toast(err.message, 'error'); return !on; }
        toast(on ? `${name} saved to your favourites` : 'Removed from favourites');
      } else {
        writeLocal([...favIds]);
        toast(on ? `${name} saved on this device — log in to keep your favourites` : 'Removed from favourites', 'info');
      }
      $$(`[data-fav="${CSS.escape(id)}"]`).forEach((b) => {
        b.setAttribute('aria-pressed', String(on));
        b.classList.remove('pop');
        if (on) { void b.offsetWidth; b.classList.add('pop'); } // restart the heart animation
      });
      document.dispatchEvent(new CustomEvent('pawpal:fav', { detail: { id, on } }));
      return on;
    },
  };
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-fav]');
    if (!btn) return;
    e.preventDefault(); e.stopPropagation();
    favs.toggle(btn.dataset.fav, btn.dataset.name);
  });
  favsReady.then(() => $$('[data-fav]').forEach((b) => b.setAttribute('aria-pressed', String(favIds.has(b.dataset.fav)))));

  // ---------- pet card ----------
  const isNew = (pet) => pet.createdAt && Date.now() - new Date(pet.createdAt) < 14 * 86400000;
  function petTags(pet) {
    const tags = [];
    if (!pet.requiresYard && Number(pet.energyLevel) <= 2) tags.push('Apartment OK');
    if (pet.goodWithChildren) tags.push('Kids OK');
    if (pet.goodWithOtherPets) tags.push('Pet friendly');
    if (Number(pet.energyLevel) === 3) tags.push('High energy');
    if (Number(pet.energyLevel) === 1) tags.push('Calm');
    return tags.slice(0, 3);
  }
  // ---------- language for machine translation (pet profiles and chat) ----------
  const LANGUAGES = [['en', 'English'], ['ne', 'नेपाली · Nepali'], ['hi', 'हिन्दी · Hindi'], ['zh', '简体中文 · Chinese'], ['es', 'Español · Spanish']];
  const HTML_LANG = { en: 'en', ne: 'ne', hi: 'hi', zh: 'zh-Hans', es: 'es' };
  const lang = {
    list: LANGUAGES,
    get() { try { const v = localStorage.getItem('pp_lang'); return HTML_LANG[v] ? v : 'en'; } catch { return 'en'; } },
    set(v) { try { localStorage.setItem('pp_lang', HTML_LANG[v] ? v : 'en'); } catch { /* ignore */ } },
    html: (v) => HTML_LANG[v] || 'en',
  };
  const langSelectHTML = (id, current = lang.get(), cls = '') => `<select class="select lang-select ${cls}" id="${id}" aria-label="Language">
    ${LANGUAGES.map(([v, label]) => `<option value="${v}" ${v === current ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select>`;

  // ---------- compare (up to 3 pets, remembered in this browser) ----------
  const COMPARE_KEY = 'pp_compare';
  const COMPARE_MAX = 3;
  let compareList = [];
  try {
    const saved = JSON.parse(localStorage.getItem(COMPARE_KEY) || '[]');
    compareList = (Array.isArray(saved) ? saved : []).filter((x) => x && typeof x.id === 'string' && /^[\w-]{1,40}$/.test(x.id)).slice(0, COMPARE_MAX);
  } catch { compareList = []; }
  const compareURL = () => `compare.html?ids=${compareList.map((x) => encodeURIComponent(x.id)).join(',')}`;
  function saveCompare() {
    try { localStorage.setItem(COMPARE_KEY, JSON.stringify(compareList)); } catch { /* private mode: keep for this page only */ }
    $$('input[data-compare]').forEach((cb) => { cb.checked = compare.has(cb.dataset.compare); });
    renderCompareBar();
  }
  const compare = {
    max: COMPARE_MAX,
    has: (id) => compareList.some((x) => x.id === id),
    list: () => compareList.map((x) => ({ ...x })),
    url: compareURL,
    add(item) {
      if (compare.has(item.id)) return true;
      if (compareList.length >= COMPARE_MAX) return false;
      compareList.push({ id: String(item.id), name: String(item.name || '').slice(0, 40), img: String(item.img || '').slice(0, 400) });
      saveCompare();
      return true;
    },
    remove(id) { compareList = compareList.filter((x) => x.id !== id); saveCompare(); },
    set(items) { compareList = items.slice(0, COMPARE_MAX); saveCompare(); },
    clear() { compareList = []; saveCompare(); },
  };
  const compareToggleHTML = (pet) => `<label class="compare-toggle"><input type="checkbox" data-compare="${esc(pet.id)}" data-name="${esc(pet.name)}" data-img="${esc(sized(photo(pet), 200))}" ${compare.has(pet.id) ? 'checked' : ''}><span>Compare</span></label>`;
  document.addEventListener('change', (e) => {
    const cb = e.target.closest?.('input[data-compare]');
    if (!cb) return;
    if (!cb.checked) return compare.remove(cb.dataset.compare);
    if (!compare.add({ id: cb.dataset.compare, name: cb.dataset.name, img: cb.dataset.img })) {
      cb.checked = false;
      toast(`You can compare up to ${COMPARE_MAX} pets. Remove one from the compare bar first.`, 'info');
    }
  });
  function renderCompareBar() {
    let bar = $('#compareBar');
    if (!compareList.length || page === 'compare.html' || !['public', 'account'].includes(layout)) { if (bar) bar.remove(); document.body.classList.remove('has-compare'); return; }
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'compareBar'; bar.className = 'compare-bar'; bar.setAttribute('role', 'region'); bar.setAttribute('aria-label', 'Pets to compare');
      bar.addEventListener('click', (e) => {
        const rm = e.target.closest('[data-compare-remove]');
        if (rm) compare.remove(rm.dataset.compareRemove);
        if (e.target.closest('[data-compare-clear]')) compare.clear();
      });
      document.body.appendChild(bar);
    }
    document.body.classList.add('has-compare');
    const n = compareList.length;
    bar.innerHTML = `<div class="compare-bar-pets">${compareList.map((x) => `<span class="compare-chip">
        <img src="${esc(x.img || PLACEHOLDER)}" alt="" data-fallback="${PLACEHOLDER}"><span>${esc(x.name)}</span>
        <button type="button" data-compare-remove="${esc(x.id)}" aria-label="Remove ${esc(x.name)} from compare">${icons.close}</button></span>`).join('')}
        ${Array.from({ length: COMPARE_MAX - n }, () => '<span class="compare-chip compare-empty" aria-hidden="true">Add a pet</span>').join('')}</div>
      <div class="compare-bar-actions"><button type="button" class="link-btn small" data-compare-clear>Clear</button>
        ${n >= 2 ? `<a class="btn btn-primary btn-sm" id="compareGo" href="${compareURL()}">Compare ${n} pets</a>` : '<span class="small muted">Pick at least 2 to compare</span>'}</div>`;
  }

  // `index` staggers the entrance animation when cards are rendered as a group; `compare` adds the compare checkbox
  function petCardHTML(pet, { match, reason, index = 0, compare: withCompare = false } = {}) {
    const fav = favIds.has(pet.id);
    const staff = isStaffUser(user);
    const img = photo(pet);
    return `<article class="pet-card" data-id="${esc(pet.id)}" style="--i:${index}">
      <div class="pet-card-media">
        <img src="${esc(sized(img, 800))}" ${srcset(img) ? `srcset="${srcset(img)}" sizes="(max-width: 680px) 100vw, 320px"` : ''} alt="${esc(pet.name)}, a ${esc(pet.breed)}" loading="lazy" decoding="async" data-fallback="${FALLBACK[pet.type] || PLACEHOLDER}"/>
        <div class="pet-card-flags">
          ${match !== undefined ? `<span class="badge badge-match">${icons.sparkle}${match}% match</span>` : ''}
          ${pet.status === 'On Hold' ? '<span class="badge">On hold</span>' : isNew(pet) && match === undefined ? '<span class="badge badge-brand">New</span>' : ''}
        </div>
        ${staff ? '' : `<button class="fav-btn" data-fav="${esc(pet.id)}" data-name="${esc(pet.name)}" aria-pressed="${fav}" aria-label="Save ${esc(pet.name)} to favourites">${icons.heart}</button>`}
      </div>
      <div class="pet-card-body">
        <div class="pet-card-title"><h3><a href="pet-profile.html?id=${encodeURIComponent(pet.id)}">${esc(pet.name)}</a></h3><span class="pet-card-sex">${esc(pet.gender === 'Unknown' ? '' : pet.gender)}</span></div>
        <div class="pet-card-meta"><b>${esc(pet.breed)}</b> · ${esc(ageText(pet.age))} · ${esc(pet.size)}</div>
        ${pet.location ? `<div class="pet-card-loc">${icons.pin}${esc(pet.location)}</div>` : ''}
        ${reason ? `<div class="pet-card-reason">${esc(reason)}</div>` : ''}
        <div class="pet-card-tags">${petTags(pet).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>
        ${withCompare && !staff ? compareToggleHTML(pet) : ''}
      </div>
      <span class="pet-card-go" aria-hidden="true">${icons.arrowRight}</span>
    </article>`;
  }

  // ---------- navigation ----------
  const PUBLIC_LINKS = [
    ['Adopt a pet', 'adopt.html'],
    ['Find my PawPal', 'ai-matching.html', true],
    ['How it works', 'home.html#how'],
    ['About', 'about.html'],
    ['Contact', 'contact.html'],
  ];

  function authHTML(u) {
    if (!u) {
      return `<a class="btn btn-ghost btn-sm hide-xs" href="login.html">Log in</a><a class="btn btn-primary btn-sm" href="login.html?mode=signup">Sign up</a>`;
    }
    const staff = isStaffUser(u);
    const menu = staff
      ? `<a href="index.html">${icons.grid}Shelter dashboard</a><a href="applications.html">${icons.file}Applications</a>${u.role === 'admin' ? `<a href="admin.html">${icons.shield}Administration</a>` : ''}<a href="settings.html">${icons.gear}Settings</a>`
      : `<a href="dashboard.html">${icons.grid}My dashboard</a><a href="my-applications.html">${icons.file}My applications</a><a href="dashboard.html#favourites">${icons.heart}Favourites</a><a href="profile.html">${icons.user}Profile & preferences</a>`;
    return `${staff ? '' : `<a class="icon-btn hide-xs" href="dashboard.html#favourites" aria-label="My favourites">${icons.heart}</a>`}
      <div class="pop-wrap">
        <button class="icon-btn" id="bellBtn" aria-label="Notifications" aria-expanded="false" aria-haspopup="true">${icons.bell}<span class="count-badge" id="bellCount" hidden></span></button>
        <div class="popover notif-pop" id="bellPop" hidden>
          <div class="popover-head"><b>Notifications</b><button class="link-btn small" id="readAll">Mark all read</button></div>
          <div class="notif-list" id="bellList"><p class="muted small" style="padding:16px">Loading…</p></div>
          <div class="notif-foot"><a class="small" href="notifications.html" style="justify-content:center">View all notifications</a></div>
        </div>
      </div>
      <div class="pop-wrap">
        <button class="user-btn" id="userBtn" aria-expanded="false" aria-haspopup="true"><span class="avatar">${esc(initials(u.name))}</span><span class="hide-xs">${esc(u.name.split(' ')[0])}</span>${icons.chevron}</button>
        <div class="popover" id="userPop" hidden>
          <div class="popover-head"><b>${esc(u.name)}</b><div class="small muted">${esc(u.email)}</div>${staff ? `<span class="badge badge-sage" style="margin-top:6px">${u.role === 'admin' ? 'Administrator' : 'Shelter staff'}</span>` : ''}</div>
          ${menu}<button class="menu-item" data-logout>${icons.logout}Log out</button>
        </div>
      </div>`;
  }

  function currentLink(href) {
    const [file, hash] = href.split('#');
    if (hash) return false;
    return file === page;
  }

  function renderHeader(u) {
    const header = document.createElement('header');
    header.className = 'site-header';
    header.innerHTML = `
      ${layout === 'public' ? `<div class="utility-bar"><div class="container">
        <div class="utility-links"><a href="ending-animal-cruelty.html">${icons.shield}Report animal cruelty</a><a class="u-hide-sm" href="vet-finder.html">${icons.stethoscope}Find a vet</a></div>
        <div class="utility-links" id="utilRight"><a href="login.html?role=staff">${icons.building}Shelter staff</a></div>
      </div></div>` : ''}
      <div class="container"><nav class="nav" aria-label="Main">
        ${hasShell ? `<button class="icon-btn mobile-side-btn" id="sideBtn" aria-label="Open menu">${icons.menu}</button>` : ''}
        <a class="brand" href="${layout === 'staff' ? 'index.html' : 'home.html'}" aria-label="PawPal home"><img src="images/logo.png" alt="" width="40" height="40"/><span class="brand-name">Paw<span>Pal</span></span></a>
        ${layout === 'staff' ? '<span class="badge badge-sage">Shelter portal</span>' : `<div class="nav-links" id="navLinks">
          ${PUBLIC_LINKS.map(([label, href, ai]) => `<a class="nav-link" href="${href}" ${currentLink(href) ? 'aria-current="page"' : ''}>${ai ? '<span class="ai-dot" aria-hidden="true"></span>' : ''}${label}</a>`).join('')}
        </div>`}
        <div class="nav-actions" id="authSlot">${authHTML(u)}</div>
        ${!hasShell ? `<button class="icon-btn nav-burger" id="burger" aria-label="Open menu" aria-expanded="false" aria-controls="navLinks">${icons.menu}</button>` : ''}
      </nav></div>`;
    document.body.prepend(header);
    const skip = document.createElement('a');
    skip.className = 'skip-link'; skip.href = '#main'; skip.textContent = 'Skip to content';
    document.body.prepend(skip);
    const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
    const util = $('.utility-bar', header);
    if (util) document.documentElement.style.setProperty('--util-h', `${util.offsetHeight}px`);
  }

  function renderFooter() {
    const f = document.createElement('footer');
    f.className = 'site-footer';
    f.innerHTML = `
      ${layout === 'public' && page !== 'home.html' ? `<div class="footer-cta"><div class="container"><div>
        <h2>Somewhere out there is a pet who fits your life.</h2>
        <div class="row"><a class="btn btn-primary btn-lg" href="ai-matching.html">${icons.sparkle}Find my PawPal</a><a class="btn btn-light btn-lg" href="adopt.html">Browse all pets</a></div>
      </div></div></div>` : ''}
      <div class="container">
        <div class="footer-main">
          <div class="footer-brand">
            <a class="brand" href="home.html"><img src="images/logo.png" alt="" width="40" height="40"/><span class="brand-name">Paw<span>Pal</span></span></a>
            <p>Helping rescue animals across Australia find homes that suit them. Because every paw matters.</p>
            <div class="footer-social">
              <a href="https://www.instagram.com" target="_blank" rel="noopener" aria-label="PawPal on Instagram">${icons.instagram}</a>
              <a href="https://www.facebook.com" target="_blank" rel="noopener" aria-label="PawPal on Facebook">${icons.facebook}</a>
              <a href="https://www.linkedin.com" target="_blank" rel="noopener" aria-label="PawPal on LinkedIn">${icons.linkedin}</a>
            </div>
          </div>
          <div><h3>Adopt</h3><a href="adopt.html">All pets</a><a href="adopt.html?type=dog">Dogs</a><a href="adopt.html?type=cat">Cats</a><a href="adopt.html?type=small">Rabbits & small pets</a><a href="adopt.html?type=bird">Birds</a><a href="adopt.html?type=reptile">Reptiles</a><a href="adopt.html?type=fish">Fish</a><a href="adopt.html?type=farm">Goats & cows</a></div>
          <div><h3>Help & advice</h3><a href="home.html#how">How adoption works</a><a href="home.html#faq">Adoption FAQ</a><a href="vet-finder.html">Find a vet</a><a href="ending-animal-cruelty.html">Report animal cruelty</a></div>
          <div><h3>PawPal</h3><a href="about.html">About us</a><a href="about.html#stories">Rescue stories</a><a href="contact.html">Contact</a><a href="login.html?role=staff">Shelter staff login</a>
            <a data-contact-email href="mailto:pawpaladmin@gmail.com">${icons.mail} pawpaladmin@gmail.com</a><a data-site-url href="home.html">${icons.globe} Website</a></div>
        </div>
        <p class="ack">PawPal acknowledges the Traditional Custodians of the lands on which we work and pay our respects to Elders past and present. Pet profiles, stories and people shown in this demo are illustrative.</p>
        <div class="footer-bottom"><span>© ${new Date().getFullYear()} PawPal. Because every paw matters.</span><span><a href="privacy.html">Privacy</a> · <a href="terms.html">Terms</a></span></div>
      </div>`;
    document.body.appendChild(f);
  }

  // Dashboard sidebars
  const ADOPTER_SIDE = [['dashboard.html', 'grid', 'Overview'], ['my-applications.html', 'file', 'My applications'], ['dashboard.html#favourites', 'heart', 'Favourites'],
    ['ai-matching.html', 'sparkle', 'Find my PawPal'], ['notifications.html', 'bell', 'Notifications'], ['profile.html', 'user', 'Profile & preferences']];
  const STAFF_SIDE = [['index.html', 'grid', 'Overview'], ['pets.html', 'paw', 'Pets'], ['applications.html', 'file', 'Applications', 'apps'], ['enquiries.html', 'message', 'Enquiries', 'enq'], ['availability.html', 'calendar', 'Availability'],
    ['analytics.html', 'chart', 'Analytics'], ['assistant.html', 'sparkle', 'AI assistant'], ['notifications.html', 'bell', 'Notifications'], ['settings.html', 'gear', 'Settings']];

  // Administrators see a banner on every portal page when email needs attention (Gmail sign-in expired, daily limit reached)
  function mailBanner(main) {
    PawPalAPI.get('/system/mail-health').then((h) => {
      if (!h.problems?.length) return;
      const box = document.createElement('div');
      box.className = 'alert alert-warn mail-banner';
      box.setAttribute('role', 'alert');
      box.innerHTML = `${icons.mail}<div>${h.problems.map((p) => `<b>${p.code === 'auth' ? 'Email is not being sent.' : 'Email paused for today.'}</b> ${esc(p.message)}`).join('<br>')}
        <a href="settings.html#systemCard">Email status</a></div>`;
      main.prepend(box);
    }).catch(() => {});
  }

  function renderShell(u) {
    const main = $('#main');
    if (!main) return;
    const staff = layout === 'staff' || isStaffUser(u);
    const items = staff ? STAFF_SIDE : ADOPTER_SIDE;
    const active = page === 'add-pet.html' ? 'pets.html' : page;
    const shell = document.createElement('div');
    shell.className = 'app-shell';
    shell.innerHTML = `<aside class="app-side" id="appSide" aria-label="${staff ? 'Shelter' : 'Account'} navigation">
      ${staff ? '<div class="side-shelter" id="sideShelter"><b>Shelter portal</b><span class="muted">Loading…</span></div>' : `<div class="side-label">My PawPal</div>`}
      ${items.map(([href, ic, label, key]) => `<a class="side-link" href="${href}" ${href === active ? 'aria-current="page"' : ''}>${icons[ic]}${label}${key ? `<span class="count" data-count="${key}" hidden></span>` : ''}</a>`).join('')}
      ${staff && u?.role === 'admin' ? `<div class="side-label">Administration</div><a class="side-link" href="admin.html" ${active === 'admin.html' ? 'aria-current="page"' : ''}>${icons.shield}Users & shelters</a>` : ''}
      <div class="side-label">${staff ? 'Public site' : 'Explore'}</div>
      <a class="side-link" href="adopt.html">${icons.search}Browse pets</a>
      <button class="side-link" data-logout style="width:100%;border:0;background:none">${icons.logout}Log out</button>
    </aside>`;
    main.classList.add('app-main');
    main.parentNode.insertBefore(shell, main);
    shell.appendChild(main);
    if (staff) {
      PawPalAPI.get('/shelters').then(({ shelters }) => {
        const s = shelters.find((x) => x.id === u?.shelterId);
        $('#sideShelter').innerHTML = s ? `<b>${esc(s.name)}</b><span class="muted">${esc(s.suburb)}, ${esc(s.state)}</span>` : `<b>All shelters</b><span class="muted">${u?.role === 'admin' ? 'Administrator view' : 'No shelter assigned'}</span>`;
      }).catch(() => {});
      if (u?.role === 'admin') mailBanner(main);
      Promise.all([PawPalAPI.get('/applications', { status: 'Submitted', limit: 1 }), PawPalAPI.get('/enquiries', { status: 'Open' })]).then(([a, e]) => {
        const set = (key, n) => { const el = $(`[data-count="${key}"]`); if (el && n) { el.hidden = false; el.textContent = n > 99 ? '99+' : n; } };
        set('apps', a.total); set('enq', e.open);
      }).catch(() => {});
    }
  }

  // ---------- notifications ----------
  const NOTE_ICON = { application: 'file', status: 'refresh', info: 'help', appointment: 'calendar', approved: 'checkCircle', declined: 'info', adopted: 'home',
    enquiry: 'message', pet: 'paw', match: 'sparkle', account: 'user', staff: 'inbox' };
  const noteHTML = (n) => `<a class="notif-item ${n.read ? '' : 'unread'}" href="${esc(n.link || '#')}" data-note="${esc(n.id)}">
      <span class="n-icon">${icons[NOTE_ICON[n.type] || 'bell']}</span><div><b>${esc(n.title)}</b><span>${esc(n.message)}</span><small>${timeAgo(n.at)}</small></div></a>`;
  async function loadBell(render = false) {
    try {
      const { notifications, unread } = await PawPalAPI.get('/notifications', { limit: 8 });
      const count = $('#bellCount');
      if (count) { count.hidden = !unread; count.textContent = unread > 9 ? '9+' : unread; }
      if (render && $('#bellList')) $('#bellList').innerHTML = notifications.length ? notifications.map(noteHTML).join('') : '<p class="muted small" style="padding:16px">You\'re all caught up.</p>';
    } catch { if (render && $('#bellList')) $('#bellList').innerHTML = '<p class="muted small" style="padding:16px">Could not load notifications.</p>'; }
  }

  function closePops() {
    $$('.popover').forEach((p) => { p.hidden = true; });
    $$('#bellBtn,#userBtn').forEach((b) => b.setAttribute('aria-expanded', 'false'));
  }
  function togglePop(btn, pop) {
    const open = pop.hidden;
    closePops();
    pop.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    if (open) $('a,button', pop)?.focus({ preventScroll: true });
  }
  document.addEventListener('click', async (e) => {
    const t = e.target;
    if (t.closest('[data-logout]')) return logout();
    if (t.closest('#userBtn')) return togglePop($('#userBtn'), $('#userPop'));
    if (t.closest('#bellBtn')) { togglePop($('#bellBtn'), $('#bellPop')); if (!$('#bellPop').hidden) loadBell(true); return; }
    if (t.closest('#readAll')) { await PawPalAPI.post('/notifications/read-all').catch(() => {}); return loadBell(true); }
    const note = t.closest('[data-note]');
    if (note && note.classList.contains('unread')) PawPalAPI.post(`/notifications/${note.dataset.note}/read`).catch(() => {});
    if (t.closest('#burger')) { const open = document.body.classList.toggle('nav-open'); $('#burger').setAttribute('aria-expanded', String(open)); $('#burger').innerHTML = open ? icons.close : icons.menu; return; }
    if (t.closest('#sideBtn')) { document.body.classList.add('side-open'); return; }
    if (document.body.classList.contains('side-open') && !t.closest('#appSide')) document.body.classList.remove('side-open');
    if (!t.closest('.pop-wrap')) closePops();
    if (t.closest('.nav-link') && document.body.classList.contains('nav-open')) { document.body.classList.remove('nav-open'); }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closePops(); document.body.classList.remove('side-open', 'nav-open'); } });

  // ---------- icons in markup: <span data-icon="paw"></span> ----------
  function hydrateIcons(root = document) {
    root.querySelectorAll('[data-icon]').forEach((el) => {
      if (!icons[el.dataset.icon] || el.dataset.iconDone) return;
      el.insertAdjacentHTML('afterbegin', icons[el.dataset.icon]);
      el.dataset.iconDone = '1';
    });
  }

  // ============================================================
  // Motion toolkit
  // Everything here is progressive: content is fully readable without JS, and every effect
  // is skipped (final state rendered immediately) when the visitor prefers reduced motion.
  // ============================================================
  const canAnimate = !reduceMotion && 'IntersectionObserver' in window;
  if (canAnimate) document.documentElement.classList.add('js-motion');
  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

  // ---------- scroll reveal: [data-reveal] (optionally ="scale" | "left" | "right") ----------
  // Siblings revealed together are staggered by 80ms so groups "ripple" in.
  let revealObs;
  function reveal(root = document) {
    const items = [...root.querySelectorAll('[data-reveal]:not(.revealed)')];
    if (!items.length) return;
    if (!canAnimate) { items.forEach((el) => el.classList.add('revealed')); return; }
    revealObs ||= new IntersectionObserver((entries, obs) => {
      entries.filter((en) => en.isIntersecting).forEach((en) => { en.target.classList.add('revealed'); obs.unobserve(en.target); });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    items.forEach((el) => {
      const siblings = [...el.parentElement.children].filter((c) => c.hasAttribute('data-reveal'));
      el.style.setProperty('--rd', `${Math.min(siblings.indexOf(el), 5) * 80}ms`);
      revealObs.observe(el);
    });
  }

  // ---------- count-up numbers (stats) ----------
  function countUp(el, to, { duration = 1400 } = {}) {
    const final = Number(to) || 0;
    const fmt = (n) => Math.round(n).toLocaleString('en-AU');
    if (!canAnimate || final < 2) { el.textContent = fmt(final); return; }
    el.textContent = '0';
    const run = () => {
      const start = performance.now();
      const tick = (now) => {
        const t = clamp((now - start) / duration, 0, 1);
        el.textContent = fmt(final * (1 - Math.pow(1 - t, 4))); // ease-out quart
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver(([en]) => { if (en.isIntersecting) { io.disconnect(); run(); } }, { threshold: 0.4 });
    io.observe(el);
  }

  // ---------- momentum carousel ----------
  // A native horizontal scroller, enhanced so a mouse can drag it with inertia (touch devices already
  // have native momentum). Optional prev/next buttons ([data-prev]/[data-next]) and dots ([data-dots]).
  function carousel(root) {
    const track = $('.carousel-track, .rail', root);
    if (!track || track.dataset.carousel) return;
    track.dataset.carousel = '1';
    const prev = $('[data-prev]', root); const next = $('[data-next]', root); const dots = $('[data-dots]', root);
    const items = () => [...track.children];
    const step = () => { const [a, b] = items(); return b ? b.offsetLeft - a.offsetLeft : track.clientWidth * 0.8; };

    function sync() {
      const max = track.scrollWidth - track.clientWidth - 2;
      if (prev) prev.disabled = track.scrollLeft <= 2;
      if (next) next.disabled = track.scrollLeft >= max;
      if (dots) {
        const n = items().length; const i = Math.round(track.scrollLeft / Math.max(1, step()));
        if (dots.childElementCount !== n) dots.innerHTML = '<i></i>'.repeat(n);
        [...dots.children].forEach((d, k) => d.classList.toggle('on', k === clamp(i, 0, n - 1)));
      }
    }
    track.addEventListener('scroll', () => requestAnimationFrame(sync), { passive: true });
    window.addEventListener('resize', sync);
    prev?.addEventListener('click', () => track.scrollBy({ left: -step(), behavior: reduceMotion ? 'auto' : 'smooth' }));
    next?.addEventListener('click', () => track.scrollBy({ left: step(), behavior: reduceMotion ? 'auto' : 'smooth' }));

    // Settle on the nearest card after a drag or glide
    const snapToNearest = () => {
      const base = items()[0]?.offsetLeft || 0;
      const target = items().map((c) => c.offsetLeft - base).reduce((best, x) => (Math.abs(x - track.scrollLeft) < Math.abs(best - track.scrollLeft) ? x : best), 0);
      track.scrollTo({ left: target, behavior: reduceMotion ? 'auto' : 'smooth' });
      setTimeout(() => track.classList.remove('is-gliding'), 450);
    };

    // Mouse drag with velocity tracking and exponential friction
    let startX = 0; let startScroll = 0; let lastX = 0; let lastT = 0; let v = 0; let dragging = false; let down = false; let glide = 0;
    track.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      cancelAnimationFrame(glide);
      down = true; dragging = false; startX = lastX = e.clientX; startScroll = track.scrollLeft; lastT = performance.now(); v = 0;
    });
    window.addEventListener('pointermove', (e) => {
      if (!down) return;
      const dx = e.clientX - startX;
      if (!dragging && Math.abs(dx) > 5) { dragging = true; track.classList.add('is-dragging', 'is-gliding'); }
      if (!dragging) return;
      e.preventDefault();
      const now = performance.now();
      v = 0.8 * ((lastX - e.clientX) / Math.max(1, now - lastT)) + 0.2 * v; // smoothed px/ms
      lastX = e.clientX; lastT = now;
      track.scrollLeft = startScroll - dx;
    });
    window.addEventListener('pointerup', () => {
      if (!down) return;
      down = false;
      if (!dragging) return;
      track.classList.remove('is-dragging');
      // A drag must not also "click" the card under the cursor
      track.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); }, { capture: true, once: true });
      if (reduceMotion) return snapToNearest();
      let last = performance.now();
      const frame = (now) => {
        const dt = now - last; last = now;
        track.scrollLeft += v * dt;
        v *= Math.pow(0.94, dt / 16); // friction
        if (Math.abs(v) > 0.03) glide = requestAnimationFrame(frame); else snapToNearest();
      };
      glide = requestAnimationFrame(frame);
    });
    track.addEventListener('dragstart', (e) => e.preventDefault());
    sync();
  }

  // ---------- scroll-linked horizontal rail ----------
  // As the section travels through the viewport, vertical scrolling glides the rail sideways (smoothed),
  // so the pets drift past while the page keeps scrolling normally — it never pins or traps the scroll.
  // The moment someone drags, swipes, uses the arrows or the keyboard, the rail is theirs to control.
  function hscroll(section) {
    const rail = $('.rail', section);
    const bar = $('.hscroll-progress', section);
    if (!rail) return;
    let driven = canAnimate; let target = 0; let raf = 0;

    const setProgress = () => {
      if (!bar) return;
      const max = rail.scrollWidth - rail.clientWidth;
      const p = max > 0 ? clamp(rail.scrollLeft / max, 0, 1) : 0;
      bar.style.setProperty('--p', p.toFixed(3));
      const n = rail.children.length;
      const label = $('[data-count]', bar);
      if (label) label.textContent = `${String(Math.min(n, Math.round(p * (n - 1)) + 1)).padStart(2, '0')} / ${String(n).padStart(2, '0')}`;
    };
    // Ease the rail towards its target position each frame
    const glide = () => {
      raf = 0;
      if (!driven) return;
      const diff = target - rail.scrollLeft;
      if (Math.abs(diff) < 0.5) { rail.scrollLeft = target; return; }
      rail.scrollLeft += diff * 0.14;
      raf = requestAnimationFrame(glide);
    };
    const onPageScroll = () => {
      if (!driven) return;
      const r = section.getBoundingClientRect();
      const vh = window.innerHeight;
      if (r.bottom < 0 || r.top > vh) return;
      // 0 when the section's top enters the bottom of the screen, 1 when its bottom leaves the top
      const p = clamp((vh - r.top) / (vh + r.height), 0, 1);
      // Start moving once the heading is in view and finish a little before the section leaves
      const eased = clamp((p - 0.25) / 0.55, 0, 1);
      target = eased * (rail.scrollWidth - rail.clientWidth);
      if (!raf) raf = requestAnimationFrame(glide);
    };
    const takeOver = () => {
      if (!driven) return;
      driven = false; cancelAnimationFrame(raf); raf = 0;
      rail.classList.remove('is-driven');
    };
    if (driven) {
      rail.classList.add('is-driven');
      window.addEventListener('scroll', onPageScroll, { passive: true });
      window.addEventListener('resize', onPageScroll);
      ['pointerdown', 'touchstart', 'keydown'].forEach((ev) => rail.addEventListener(ev, takeOver, { passive: true }));
      rail.addEventListener('wheel', (e) => { if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) takeOver(); }, { passive: true });
      $$('[data-prev],[data-next]', section).forEach((b) => b.addEventListener('click', takeOver));
      onPageScroll();
    }
    rail.addEventListener('scroll', () => requestAnimationFrame(setProgress), { passive: true });
    carousel(section); // drag with inertia, arrow buttons
    setProgress();
    return { release: takeOver };
  }
  // ---------- smooth accordion for <details> ----------
  function accordion(root) {
    if (!canAnimate || !root.animate) return;
    $$('details', root).forEach((d) => {
      const summary = $('summary', d);
      summary.addEventListener('click', (e) => {
        e.preventDefault();
        const from = d.offsetHeight;
        if (d.open) {
          const anim = d.animate({ height: [`${from}px`, `${summary.offsetHeight}px`] }, { duration: 280, easing: 'cubic-bezier(.22,.8,.24,1)' });
          anim.onfinish = () => { d.open = false; };
        } else {
          d.open = true;
          d.animate({ height: [`${from}px`, `${d.offsetHeight}px`] }, { duration: 380, easing: 'cubic-bezier(.22,.8,.24,1)' });
        }
      });
    });
  }

  // ---------- cookie notice (essential cookies only) ----------
  function cookieNotice() {
    try { if (localStorage.getItem('pp_cookie_ok')) return; } catch { return; }
    const bar = document.createElement('div');
    bar.className = 'cookie-bar'; bar.setAttribute('role', 'region'); bar.setAttribute('aria-label', 'Cookie notice');
    bar.innerHTML = '<p>PawPal only uses essential cookies to keep you signed in. <a href="privacy.html">Privacy</a></p><button class="btn btn-dark btn-sm">OK</button>';
    $('button', bar).addEventListener('click', () => { try { localStorage.setItem('pp_cookie_ok', '1'); } catch { /* ignore */ } bar.remove(); });
    document.body.appendChild(bar);
  }

  // ---------- contact links: [data-contact-email] and [data-site-url] use the server's CONTACT_EMAIL / APP_URL ----------
  const siteConfig = PawPalAPI.get('/config').catch(() => ({}));
  async function fillContactLinks(root = document) {
    const c = await siteConfig;
    if (c.contactEmail) $$('[data-contact-email]', root).forEach((a) => { a.href = `mailto:${c.contactEmail}`; a.lastChild.textContent = ` ${c.contactEmail}`; });
    if (c.siteUrl) $$('[data-site-url]', root).forEach((a) => { a.href = c.siteUrl; a.title = c.siteUrl; });
  }

  // ---------- boot ----------
  const booted = (async () => {
    renderHeader(null);
    if (!hasShell && layout !== 'auth') renderFooter();
    const u = await ready;
    if (u) $('#authSlot').innerHTML = authHTML(u);
    if (u && isStaffUser(u) && $('#utilRight')) $('#utilRight').innerHTML = `<a href="index.html">${icons.grid}Shelter dashboard</a>`;
    if (hasShell) renderShell(u);
    hydrateIcons();
    reveal();
    if (u) loadBell(false);
    fillContactLinks();
    if (layout === 'public') cookieNotice();
    renderCompareBar();
    try {
      if (!sessionStorage.getItem('pp_visit') && layout === 'public') { sessionStorage.setItem('pp_visit', '1'); PawPalAPI.post('/events', { type: 'visit' }).catch(() => {}); }
    } catch { /* ignore */ }
    return u;
  })();

  return { $, $$, params, page, layout, esc, fmtDate, fmtDateTime, timeAgo, initials, ageText, ageLong, energyText, money, photo, sized, srcset, icons, icon, aiLabel,
    FALLBACK, PLACEHOLDER, statusBadge, statusClass, scoreBadge, toast, modal, confirm: confirmDialog, setBusy, errorHTML, emptyHTML, skeletonCards,
    favs, lang, langSelectHTML, compare, compareToggleHTML, petCardHTML, petTags, ready, booted, emailToastType, get user() { return user; }, isStaffUser, logout, loadBell, noteHTML, hydrateIcons, reveal, reduceMotion,
    finePointer, countUp, carousel, hscroll, accordion, siteConfig, fillContactLinks };
})();
