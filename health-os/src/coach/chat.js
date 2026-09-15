// Conversational coach. One person, full history, guardrails in the system prompt.

import { model, safeCreate, textOf } from './client.js';
import { stableSystem, stateSystem } from './prompt.js';
import * as repo from '../repo/index.js';

const MAX_TOKENS = 1200; // a nudge, not an essay

/**
 * Build the two-block system prompt. The stable block carries the cache
 * breakpoint; the volatile state block goes after it so a changed number does
 * not invalidate the 3k-token profile in front of it.
 */
export function systemBlocks(profile, ctx) {
  return [
    { type: 'text', text: stableSystem(profile, ctx.date), cache_control: { type: 'ephemeral' } },
    { type: 'text', text: stateSystem(ctx) },
  ];
}

/** Answer a free-text message from him. */
export async function reply(profile, ctx, userText, { history = [] } = {}) {
  const messages = [
    ...history.map((m) => ({ role: m.direction === 'in' ? 'user' : 'assistant', content: m.body })),
    { role: 'user', content: userText },
  ];
  const res = await safeCreate({
    model: model(),
    max_tokens: MAX_TOKENS,
    system: systemBlocks(profile, ctx),
    messages: collapse(messages),
  });
  if (!res.ok) return { ok: false, text: `⚠️ ${res.error}` };
  return { ok: true, text: textOf(res.response) || '…' };
}

/**
 * Generate one of the scheduled messages. `instruction` says what this
 * particular message is for; the context block supplies the facts.
 */
export async function generate(profile, ctx, instruction, { maxTokens = MAX_TOKENS, thinking = false } = {}) {
  const params = {
    model: model(),
    max_tokens: maxTokens,
    system: systemBlocks(profile, ctx),
    messages: [{ role: 'user', content: instruction }],
  };
  // The brief and the weekly review synthesise several signals; the quick
  // nudges do not, and latency matters more there.
  if (thinking) params.thinking = { type: 'adaptive' };
  const res = await safeCreate(params);
  if (!res.ok) return { ok: false, text: `⚠️ ${res.error}` };
  return { ok: true, text: textOf(res.response) || '…' };
}

/** Load recent turns for continuity. */
export async function history(userId, limit = 16) {
  return repo.messages.recentChat(userId, limit);
}

/** The API rejects an empty first turn and prefers alternating roles. */
function collapse(messages) {
  const out = [];
  for (const m of messages) {
    const content = String(m.content ?? '').trim();
    if (!content) continue;
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.content += `\n\n${content}`;
    else out.push({ role: m.role, content });
  }
  while (out.length && out[0].role !== 'user') out.shift();
  if (!out.length) out.push({ role: 'user', content: '…' });
  return out;
}
