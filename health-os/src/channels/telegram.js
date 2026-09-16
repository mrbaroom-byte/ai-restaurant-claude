// Telegram Bot API over plain fetch. No SDK: the surface used here is four
// endpoints, and the bot token must not travel any further than it has to.

// Overridable so the scheduler and router can be exercised against a stub.
const API = process.env.TELEGRAM_API_BASE || 'https://api.telegram.org';

function token() {
  const t = process.env.TELEGRAM_BOT_TOKEN;
  if (!t) throw new Error('TELEGRAM_BOT_TOKEN is not set');
  return t;
}

export function chatId() {
  const c = process.env.TELEGRAM_CHAT_ID;
  if (!c) throw new Error('TELEGRAM_CHAT_ID is not set');
  return c;
}

async function call(method, body) {
  const res = await fetch(`${API}/bot${token()}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.ok === false) {
    throw new Error(`telegram ${method} failed: ${json.description ?? res.status}`);
  }
  return json.result;
}

/** Telegram rejects messages over 4096 chars; split on paragraph boundaries. */
function chunk(text, limit = 3800) {
  const out = [];
  let rest = String(text);
  while (rest.length > limit) {
    let cut = rest.lastIndexOf('\n\n', limit);
    if (cut < limit * 0.5) cut = rest.lastIndexOf('\n', limit);
    if (cut < limit * 0.5) cut = limit;
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\n+/, '');
  }
  if (rest) out.push(rest);
  return out;
}

export async function sendMessage(text, { to = null, keyboard = null, parseMode = null } = {}) {
  const target = to ?? chatId();
  const parts = chunk(text);
  let last = null;
  for (let i = 0; i < parts.length; i++) {
    const body = { chat_id: target, text: parts[i], disable_web_page_preview: true };
    if (parseMode) body.parse_mode = parseMode;
    if (keyboard && i === parts.length - 1) body.reply_markup = { inline_keyboard: keyboard };
    last = await call('sendMessage', body);
  }
  return last;
}

export async function sendChatAction(action = 'typing', to = null) {
  try { await call('sendChatAction', { chat_id: to ?? chatId(), action }); } catch { /* cosmetic */ }
}

export async function answerCallbackQuery(id, text = '') {
  try { await call('answerCallbackQuery', { callback_query_id: id, text }); } catch { /* cosmetic */ }
}

/** Download a photo/document the user sent. Returns { base64, mediaType }. */
export async function downloadFile(fileId) {
  const file = await call('getFile', { file_id: fileId });
  const res = await fetch(`${API}/file/bot${token()}/${file.file_path}`);
  if (!res.ok) throw new Error(`telegram file download failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return { base64: buf.toString('base64'), mediaType: mediaTypeFor(file.file_path), bytes: buf.length };
}

function mediaTypeFor(p) {
  const ext = String(p).toLowerCase().split('.').pop();
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  return 'image/jpeg';
}

export async function setWebhook(url, secret) {
  return call('setWebhook', {
    url,
    secret_token: secret,
    allowed_updates: ['message', 'edited_message', 'callback_query'],
    drop_pending_updates: true,
  });
}

export async function deleteWebhook() { return call('deleteWebhook', { drop_pending_updates: false }); }
export async function getMe() { return call('getMe', {}); }
