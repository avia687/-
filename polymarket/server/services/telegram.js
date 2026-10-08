// Telegram notifier. READ-ONLY system: it only sends outbound messages using a
// bot token + chat id supplied by the user via env or the settings API. The
// token is never logged in full and never committed.
import { config } from '../config.js';
import { logger } from '../logger.js';
import * as repo from '../db/repo.js';

// Resolve credentials: settings row takes precedence over env.
export function getTelegramCredentials() {
  const s = repo.getSettings();
  const botToken = s?.telegram_bot_token || config.telegram.botToken || '';
  const chatId = s?.telegram_chat_id || config.telegram.chatId || '';
  return { botToken, chatId };
}

export function isTelegramConfigured() {
  const { botToken, chatId } = getTelegramCredentials();
  return Boolean(botToken && chatId);
}

export async function sendTelegram(text, { botToken, chatId } = {}) {
  const creds = botToken && chatId ? { botToken, chatId } : getTelegramCredentials();
  if (!creds.botToken || !creds.chatId) {
    logger.warn('telegram not configured; skipping send');
    return { ok: false, skipped: true, reason: 'not_configured' };
  }
  const url = `https://api.telegram.org/bot${creds.botToken}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: creds.chatId, text, disable_web_page_preview: true }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.ok === false) {
      logger.error('telegram send failed', { status: res.status, description: body.description });
      return { ok: false, status: res.status, error: body.description || 'send failed' };
    }
    logger.info('telegram alert sent', { chatId: mask(creds.chatId) });
    return { ok: true };
  } catch (err) {
    logger.error('telegram send error', { error: err.message });
    return { ok: false, error: err.message };
  }
}

const mask = (s) => (s && s.length > 4 ? s.slice(0, 2) + '***' + s.slice(-2) : '***');
