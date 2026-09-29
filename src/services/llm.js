// Language model provider. Anthropic (Claude) when ANTHROPIC_API_KEY is set, otherwise OpenAI when
// OPENAI_API_KEY is set. With neither, llmEnabled is false and callers use PawPal's rules engine.
// Only public, filtered data is ever sent here (see ai.js) — never passwords, tokens, emails or staff notes.
const config = require('../config');

const provider = config.anthropicKey ? 'anthropic' : config.openaiKey ? 'openai' : null;
const llmEnabled = Boolean(provider);
const modelName = provider === 'anthropic' ? config.anthropicModel : provider === 'openai' ? config.openaiModel : null;
const providerLabel = provider === 'anthropic' ? `Claude (${modelName})` : provider === 'openai' ? `OpenAI (${modelName})` : 'PawPal rules engine';

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

async function complete({ system, messages, maxTokens = 700, json = false }) {
  if (!llmEnabled) throw new Error('No language model configured');
  const sys = json ? `${system}\n\nRespond with a single valid JSON object only — no markdown fences, no commentary.` : system;
  const text = provider === 'anthropic' ? await callAnthropic(sys, messages, maxTokens) : await callOpenAI(sys, messages, maxTokens, json);
  if (!json) return text;
  const start = text.indexOf('{'); const end = text.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('Model did not return JSON');
  return JSON.parse(text.slice(start, end + 1));
}

module.exports = { complete, llmEnabled, provider, providerLabel, modelName };
