// AI matching: step-by-step quiz with live ranked results (FR-05) + chatbot (FR-10).
(() => {
  const { $, $$, esc, photo, PLACEHOLDER, ageText, toast } = PawPal;

  const QUESTIONS = [
    { key: 'homeType', icon: '🏠', title: 'What kind of home do you have?', sub: "We'll match pets who'll be comfortable in your space.", style: 'col',
      options: [['apartment', '🏢', 'Apartment or small space', 'Unit, flat or townhouse without a yard'], ['house', '🏡', 'House with yard', 'Private garden or outdoor area'],
        ['farm', '🌿', 'Large property or farm', 'Acreage and lots of open space']] },
    { key: 'activity', icon: '⚡', title: "What's your lifestyle like?", sub: "We'll match your energy with the right companion.", style: 'row',
      options: [['3', '🏃', 'Active'], ['2', '🚶', 'Moderate'], ['1', '🛋️', 'Relaxed']] },
    { key: 'hoursAlone', icon: '⏰', title: 'How long would your pet be home alone?', sub: 'Some pets cope with alone time better than others.', style: 'row',
      options: [['2', '☕', 'Under 4 hrs'], ['6', '🕓', '4–8 hrs'], ['9', '💼', '8+ hrs']] },
    { key: 'hasChildren', icon: '👨‍👩‍👧', title: 'Are there children in your home?', sub: 'Including regular visits from young family members.', style: 'row',
      options: [['true', '🧒', 'Yes'], ['false', '🙂', 'No']] },
    { key: 'hasOtherPets', icon: '🐕', title: 'Do you already have other pets?', sub: 'Some of our pets prefer to be the only one.', style: 'row',
      options: [['true', '🐾', 'Yes'], ['false', '✨', 'No']] },
    { key: 'preferredType', icon: '💛', title: 'What kind of pet are you hoping for?', sub: 'Open to anything? We love that.', style: 'row',
      options: [['dog', '🐶', 'Dog'], ['cat', '🐱', 'Cat'], ['other', '🐰', 'Other'], ['any', '🌈', 'Any']] },
  ];
  const answers = {};
  let step = 0;
  let chatPrefs = {};
  const history = [];

  // ---------- results panel ----------
  function renderMatches(list, recText) {
    $('#aiRec').textContent = recText;
    if (!list.length) {
      $('#matchCards').innerHTML = '<p class="pp-muted pp-pad">No available pets match yet — new pets arrive every week.</p>';
      return;
    }
    $('#matchCards').innerHTML = list.map((m, i) => `<a class="match-card" href="pet-profile.html?id=${encodeURIComponent(m.pet.id)}">
        <div class="match-card-rank" aria-label="Rank ${i + 1}">#${i + 1}</div>
        <img src="${esc(photo(m.pet))}" alt="${esc(m.pet.name)}" onerror="this.onerror=null;this.src='${PLACEHOLDER}'"/>
        <div class="match-card-info">
          <div class="match-card-name">${esc(m.pet.name)}</div>
          <div class="match-card-breed">${esc(m.pet.breed)} · ${esc(ageText(m.pet.age))}</div>
          <div class="match-card-traits">${(m.reasons?.length ? m.reasons : m.pet.traits || []).slice(0, 2).map((t) => `<span class="trait-tag">${esc(t)}</span>`).join('')}</div>
        </div>
        <div class="match-pct"><span class="match-pct-num">${m.match}%</span><span class="match-pct-label">Match</span></div>
      </a>`).join('');
  }

  function recommendation() {
    const home = { apartment: 'apartment living', house: 'a home with a yard', farm: 'lots of open space' }[answers.homeType];
    const energy = { 3: 'high-energy', 2: 'easy-going', 1: 'calm' }[answers.activity];
    const bits = [energy && `${energy} pets`, home && `suited to ${home}`, answers.hasChildren === 'true' && 'gentle with children',
      answers.hasOtherPets === 'true' && 'happy with other animals'].filter(Boolean);
    return bits.length ? `Based on your answers, we recommend ${bits.join(', ')}.` : 'Answer a few questions and we\'ll suggest pets that suit your home.';
  }

  let reqId = 0;
  async function refresh(final = false) {
    const id = ++reqId;
    try {
      const { matches } = await PawPalAPI.post('/ai/match', { ...answers, final });
      if (id === reqId) renderMatches(matches, recommendation());
    } catch (err) { toast(err.message, 'error'); }
  }

  // ---------- quiz ----------
  function renderQuestion() {
    const q = QUESTIONS[step];
    $('#stepLabel').textContent = `Step ${step + 1} of ${QUESTIONS.length}`;
    $('#progressFill').style.width = `${((step + 1) / QUESTIONS.length) * 100}%`;
    const value = answers[q.key];
    const options = q.style === 'col'
      ? `<div class="quiz-options-col" role="radiogroup" aria-label="${esc(q.title)}">${q.options.map(([v, ic, t, s]) => `<button class="quiz-option ${value === v ? 'selected' : ''}" role="radio" aria-checked="${value === v}" data-value="${v}">
          <span class="quiz-option-icon">${ic}</span><span class="quiz-option-text"><strong>${t}</strong><small>${s}</small></span><span class="quiz-option-check" aria-hidden="true">✓</span></button>`).join('')}</div>`
      : `<div class="quiz-options-row" role="radiogroup" aria-label="${esc(q.title)}">${q.options.map(([v, ic, t]) => `<button class="quiz-option-pill ${value === v ? 'selected' : ''}" role="radio" aria-checked="${value === v}" data-value="${v}">
          <span class="pill-emoji">${ic}</span>${t}</button>`).join('')}</div>`;
    $('#questionHost').innerHTML = `<div class="quiz-question"><div class="quiz-question-icon" aria-hidden="true">${q.icon}</div><h2>${q.title}</h2><p>${q.sub}</p>${options}</div>`;
    $('#backBtn').disabled = step === 0;
    $('#nextBtn').textContent = step === QUESTIONS.length - 1 ? 'See my matches' : 'Next';
    $('#nextBtn').disabled = value === undefined;
  }

  $('#questionHost').addEventListener('click', (e) => {
    const b = e.target.closest('[data-value]');
    if (!b) return;
    answers[QUESTIONS[step].key] = b.dataset.value;
    renderQuestion();
    refresh();
    if (step < QUESTIONS.length - 1) setTimeout(() => { step++; renderQuestion(); }, 260);
  });
  $('#backBtn').addEventListener('click', () => { if (step > 0) { step--; renderQuestion(); } });
  $('#nextBtn').addEventListener('click', async () => {
    if (step < QUESTIONS.length - 1) { step++; renderQuestion(); return; }
    await refresh(true);
    $('#questionHost').innerHTML = `<div class="quiz-question quiz-done"><div class="quiz-question-icon" aria-hidden="true">🎉</div>
      <h2>Your matches are ready!</h2><p>Tap a pet to see their full profile, or chat with PawPal AI to fine-tune your picks.</p>
      <div class="quiz-done-actions"><button class="pp-btn pp-btn-primary" data-open-chat>Chat with PawPal AI</button><button class="pp-btn pp-btn-ghost" id="restartQuiz">Start again</button></div></div>`;
    $('#nextBtn').hidden = true;
    $('#backBtn').hidden = true;
    $('#resultsSub').textContent = 'Ranked by compatibility with your answers';
  });
  document.addEventListener('click', (e) => {
    if (e.target.closest('#restartQuiz')) { Object.keys(answers).forEach((k) => delete answers[k]); step = 0; $('#nextBtn').hidden = false; $('#backBtn').hidden = false; renderQuestion(); }
    if (e.target.closest('[data-open-chat]')) switchTab('chat');
  });

  // ---------- tabs ----------
  function switchTab(tab) {
    $$('.ai-tab').forEach((t) => { const on = t.dataset.tab === tab; t.classList.toggle('active', on); t.setAttribute('aria-selected', on); });
    $('#quizView').hidden = tab !== 'quiz';
    $('#chatView').hidden = tab !== 'chat';
    if (tab === 'chat') {
      if (!history.length) addBubble('ai', "Hi! I'm PawPal AI 🐾 Tell me about your home and lifestyle — for example, whether you live in an apartment, have kids, or love long walks — and I'll suggest pets that fit.");
      $('#chatInput').focus();
    }
  }
  $('.ai-tabs').addEventListener('click', (e) => { const t = e.target.closest('.ai-tab'); if (t) switchTab(t.dataset.tab); });

  // ---------- chat (FR-10) ----------
  function addBubble(who, text) {
    const div = document.createElement('div');
    div.className = `chat-bubble chat-${who}`;
    div.textContent = text;
    $('#chatLog').appendChild(div);
    $('#chatLog').scrollTop = $('#chatLog').scrollHeight;
    if (who === 'ai' || who === 'user') history.push({ role: who === 'user' ? 'user' : 'assistant', content: text });
    return div;
  }
  async function send(text) {
    const message = text.trim();
    if (!message) return;
    addBubble('user', message);
    $('#chatInput').value = '';
    $('#chatSuggest').hidden = true;
    const typing = document.createElement('div');
    typing.className = 'chat-bubble chat-ai chat-typing';
    typing.innerHTML = '<span></span><span></span><span></span>';
    $('#chatLog').appendChild(typing);
    $('#chatSend').disabled = true;
    try {
      const r = await PawPalAPI.post('/ai/chat', { message, history: history.slice(0, -1), prefs: chatPrefs });
      chatPrefs = r.prefs || chatPrefs;
      typing.remove();
      addBubble('ai', r.reply);
      if (r.picks?.length) { renderMatches(r.picks, 'Picked by PawPal AI from your conversation.'); $('#resultsSub').textContent = 'Based on your chat with PawPal AI'; }
    } catch (err) {
      typing.remove();
      addBubble('system', err.message);
    }
    $('#chatSend').disabled = false;
    $('#chatInput').focus();
  }
  $('#chatForm').addEventListener('submit', (e) => { e.preventDefault(); send($('#chatInput').value); });
  $('#chatSuggest').addEventListener('click', (e) => { const b = e.target.closest('[data-say]'); if (b) send(b.dataset.say); });

  // ---------- start ----------
  renderQuestion();
  $('#matchCards').innerHTML = [1, 2, 3].map((n) => `<div class="match-card match-card-empty"><div class="match-card-rank">#${n}</div><span>Your match appears here</span></div>`).join('');
  if (PawPal.params.get('tab') === 'chat') switchTab('chat');
})();
