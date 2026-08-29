import { Router } from 'express';
import { z } from 'zod';
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
    name: 'CallMeBot (EMPFOHLEN KLEINE KREISE!)',
    price: '100/Monat KOSTENLOS, danach ~5€ LIFETIME (einmalig!)',
  },
  evolution: {
    name: 'Evolution API (selbst hosten, Open Source)',
    price: '100% kostenlos (Docker + Handy WA Nummer als Bot nötig)',
  },
  telegram: {
    name: 'Telegram Bots (KEIN WhatsApp!)',
    price: '100% KOSTENLOS - UNENDLICH viele Nachrichten',
  },
} as any;

export default router;
