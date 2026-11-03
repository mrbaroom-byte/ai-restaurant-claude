import Anthropic from '@anthropic-ai/sdk';

let client = null;

export function anthropic() {
  if (client) return client;
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set');
  client = new Anthropic({ maxRetries: 3, timeout: 120_000 });
  return client;
}

// The build spec pinned claude-sonnet-4-6. Override with ANTHROPIC_MODEL;
// claude-sonnet-5 and claude-opus-5 are the current generation.
export function model() {
  return process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
}

/** Concatenate the text blocks of a response, ignoring thinking and tool blocks. */
export function textOf(response) {
  return (response?.content ?? [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
}

/** The first tool_use block matching `name`, or null. */
export function toolInput(response, name) {
  const block = (response?.content ?? []).find((b) => b.type === 'tool_use' && b.name === name);
  return block ? block.input : null;
}

/**
 * Last-resort JSON extraction from prose. The spec calls for this explicitly:
 * strip code fences before parsing, and never let a malformed reply throw into
 * the message loop.
 */
export function parseLooseJson(text) {
  if (!text) return null;
  let s = String(text).trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  try { return JSON.parse(s); } catch { /* fall through */ }
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try { return JSON.parse(s.slice(start, end + 1)); } catch { /* fall through */ }
  }
  return null;
}

/** Friendly, non-throwing wrapper. Errors become a message, not a crash. */
export async function safeCreate(params) {
  try {
    const res = await anthropic().messages.create(params);
    return { ok: true, response: res };
  } catch (e) {
    const status = e?.status ?? null;
    let hint = e?.message ?? String(e);
    if (status === 401) hint = 'Anthropic rejected the API key.';
    else if (status === 429) hint = 'Anthropic rate limit hit. Try again in a minute.';
    else if (status >= 500) hint = 'Anthropic had a server error. Try again shortly.';
    console.error('[coach] api error', status, e?.message);
    return { ok: false, error: hint, status };
  }
}
