import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAdmin, requireAdminOrStaff, authMiddleware } from '../middleware/auth.js';
import { asString } from '../types.js';
import {
  loadWAConfig,
  sendWhatsApp,
  resetTwilioCache,
  WA_KEYS,
  normalizePhone,
} from '../services/whatsappService.js';
import { runDailyReminderCheck, rescheduleWhatsApp } from '../services/whatsappScheduler.js';

const router = Router();

// Öffentlich: Branding-Einstellungen holen (Logo, Favicon, Titel) - OHNE Auth!
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

// Admin: Alle Settings (komplett, inkl. Branding + WhatsApp-Konfig) - ABER KEINE Tokens bei GET?
// Wir geben alles zurück (nur Admin darf route sehen).
router.get('/', authMiddleware, requireAdmin, async (req, res) => {
  const rows = await prisma.setting.findMany({ orderBy: { key: 'asc' } });
  const result: Record<string, string> = {};
  for (const r of rows) result[r.key] = r.value;
  res.json(result);
});

// Admin: Key-Value updaten
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
    // Reschedule Scheduler falls WhatsApp-Zeit / Aktiv geändert
    if (
      key === WA_KEYS.TIME || key === WA_KEYS.ENABLED || key === WA_KEYS.TIMEZONE
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

// WhatsApp: Bulk-Save (speichert mehrere Keys gleichzeitig) + danach Scheduler sofort neu starten
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

// WhatsApp: Test-Nachricht an eine angegebene Nummer senden
const testSchema = z.object({
  to: z.string().min(3),
  text: z.string().optional().nullable(),
});
router.post('/whatsapp/test-send', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const body = testSchema.parse(req.body);
    const cfg = await loadWAConfig();
    const text = body.text?.trim() ? body.text : `🧪 *OFC Test-Nachricht*\n\nHallo! WhatsApp-Anbindung funktioniert ✅\nName: {{name}} wird automatisch mit Spielername ersetzt.`;
    const r = await sendWhatsApp(cfg, body.to, text);
    res.status(r.ok ? 200 : 400).json(r);
  } catch (err: any) {
    res.status(400).json({
      ok: false, error: err.issues ? err.issues.map((i: any) => i.message).join(', ') : err.message });
  }
});

// WhatsApp: Reminder-Job SOFORT ausführen (Dry-Run oder Echt-Versand)
const triggerSchema = z.object({ dryRun: z.boolean().optional().default(true), force: z.boolean().optional().default(true) });
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

export default router;
