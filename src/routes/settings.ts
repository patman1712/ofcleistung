import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAdmin, requireAdminOrStaff, authMiddleware } from '../middleware/auth.js';
import { asString } from '../types.js';

const router = Router();

// Öffentlich: Branding-Einstellungen holen (Logo, Favicon, Titel) - OHNE Auth!
// Weil Login-Seite und Header diese immer brauchen, auch bevor User eingeloggt ist.
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

// Admin: Alle Settings (komplett, inkl. Branding)
router.get('/', authMiddleware, requireAdmin, async (req, res) => {
  const rows = await prisma.setting.findMany({ orderBy: { key: 'asc' } });
  const result: Record<string, string> = {};
  for (const r of rows) result[r.key] = r.value;
  res.json(result);
});

// Admin: Key-Value updaten (Logo/Favicon als Base64 Data URL! OK - SQLite packt das locker)
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
    res.json(upserted);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Fehler' });
  }
});

export default router;
