// ============================================================
// chat.js — PawPal's adoption assistant widget.
// Answers come from /api/ai/chat, which only uses real pets and the adopter's own applications.
// Logged-in adopters get their conversation saved to their account; visitors keep it for this tab only.
// ============================================================
const PawPalChat = (() => {
  const { esc, icons, photo, toast } = PawPal;
  const SUGGESTIONS = ['Which dogs would suit apartment living?', 'I work full time — which pets cope well?', 'What happens after I apply?',
    'What\'s the status of my application?', 'Show me calm cats', 'How much does adopting cost?'];
  const SESSION_KEY = 'pp_chat';
  let state = { messages: [], profile: null, conversationId: null, lastPetIds: [] };
  let panel; let launcher; let busy = false; let loadedFromServer = false;

  const save = () => { try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...state, messages: state.messages.slice(-30) })); } catch { /* ignore */ } };
  try { Object.assign(state, JSON.parse(sessionStorage.getItem(SESSION_KEY)) || {}); } catch { /* ignore */ }

  const sourceLabel = (s) => (s === 'anthropic' ? 'Claude' : s === 'openai' ? 'OpenAI' : 'PawPal matching engine');

  function petsHTML(picks = []) {
    if (!picks.length) return '';
    return `<div class="msg-pets">${picks.map((p) => `<a class="mini-pet" href="pet-profile.html?id=${encodeURIComponent(p.pet.id)}">
      <img src="${esc(PawPal.sized(photo(p.pet), 200))}" alt="" loading="lazy" data-fallback="${PawPal.FALLBACK[p.pet.type] || PawPal.PLACEHOLDER}"/>
      <div><b>${esc(p.pet.name)}</b><span>${esc(p.pet.breed)} · ${esc(PawPal.ageText(p.pet.age))} · ${esc(p.pet.location || '')}</span></div>
      ${p.match !== undefined ? `<span class="score-pill" title="Compatibility with what you've told PawPal">${p.match}%</span>` : ''}</a>`).join('')}</div>`;
  }

  function messageHTML(m) {
    if (m.role === 'user') return `<div class="msg msg-user">${esc(m.content)}</div>`;
    return `<div class="msg msg-bot">${esc(m.content)}</div>${petsHTML(m.picks)}
      ${m.actions?.length ? `<div class="chat-actions">${m.actions.map((a) => `<a class="btn btn-sm" href="${esc(a.href)}">${esc(a.label)}</a>`).join('')}</div>` : ''}
      ${m.source ? `<div class="msg-meta">${icons.sparkle}${esc(sourceLabel(m.source))}${m.picks?.length ? ' · match % is guidance, not a guarantee' : ''}</div>` : ''}`;
  }

  function render() {
    const body = panel.querySelector('.chat-body');
    const greeting = `<div class="msg msg-bot">Hi${PawPal.user?.role === 'user' ? ` ${esc(PawPal.user.name.split(' ')[0])}` : ''}! I'm PawPal's adoption assistant. Tell me about your home and routine and I'll suggest pets that could suit you — or ask about a pet, the adoption process, or your application.</div>`;
    body.innerHTML = greeting + state.messages.map(messageHTML).join('') +
      (state.messages.length ? '' : `<div class="chat-suggest" aria-label="Suggested questions">${SUGGESTIONS.map((s) => `<button type="button" data-suggest="${esc(s)}">${esc(s)}</button>`).join('')}</div>`);
    body.scrollTop = body.scrollHeight;
  }

  // Reveal the reply progressively (skipped for reduced motion)
  function typeInto(el, text) {
    if (PawPal.reduceMotion) { el.textContent = text; return Promise.resolve(); }
    return new Promise((resolve) => {
      const words = text.split(/(\s+)/);
      let i = 0;
      const body = panel.querySelector('.chat-body');
      const tick = () => {
        i = Math.min(words.length, i + 3);
        el.textContent = words.slice(0, i).join('');
        body.scrollTop = body.scrollHeight;
        if (i < words.length) setTimeout(tick, 18); else resolve();
      };
      tick();
    });
  }

  async function send(text) {
    const message = String(text || '').trim();
    if (!message || busy) return;
    busy = true;
    const input = panel.querySelector('textarea');
    input.value = ''; autosize(input);
    state.messages.push({ role: 'user', content: message });
    render();
    const body = panel.querySelector('.chat-body');
    body.insertAdjacentHTML('beforeend', '<div class="msg msg-bot typing" aria-label="PawPal is typing"><i></i><i></i><i></i></div>');
    body.scrollTop = body.scrollHeight;
    try {
      const res = await PawPalAPI.post('/ai/chat', {
        message, conversationId: state.conversationId || undefined, profile: state.profile || undefined, lastPetIds: state.lastPetIds,
        history: state.conversationId ? undefined : state.messages.slice(-10, -1).map((m) => ({ role: m.role, content: m.content })),
      });
      state.profile = res.profile;
      if (res.conversationId) { state.conversationId = res.conversationId; try { localStorage.setItem('pp_convo', res.conversationId); } catch { /* ignore */ } }
      if (res.picks.length) state.lastPetIds = res.picks.map((p) => p.pet.id);
      body.querySelector('.typing')?.remove();
      const bubble = document.createElement('div');
      bubble.className = 'msg msg-bot';
      body.appendChild(bubble);
      await typeInto(bubble, res.reply);
      state.messages.push({ role: 'assistant', content: res.reply, picks: res.picks, actions: res.actions, source: res.source });
      render();
    } catch (err) {
      body.querySelector('.typing')?.remove();
      state.messages.push({ role: 'assistant', content: err.status === 429 ? err.message : `Sorry — I couldn't answer that just now (${err.message}). Please try again in a moment.` });
      render();
    } finally {
      busy = false; save();
      input.focus();
    }
  }

  const autosize = (ta) => { ta.style.height = 'auto'; ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`; };

  async function restoreFromServer() {
    if (loadedFromServer || PawPal.user?.role !== 'user') return;
    loadedFromServer = true;
    let id = null;
    try { id = localStorage.getItem('pp_convo'); } catch { /* ignore */ }
    if (!id || state.messages.length) return;
    try {
      const { conversation, pets } = await PawPalAPI.get(`/ai/conversations/${encodeURIComponent(id)}`);
      const byId = new Map(pets.map((p) => [p.id, p]));
      state.conversationId = conversation.id;
      state.messages = conversation.messages.slice(-20).map((m) => ({ role: m.role, content: m.content,
        picks: (m.petIds || []).map((pid) => byId.get(pid)).filter(Boolean).map((pet) => ({ pet })) }));
      render();
    } catch { try { localStorage.removeItem('pp_convo'); } catch { /* ignore */ } }
  }

  function build() {
    panel = document.createElement('section');
    panel.className = 'chat-panel';
    panel.hidden = true;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'PawPal adoption assistant');
    panel.innerHTML = `
      <div class="chat-head"><span class="ai-orb" style="width:36px;height:36px;border-radius:50%;background:radial-gradient(circle at 30% 30%,#FFD48A,#E49B2F 45%,#C4452A);display:grid;place-items:center">${icons.sparkle}</span>
        <div><b>PawPal assistant</b><small>Answers from live PawPal data</small></div>
        <button class="icon-btn" data-chat-new aria-label="Start a new conversation" title="New conversation">${icons.refresh}</button>
        <button class="icon-btn" data-chat-close aria-label="Close assistant">${icons.close}</button></div>
      <div class="chat-body" aria-live="polite"></div>
      <form class="chat-form"><label class="sr-only" for="chatInput">Message PawPal</label>
        <textarea id="chatInput" rows="1" maxlength="800" placeholder="Ask about pets, adoption or your application…"></textarea>
        <button class="btn btn-primary" type="submit" aria-label="Send">${icons.send}</button></form>
      <div class="chat-note">PawPal can make mistakes. Compatibility is guidance — the shelter team makes the final decision.</div>`;
    document.body.appendChild(panel);
    panel.querySelector('.chat-head .ai-orb svg').style.cssText = 'width:18px;height:18px;color:#fff';
    const form = panel.querySelector('form'); const ta = panel.querySelector('textarea');
    form.addEventListener('submit', (e) => { e.preventDefault(); send(ta.value); });
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(ta.value); } });
    ta.addEventListener('input', () => autosize(ta));
    panel.addEventListener('click', (e) => {
      const s = e.target.closest('[data-suggest]');
      if (s) send(s.dataset.suggest);
      if (e.target.closest('[data-chat-close]')) close();
      if (e.target.closest('[data-chat-new]')) {
        state = { messages: [], profile: null, conversationId: null, lastPetIds: [] };
        try { localStorage.removeItem('pp_convo'); } catch { /* ignore */ }
        save(); render(); toast('Started a new conversation', 'info');
      }
    });
    panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

    launcher = document.createElement('button');
    launcher.className = 'chat-launcher';
    launcher.setAttribute('aria-label', 'Ask PawPal');
    launcher.innerHTML = `<span class="ai-orb">${icons.sparkle}</span><span class="lbl">Ask PawPal</span>`;
    launcher.addEventListener('click', () => open());
    document.body.appendChild(launcher);
  }

  async function open(prefill, autoSend = false) {
    panel.hidden = false; launcher.hidden = true;
    render();
    await restoreFromServer();
    const ta = panel.querySelector('textarea');
    if (prefill && autoSend) send(prefill);
    else if (prefill) { ta.value = prefill; autosize(ta); }
    ta.focus();
  }
  // Reopen a saved conversation from the dashboard
  async function openConversation(id) {
    try { localStorage.setItem('pp_convo', id); } catch { /* ignore */ }
    state = { messages: [], profile: null, conversationId: null, lastPetIds: [] };
    loadedFromServer = false;
    await open();
  }
  function close() { panel.hidden = true; launcher.hidden = false; launcher.focus(); }

  PawPal.booted.then((u) => {
    if (PawPal.isStaffUser(u)) return; // staff have their own assistant in the shelter portal
    build();
    document.addEventListener('click', (e) => {
      const t = e.target.closest('[data-ask]');
      if (t) { e.preventDefault(); open(t.dataset.ask, true); }
    });
  });

  return { open, send, openConversation };
})();
