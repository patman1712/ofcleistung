import twilio from 'twilio';
import axios from 'axios';
import { prisma } from '../lib/prisma.js';

export type ReminderProvider = 'twilio' | 'callmebot' | 'evolution' | 'telegram';

// ======== Setting Keys ========
export const WA_KEYS = {
  // Allgmein
  ENABLED: 'wa_enabled',
  PROVIDER: 'wa_provider', // 'twilio' | 'callmebot' | 'evolution' | 'telegram'
  TIME: 'wa_time',
  MESSAGE: 'wa_message',
  TIMEZONE: 'wa_timezone',

  // Twilio (alte Keys bleiben erhalten!)
  SID: 'wa_accountSid',
  AUTH: 'wa_authToken',
  FROM: 'wa_from',

  // 🆕 CallMeBot
  CALLMEBOT_APIKEY: 'wa_callmebot_apikey', // Format: "123456" (User bekommt Nummer pro Handy)
  // ❗ CallMeBot braucht **individuellen ApiKey PRO Nummer!**
  // → Deshalb nutzen wir PlayerProfile.phoneNumber UND callmebot_apikey NUR als "Admin-ApiKey, falls vorhanden
  // Für CallMeBot Einrichtung: Jede Nummer bekommt einen eigenen Key
  // Wir bauen ein Fallback Mapping: Setting CallMeBot APIKEY = Default-Key für Admin Test.
  // Für echte Spieler wird eine WA-Nachricht an CallMeBot geschickt.

  // 🆕 Evolution API (OpenSource WhatsApp HTTP Gateway)
  EVO_BASE: 'wa_evo_base', // z.B. "https://evo.meinedomain.de"
  EVO_INSTANCE: 'wa_evo_instance', // z.B. "ofc-bot"
  EVO_APIKEY: 'wa_evo_apikey', // z.B. "Bearer ..." oder nur APIKey String

  // 🆕 Telegram
  TELEGRAM_BOT_TOKEN: 'wa_telegram_bottoken', // von @BotFather
  // ChatId für Spieler wird pro User in Setting pro Spieler gespeichert?
  // Einfacher: PlayerProfile hat phoneNumber → für Telegram nutzen wir playerId als "Key" +
  // Wir speichern pro Spieler in Setting Tabelle? Nein, Einfacher: PlayerProfile bekommt telegramChatId String?
  // ABER: Um Schema Migration zu sparen: Nutzen wir Setting Tabelle mit Key pattern `tg_chatid_{playerId}`
} as const;

// ======== Telefonnummer normalisieren ========
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw.replace(/[^\d+]/g, '');
  if (!s) return null;
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (/^0[1-9]/.test(s)) s = '+49' + s.slice(1);
  if (!s.startsWith('+')) s = '+49' + s;
  if (s.length < 8) return null;
  return s;
}

// ======== Config ========
export interface WhatsAppConfig {
  enabled: boolean;
  provider: ReminderProvider;
  time: string;
  message: string;
  timezone: string;

  accountSid?: string;
  authToken?: string;
  from?: string;

  callmebotApikey?: string;

  evoBase?: string;
  evoInstance?: string;
  evoApikey?: string;

  telegramBotToken?: string;
}

export async function loadWAConfig(): Promise<WhatsAppConfig> {
  const rows = await prisma.setting.findMany({
    where: { key: { in: Object.values(WA_KEYS) } },
  });
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;

  const provider = (map[WA_KEYS.PROVIDER] as ReminderProvider) || 'twilio';
  return {
    enabled: map[WA_KEYS.ENABLED] === 'true',
    provider,
    time: map[WA_KEYS.TIME] || '09:00',
    message:
      map[WA_KEYS.MESSAGE] ||
      'Hallo {{name}}! Bitte nicht vergessen – den täglichen Fragebogen auszufüllen.\nDanke! 💪⚽',
    timezone: map[WA_KEYS.TIMEZONE] || 'Europe/Berlin',
    accountSid: map[WA_KEYS.SID],
    authToken: map[WA_KEYS.AUTH],
    from: map[WA_KEYS.FROM],
    callmebotApikey: map[WA_KEYS.CALLMEBOT_APIKEY],
    evoBase: map[WA_KEYS.EVO_BASE],
    evoInstance: map[WA_KEYS.EVO_INSTANCE],
    evoApikey: map[WA_KEYS.EVO_APIKEY],
    telegramBotToken: map[WA_KEYS.TELEGRAM_BOT_TOKEN],
  };
}

// ======== Telegram: ChatId abrufen (pro Spieler) ========
export async function getPlayerTelegramChatId(playerId: string): Promise<string | null> {
  const row = await prisma.setting.findUnique({ where: { key: `tg_chatid_${playerId}` } });
  return row?.value || null;
}

export async function setPlayerTelegramChatId(playerId: string, chatId: string): Promise<void> {
  await prisma.setting.upsert({
    where: { key: `tg_chatid_${playerId}` },
    create: { key: `tg_chatid_${playerId}`, value: chatId },
    update: { value: chatId },
  });
}

// ======== Twilio ========
let _twilioClient: twilio.Twilio | null = null;
export function getTwilioClient(cfg: WhatsAppConfig): twilio.Twilio | null {
  if (!cfg.accountSid || !cfg.authToken) return null;
  if (_twilioClient) return _twilioClient;
  try {
    _twilioClient = twilio(cfg.accountSid, cfg.authToken);
    return _twilioClient;
  } catch {
    return null;
  }
}
export function resetTwilioCache() {
  _twilioClient = null;
}

// ======== Versand-Interface ========
export interface SendResult { ok: boolean; sid?: string; error?: string; provider: ReminderProvider }

export async function sendReminderMessage(
  cfg: WhatsAppConfig,
  ctx: {
    playerId: string;
    phoneRaw?: string | null;
    text: string;
  },
): Promise<SendResult> {
  const text = (ctx.text || '').slice(0, 4000);
  switch (cfg.provider) {
    case 'callmebot':
      return sendCallMeBot(cfg, ctx.phoneRaw, text);
    case 'evolution':
      return sendEvolution(cfg, ctx.phoneRaw, text);
    case 'telegram':
      return sendTelegram(cfg, ctx.playerId, text);
    case 'twilio':
    default:
      return sendTwilio(cfg, ctx.phoneRaw, text);
  }
}

// ======== Provider 1: Twilio (bestehend) ========
async function sendTwilio(cfg: WhatsAppConfig, toPhoneRaw: string | null | undefined, text: string): Promise<SendResult> {
  if (!cfg.accountSid || !cfg.authToken || !cfg.from) {
    return { provider: 'twilio', ok: false, error: 'Twilio nicht konfiguriert (fehlen SID/Token/Absender)' };
  }
  const to = normalizePhone(toPhoneRaw);
  if (!to) return { provider: 'twilio', ok: false, error: 'Ungültige Telefonnummer' };
  const client = getTwilioClient(cfg);
  if (!client) return { provider: 'twilio', ok: false, error: 'Twilio-Client konnte nicht initialisiert werden' };
  try {
    const msg = await client.messages.create({
      from: cfg.from,
      to: `whatsapp:${to}`,
      body: text.slice(0, 1600),
    });
    return { provider: 'twilio', ok: true, sid: msg.sid };
  } catch (e: any) {
    return { provider: 'twilio', ok: false, error: e?.message || String(e) };
  }
}

// ======== Provider 2: CallMeBot ========
// Pro Nummer: User schickt einmal "I allow callmebot to send me messages" an +34644672202 (WhatsApp Nummer von CallMeBot)
// → bekommt einen 6-stelligen API KEY per WA zurück.
// Einrichtung: Admin-Apikey in Settings. Wir senden an: https://api.callmebot.com/whatsapp.php?phone=+49XXXX&text=URL_ENCODED&apikey=123456
async function sendCallMeBot(cfg: WhatsAppConfig, toPhoneRaw: string | null | undefined, text: string): Promise<SendResult> {
  const to = normalizePhone(toPhoneRaw);
  if (!to) return { provider: 'callmebot', ok: false, error: 'Ungültige Telefonnummer' };
  if (!cfg.callmebotApikey) {
    return { provider: 'callmebot', ok: false, error: 'CallMeBot: Fehlender APIKey in Einstellungen (CallMeBot Apikey)' };
  }
  try {
    const url = 'https://api.callmebot.com/whatsapp.php';
    const params = new URLSearchParams({ phone: to, text: text.slice(0, 700), apikey: cfg.callmebotApikey });
    const resp = await axios.get(`${url}?${params.toString()}`, { timeout: 15000 });
    const body = (resp.data || '').toString();
    // Erfolgreiche CallMeBot-Antworten enthalten HTML mit "success" oder "Message queued"
    if (body.toLowerCase().includes('error') || /(\b\d+ errors?\b)/i.test(body) || /(invalid apikey|bad request)/i.test(body)) {
      return { provider: 'callmebot', ok: false, error: `CallMeBot HTML: ${body.replace(/<[^>]*>/g, ' ').trim().slice(0, 200)}` };
    }
    return { provider: 'callmebot', ok: true, sid: `callmebot-${Math.random().toString(36).slice(2, 10)}` };
  } catch (e: any) {
    return { provider: 'callmebot', ok: false, error: e?.message || String(e) };
  }
}

// ======== Provider 3: Evolution API (Open Source WhatsApp Gateway, selbst hosten) ========
// Dokumentation: https://doc.evolution-api.com/
// Route: POST /message/sendText/{{instanceName}}
// Headers: apikey: <DEIN_APIKEY>
// Body: { "number": "551100000000", "text": "Hallo", "options": { "delay": 1200, "presence": "composing" } }
async function sendEvolution(cfg: WhatsAppConfig, toPhoneRaw: string | null | undefined, text: string): Promise<SendResult> {
  if (!cfg.evoBase || !cfg.evoInstance) {
    return { provider: 'evolution', ok: false, error: 'Evolution API: Base URL oder Instance fehlt in Einstellungen' };
  }
  const to = normalizePhone(toPhoneRaw);
  if (!to) return { provider: 'evolution', ok: false, error: 'Ungültige Telefonnummer' };
  const plainNumber = to.replace(/^\+/, ''); // Evolution erwartet manchmal Nummer ohne +
  try {
    const url = `${cfg.evoBase.replace(/\/$/, '')}/message/sendText/${encodeURIComponent(cfg.evoInstance)}`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (cfg.evoApikey) headers.apikey = cfg.evoApikey;
    const resp = await axios.post(
      url,
      { number: plainNumber, text: text.slice(0, 6000), options: { delay: 1200, presence: 'composing' } },
      { headers, timeout: 20000, validateStatus: () => true },
    );
    const ok = resp.status >= 200 && resp.status < 300;
    return {
      provider: 'evolution',
      ok,
      sid: resp.data?.key?.id || resp.data?.message?.id || `evo-${resp.status}`,
      error: ok ? undefined : `HTTP ${resp.status}: ${JSON.stringify(resp.data).slice(0, 250)}`,
    };
  } catch (e: any) {
    return { provider: 'evolution', ok: false, error: e?.message || String(e) };
  }
}

// ======== Provider 4: Telegram ========
// 1) Admin erstellt Telegram Bot via @BotFather → /newbot → bekommt BOT-TOKEN
// 2) Spieler öffnet Bot-Link, schickt "/start OFC-{playerId}" oder einfach /start
// 3) Bot speichert automatisch in Setting Key tg_chatid_{playerId} → benötigt Webhook (oder wir machen es manuell)
//    Einfache Lösung hier: Wir lassen einfach die ChatId manuell pro Spieler im Admin hinterlegen
async function sendTelegram(cfg: WhatsAppConfig, playerId: string, text: string): Promise<SendResult> {
  if (!cfg.telegramBotToken) {
    return { provider: 'telegram', ok: false, error: 'Telegram: Bot Token fehlt (von @BotFather)' };
  }
  const chatId = await getPlayerTelegramChatId(playerId);
  if (!chatId) {
    return { provider: 'telegram', ok: false, error: 'Telegram: Keine ChatId für Spieler hinterlegt (Bot /start im Telegram-Chat schicken!)' };
  }
  try {
    const url = `https://api.telegram.org/bot${cfg.telegramBotToken}/sendMessage`;
    const resp = await axios.post(
      url,
      { chat_id: chatId, text: text.slice(0, 4096), parse_mode: 'HTML' },
      { timeout: 15000, validateStatus: () => true },
    );
    const ok = resp.data?.ok === true;
    return {
      provider: 'telegram',
      ok,
      sid: resp.data?.result?.message_id ? String(resp.data.result.message_id) : `tg-${resp.status}`,
      error: ok ? undefined : (resp.data?.description || `HTTP ${resp.status}`),
    };
  } catch (e: any) {
    return { provider: 'telegram', ok: false, error: e?.message || String(e) };
  }
}
