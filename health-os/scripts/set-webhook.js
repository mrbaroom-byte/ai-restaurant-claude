#!/usr/bin/env node
// Point Telegram at this deployment. Run once after the first deploy, and
// again whenever PUBLIC_BASE_URL changes.
import { setWebhook, getMe } from '../src/channels/telegram.js';

const base = process.env.PUBLIC_BASE_URL;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
if (!base || !secret) {
  console.error('PUBLIC_BASE_URL and TELEGRAM_WEBHOOK_SECRET must be set');
  process.exit(1);
}
const url = `${base.replace(/\/$/, '')}/telegram/${secret}`;
const me = await getMe();
await setWebhook(url, secret);
console.log(`webhook for @${me.username} -> ${url}`);
