// Language model provider, in order of preference: Anthropic, OpenAI, Google Gemini (free tier).
// With no key, llmEnabled is false and callers use PawPal's rules engine.
// Only public, filtered data is ever sent here (see ai.js) — never passwords, tokens, emails or staff notes.
const config = require('../config');

const provider = config.anthropicKey ? 'anthropic' : config.openaiKey ? 'openai' : config.geminiKey ? 'gemini' : null;
const llmEnabled = Boolean(provider);
const modelName = { anthropic: config.anthropicModel, openai: config.openaiModel, gemini: config.geminiModel }[provider] || null;
const providerLabel = { anthropic: `Anthropic (${modelName})`, openai: `OpenAI (${modelName})`, gemini: `Google Gemini (${modelName})` }[provider] || 'PawPal rules engine';

// Anthropic requires alternating roles that start with "user"
function normaliseTurns(messages) {
  const out = [];
  for (const m of messages) {
    const role = m.role === 'assistant' ? 'assistant' : 'user';
    const content = String(m.content || '').slice(0, 4000);
    if (!content) continue;
    if (out.length && out[out.length - 1].role === role) out[out.length - 1].content += `\n\n${content}`;
    else out.push({ role, content });
  }
  while (out.length && out[0].role !== 'user') out.shift();
  return out;
}

async function callAnthropic(system, messages, maxTokens) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': config.anthropicKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: config.anthropicModel, max_tokens: maxTokens, system, messages: normaliseTurns(messages) }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Anthropic error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
}

async function callOpenAI(system, messages, maxTokens, json) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.openaiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: config.openaiModel, max_tokens: maxTokens, temperature: 0.5,
      messages: [{ role: 'system', content: system }, ...normaliseTurns(messages)],
      ...(json ? { response_format: { type: 'json_object' } } : {}) }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`OpenAI error ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
}

// Gemini through Google's OpenAI-compatible endpoint. If the configured model name is rejected
// (Google renames models over time), ask Google which models exist and switch to a Flash model.
const GEMINI = 'https://generativelanguage.googleapis.com/v1beta';
let geminiModel = config.geminiModel;
async function pickGeminiModel() {
  const res = await fetch(`${GEMINI}/models?pageSize=200`, { headers: { 'x-goog-api-key': config.geminiKey }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Gemini models ${res.status}`);
  const names = ((await res.json()).models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map((m) => m.name.replace(/^models\//, ''))
    .filter((n) => /^gemini-.*flash/.test(n) && !/lite|tts|image|audio|live|embed|thinking|exp/.test(n));
  const stable = names.filter((n) => !/preview/.test(n));
  const pick = (stable.length ? stable : names).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))[0];
  if (!pick) throw new Error('No Gemini Flash model available for this key');
  console.log(`🤖 Gemini model "${geminiModel}" unavailable — using "${pick}" instead.`);
  return pick;
}
async function callGemini(system, messages, maxTokens, retried = false) {
  const res = await fetch(`${GEMINI}/openai/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.geminiKey}`, 'Content-Type': 'application/json' },
    // Flash models may "think" before answering, which uses output tokens — leave generous headroom
    body: JSON.stringify({ model: geminiModel, max_tokens: maxTokens + 2048, temperature: 0.5,
      messages: [{ role: 'system', content: system }, ...normaliseTurns(messages)] }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    const body = await res.text();
    const retryInfo = (/"retryDelay":\s*"[^"]+"/.exec(body) || [''])[0];
    const detail = `${body.slice(0, 300)}${/PerDay/.test(body) ? ' PerDay' : ''} ${retryInfo}`.trim();
    if (!retried && (res.status === 404 || /model/i.test(detail) && res.status === 400)) {
      geminiModel = await pickGeminiModel();
      return callGemini(system, messages, maxTokens, true);
    }
    throw new Error(`Gemini error ${res.status}: ${detail}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
}

// When the provider says the quota or rate limit is used up (HTTP 429), stop calling it for a while instead of
// failing on every request. Callers fall back to PawPal's rules engine in the meantime.
let pausedUntil = 0;
function pauseFor(err) {
  const msg = String(err.message || '');
  const retry = /retry(?:Delay)?["\s:]*"?(\d+(?:\.\d+)?)s/i.exec(msg);
  const daily = /per ?day|PerDay|daily/i.test(msg);
  const ms = daily ? 60 * 60 * 1000 : retry ? Math.min(15 * 60, Math.ceil(Number(retry[1])) + 5) * 1000 : 2 * 60 * 1000;
  pausedUntil = Date.now() + ms;
  console.warn(`🤖 ${providerLabel} limit reached — using PawPal's matching engine for the next ${Math.round(ms / 60000) || 1} min.`);
}
const isPaused = () => Date.now() < pausedUntil;

async function complete({ system, messages, maxTokens = 700, json = false }) {
  if (!llmEnabled) throw new Error('No language model configured');
  if (isPaused()) throw Object.assign(new Error('AI temporarily paused (usage limit)'), { quiet: true });
  const sys = json ? `${system}\n\nRespond with a single valid JSON object only — no markdown fences, no commentary.` : system;
  let text;
  try {
    text = provider === 'anthropic' ? await callAnthropic(sys, messages, maxTokens)
      : provider === 'gemini' ? await callGemini(sys, messages, maxTokens) : await callOpenAI(sys, messages, maxTokens, json);
  } catch (err) {
    if (/ error 429\b/.test(err.message)) { pauseFor(err); throw Object.assign(new Error('AI usage limit reached'), { quiet: true }); }
    throw err;
  }
  if (!json) return text;
  const start = text.indexOf('{'); const end = text.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('Model did not return JSON');
  return JSON.parse(text.slice(start, end + 1));
}

module.exports = { complete, llmEnabled, provider, providerLabel, modelName, isPaused };
