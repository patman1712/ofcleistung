import { Router } from 'express';
import { z } from 'zod';
import axios from 'axios';
import { prisma } from '../lib/prisma.js';
import { requireAdmin, authMiddleware } from '../middleware/auth.js';
import { asString } from '../types.js';
import {
  loadWAConfig,
  sendReminderMessage,
  resetTwilioCache,
  WA_KEYS,
  normalizePhone,
  setPlayerTelegramChatId,
  getPlayerTelegramChatId,
  ReminderProvider,
} from '../services/whatsappService.js';
import { runDailyReminderCheck, rescheduleWhatsApp } from '../services/whatsappScheduler.js';

const router = Router();

// Öffentlich: Branding
router.get('/branding', async (req, res) => {
  try {
    const keys = ['logo', 'favicon', 'appTitle', 'appName'];
    const rows = await prisma.setting.findMany({ where: { key: { in: keys } } });
    const result: Record<string, string | null> = {};
    for (const k of keys) result[k] = null;
    for (const r of rows) result[r.key] = r.value;
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Alle Settings abrufen
router.get('/', authMiddleware, requireAdmin, async (req, res) => {
  const rows = await prisma.setting.findMany({ orderBy: { key: 'asc' } });
  const result: Record<string, string> = {};
  for (const r of rows) result[r.key] = r.value;
  res.json(result);
});

// Admin: Einzelnes Key speichern
router.put('/:key', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const key = asString(req.params.key)!;
    const value = typeof req.body?.value === 'string' ? req.body.value : String(req.body ?? '');
    const upserted = await prisma.setting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
      select: { key: true, value: true, updatedAt: true },
    });
    if (
      key === WA_KEYS.TIME ||
      key === WA_KEYS.ENABLED ||
      key === WA_KEYS.TIMEZONE ||
      key === WA_KEYS.PROVIDER
    ) {
      resetTwilioCache();
      try { rescheduleWhatsApp(); } catch {/* ok */}
    }
    if (key === WA_KEYS.SID || key === WA_KEYS.AUTH || key === WA_KEYS.FROM) {
      resetTwilioCache();
    }
    res.json(upserted);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Fehler' });
  }
});

// WhatsApp: Bulk-Save
const waBulkSchema = z.object({
  values: z.record(z.string(), z.union([z.string(), z.boolean()])),
});

router.post('/whatsapp/save-bulk', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const body = waBulkSchema.parse(req.body);
    const entries: [string, string][] = Object.entries(body.values).map(([k, v]) => [
      k,
      typeof v === 'boolean' ? (v ? 'true' : 'false') : String(v),
    ]);
    for (const [key, value] of entries) {
      await prisma.setting.upsert({
        where: { key },
        create: { key, value },
        update: { value },
      });
    }
    resetTwilioCache();
    try { rescheduleWhatsApp(); } catch {/* ok */}
    res.json({ ok: true, updated: entries.length });
  } catch (err: any) {
    res.status(400).json({ error: err.issues ? err.issues.map((i: any) => i.message).join(', ') : err.message });
  }
});

// Test: Nachricht senden (via ausgewählter Provider)
const testSchema = z.object({
  to: z.string().min(3),
  text: z.string().optional().nullable(),
  playerId: z.string().optional().nullable(),
});
router.post('/whatsapp/test-send', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const body = testSchema.parse(req.body);
    const cfg = await loadWAConfig();
    const defaultText = `🧪 *OFC Test-Nachricht* ✅\n\nProvider: ${cfg.provider}\nHallo {{name}}! WhatsApp-Erinnerungen funktionieren.`;
    const text = body.text?.trim() || defaultText;
    const playerId = body.playerId || 'admin-test';
    const to = body.to;
    const r = await sendReminderMessage(cfg, { playerId, phoneRaw: to, text });
    res.status(r.ok ? 200 : 400).json(r);
  } catch (err: any) {
    res.status(400).json({
      ok: false,
      provider: 'error',
      error: err.issues ? err.issues.map((i: any) => i.message).join(', ') : err.message,
    });
  }
});

// 🔍 DEBUG: Echter RAW Request an Provider (ohne Error Parsing!) - gibt original HTML/Status/Headers zurück
router.post('/whatsapp/debug-send', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const body = testSchema.parse(req.body);
    const cfg = await loadWAConfig();
    const defaultText = `🧪 OFC DEBUG Test ✅\nProvider: ${cfg.provider}`;
    const text = body.text?.trim() || defaultText;
    const toRaw = body.to;
    const to = normalizePhone(toRaw) || toRaw;

    const debug: Record<string, any> = {
      provider: cfg.provider,
      inputPhone: toRaw,
      normalizedPhone: to,
      normalized: to && to.startsWith('+'),
      callAt: new Date().toISOString(),
    };

    if (cfg.provider === 'callmebot') {
      debug.apikey = (cfg.callmebotApikey || '').slice(0, 3) + '*** (masked)';
      debug.apikeyLength = (cfg.callmebotApikey || '').length;
      try {
        const url = 'https://api.callmebot.com/whatsapp.php';
        const params = new URLSearchParams({ phone: to, text: text.slice(0, 700), apikey: cfg.callmebotApikey || '' });
        const fullUrl = `${url}?phone=${encodeURIComponent(to)}&text=<${text.length} chars>&apikey=${(cfg.callmebotApikey || '').slice(0, 3)}***`;
        debug.request = { method: 'GET', url: fullUrl };

        const startAt = Date.now();
        const resp = await axios.get(`${url}?${params.toString()}`, {
          timeout: 20000,
          validateStatus: () => true,
          responseType: 'text',
          transformResponse: [(data) => data],
        });
        debug.responseMs = Date.now() - startAt;
        debug.httpStatus = resp.status;
        debug.httpStatusText = resp.statusText;
        debug.responseHeaders = Object.fromEntries(Object.entries(resp.headers || {}).filter(([k]) =>
          !['date', 'server', 'set-cookie'].includes(k.toLowerCase())
        ));
        const bodyRaw = String(resp.data || '');
        debug.responseBodyRaw = bodyRaw;
        debug.responseBodyNoHtml = bodyRaw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1000);
        // Heuristiken
        const noHtmlLow = debug.responseBodyNoHtml.toLowerCase();
        debug.guess = [];
        if (noHtmlLow.includes('invalid apikey') || noHtmlLow.includes('apikey not valid') || noHtmlLow.includes('wrong apikey'))
          debug.guess.push('❌ APIKEY FALSCH: 6-stelliger Key stimmt nicht (falsch abgetippt?)');
        if (noHtmlLow.match(/number.*not.*(allow|author|activ|verif)|allow.*callmebot|need.*to.*allow/i))
          debug.guess.push(`❌ NUMMER NICHT FREIGEGEBEN: Key ${cfg.callmebotApikey?.slice(0,3)}*** ist NUR für EINE ANDERE NUMMER gültig! Sende "I allow callmebot..." VON ${to} aus an +34644672202 um DIESER Nummer einen eigenen Key zu holen.`);
        if (noHtmlLow.match(/limit|exceed|quota|month|100 message/i))
          debug.guess.push('⚠️ FREE TIER LIMIT ERREICHT (100/Monat). Kaufe Lifetime Upgrade auf callmebot.com für ~5€.');
        if (noHtmlLow.match(/message.*sent|queued|successfully/i))
          debug.guess.push('✅ CallMeBot sagt: VERSAND ERFOLGREICH - wenn WhatsApp trotzdem leer bleibt, bei CallMeBot melden oder Nummer auf Blacklist prüfen.');
        if (debug.guess.length === 0)
          debug.guess.push('ℹ️ Keine eindeutige Erkennung - bitte "responseBodyNoHtml" aufmerksam lesen!');
      } catch (e: any) {
        debug.networkError = e?.message || String(e);
        debug.guess = ['⚠️ Netzwerkfehler (keine Verbindung zu api.callmebot.com)'];
      }
    } else if (cfg.provider === 'textmebot') {
      debug.apikey = (cfg.textmebotApikey || '').slice(0, 5) + '*** (masked)';
      try {
        const url = 'https://api.textmebot.com/send.php';
        const params = new URLSearchParams({ recipient: to, apikey: cfg.textmebotApikey || '', text: text.slice(0, 3500) });
        debug.request = { method: 'GET', url: `${url}?recipient=${encodeURIComponent(to)}&text=<${text.length} chars>&apikey=${(cfg.textmebotApikey || '').slice(0,3)}***` };
        const startAt = Date.now();
        const resp = await axios.get(`${url}?${params.toString()}`, { timeout: 25000, validateStatus: () => true, responseType: 'text', transformResponse: [(d) => d] });
        debug.responseMs = Date.now() - startAt;
        debug.httpStatus = resp.status;
        const raw = String(resp.data || '');
        debug.responseBodyRaw = raw;
        debug.responseBodyClean = raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1500);
        const low = debug.responseBodyClean.toLowerCase();
        debug.guess = [];
        if (low.match(/invalid.*(key|apikey)|key.*invalid|api.*key.*not.*(valid|found)/i))
          debug.guess.push('❌ TextMeBot: API KEY FALSCH! Key prüfen (von textmebot.com Email).');
        if (low.match(/subscribe|payment|expired|inactive|buy.*plan/i))
          debug.guess.push('💰❌ Abonnement nicht aktiv! Gehe auf textmebot.com → Unlimited $6/Monat oder $60/Jahr abonnieren.');
        if (low.match(/sent.*recipient|message.*sent|successfully|queued/i))
          debug.guess.push('✅ TextMeBot: VERSAND ERFOLGREICH!');
        if (debug.guess.length === 0) debug.guess.push('ℹ️ Bitte responseBodyClean aufmerksam lesen!');
      } catch (e: any) {
        debug.networkError = e?.message || String(e);
        debug.guess = ['⚠️ Netzwerkfehler (keine Verbindung zu api.textmebot.com)'];
      }
    } else if (cfg.provider === 'telegram') {
      try {
        const token = cfg.telegramBotToken || '';
        const chatId = toRaw;
        const url = `https://api.telegram.org/bot${token.slice(0, 5)}***.../sendMessage`;
        debug.request = { method: 'POST', url, chatId };
        const resp = await axios.post(`https://api.telegram.org/bot${token}/sendMessage`,
          { chat_id: chatId, text: text, parse_mode: 'HTML' },
          { timeout: 15000, validateStatus: () => true }
        );
        debug.httpStatus = resp.status;
        debug.responseBody = resp.data;
        debug.guess = [];
        if (!resp.data?.ok) debug.guess.push(`❌ Telegram: ${resp.data?.description || 'Error'}. Prüfe: (1) Bot Token korrekt? (2) ChatId ${chatId} richtig? (3) Hat User je /start im Bot gedrückt?`);
      } catch (e: any) { debug.networkError = e?.message; }
    } else {
      debug.guess = [`ℹ️ Debug-Modus für Provider ${cfg.provider} aktuell nur bei CallMeBot/Telegram verfügbar. Nutze "Test senden".`];
    }

    res.json(debug);
  } catch (err: any) {
    res.status(400).json({
      error: err.issues ? err.issues.map((i: any) => i.message).join(', ') : err.message,
    });
  }
});

// Reminder-Job jetzt ausführen
const triggerSchema = z.object({
  dryRun: z.boolean().optional().default(true),
  force: z.boolean().optional().default(true),
});
router.post('/whatsapp/run-now', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const b = triggerSchema.safeParse(req.body || {});
    const opts = b.success ? b.data : { dryRun: true, force: true };
    const result = await runDailyReminderCheck(opts);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || String(err) });
  }
});

router.get('/whatsapp/phone-normalize', authMiddleware, requireAdmin, (req, res) => {
  const raw = String(req.query.phone || '');
  res.json({ raw, normalized: normalizePhone(raw) });
});

// Telegram: Spieler ChatId manuell setzen (Admin)
const tgChatIdSchema = z.object({ chatId: z.string().min(3) });
router.put('/whatsapp/telegram/chatid/:playerId', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const playerId = asString(req.params.playerId)!;
    const { chatId } = tgChatIdSchema.parse(req.body);
    await setPlayerTelegramChatId(playerId, chatId);
    res.json({ ok: true, playerId, chatId });
  } catch (err: any) {
    res.status(400).json({ error: err.issues ? err.issues.map((i: any) => i.message).join(', ') : err.message });
  }
});

router.get('/whatsapp/telegram/chatid/:playerId', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const playerId = asString(req.params.playerId)!;
    const chatId = await getPlayerTelegramChatId(playerId);
    res.json({ playerId, chatId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Provider-Info (welche Felder werden gebraucht)
export const PROVIDERS_META: Record<ReminderProvider, {
  name: string;
  price: string;
  fields: Array<{ key: keyof typeof WA_KEYS | 'PROVIDER'; label: string; hint?: string }>;
}> = {
  twilio: {
    name: 'Twilio',
    price: 'Bezahlt (~0,08€ / WhatsApp + monatl. Fee)',
  },
  callmebot: {
    name: 'CallMeBot (NUR 1 Person, FREE!)',
    price: '100% kostenlos, aber NUR 1 Empfänger (1:1 Key ↔ Nummer Bindung!)',
  },
  textmebot: {
    name: '🥇 TextMeBot (MANNSCHAFT - mehrere Empfänger!)',
    price: '$6/Monat (~5,50€) oder $60/Jahr - UNLIMITED RECIPIENTS! + 2 Tage FREE Demo!',
  },
  evolution: {
    name: 'Evolution API (selbst hosten, Open Source)',
    price: '100% kostenlos (Docker + Handy WA Nummer als Bot nötig)',
  },
  telegram: {
    name: '🥉 Telegram Bots (KEIN WhatsApp!)',
    price: '100% KOSTENLOS - UNENDLICH viele Nachrichten',
  },
} as any;

export default router;
