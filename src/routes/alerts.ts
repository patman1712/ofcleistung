import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAdmin, authMiddleware } from '../middleware/auth.js';
import { asString } from '../types.js';

const router = Router();

const configSchema = z.object({
  name: z.string().min(1),
  scope: z.enum(['DAILY', 'TRAINING', 'ALL']).default('ALL'),
  threshold: z.number().int().min(1).max(10).default(3),
  consecutiveCount: z.number().int().min(1).default(2),
  active: z.boolean().default(true),
});

// Admin: Alert-Konfigurationen
router.get('/configs', authMiddleware, requireAdmin, async (req, res) => {
  const configs = await prisma.alertConfig.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { alerts: true } } },
  });
  res.json(configs);
});

router.post('/configs', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const data = configSchema.parse(req.body);
    const c = await prisma.alertConfig.create({ data: data as any });
    res.status(201).json(c);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Fehler' });
  }
});

router.put('/configs/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const id = asString(req.params.id)!;
    const data = configSchema.partial().parse(req.body);
    const c = await prisma.alertConfig.update({ where: { id }, data: data as any });
    res.json(c);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Fehler' });
  }
});

router.delete('/configs/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const id = asString(req.params.id)!;
    await prisma.alertConfig.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Fehler' });
  }
});

// Alle offenen Alerts
router.get('/open', authMiddleware, requireAdmin, async (req, res) => {
  const alerts = await prisma.alert.findMany({
    where: { resolved: false },
    include: {
      config: true,
      playerProfile: {
        include: { user: { select: { id: true, name: true, email: true } } },
      },
    },
    orderBy: [{ severity: 'asc' }, { createdAt: 'desc' }],
  });
  res.json(alerts);
});

// Alert als erledigt markieren
router.post('/:id/resolve', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const id = asString(req.params.id)!;
    const a = await prisma.alert.update({
      where: { id },
      data: { resolved: true },
    });
    res.json(a);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Fehler' });
  }
});

// Trigger: Prüft Warnsignale manuell (kann auch per Cron laufen)
router.post('/check', authMiddleware, requireAdmin, async (req, res) => {
  const configs = await prisma.alertConfig.findMany({ where: { active: true } });
  const players = await prisma.playerProfile.findMany();
  let created = 0;

  for (const cfg of configs) {
    for (const profile of players) {
      // Sammle Ratings in Scope
      const ratings: number[] = [];

      if (cfg.scope === 'DAILY' || cfg.scope === 'ALL') {
        const sessions = await prisma.dailyAnswerSession.findMany({
          where: { playerId: profile.userId },
          include: { answers: true },
          orderBy: { date: 'desc' },
          take: 30,
        });
        for (const s of sessions) {
          const r = s.answers
            .filter((a) => a.rating != null)
            .map((a) => a.rating as number);
          if (r.length > 0) {
            ratings.push(Math.min(...r)); // Bitterste Bewertung pro Tag
          }
        }
      }

      if (cfg.scope === 'TRAINING' || cfg.scope === 'ALL') {
        const tanswers = await prisma.trainingAnswer.findMany({
          where: { playerId: profile.userId, rating: { not: null } },
          orderBy: { createdAt: 'desc' },
          take: 100,
        });
        for (const a of tanswers) {
          if (a.rating != null) ratings.push(a.rating);
        }
      }

      // Aufeinanderfolgende unter Threshold zählen
      let consecutive = 0;
      let maxStreak = 0;
      for (const r of ratings) {
        if (r <= cfg.threshold) {
          consecutive++;
          maxStreak = Math.max(maxStreak, consecutive);
        } else {
          consecutive = 0;
        }
      }

      if (maxStreak >= cfg.consecutiveCount) {
        const severity = maxStreak >= cfg.consecutiveCount + 1 ? 'CRITICAL' : 'WARNING';
        const existing = await prisma.alert.findFirst({
          where: {
            configId: cfg.id,
            playerProfileId: profile.id,
            resolved: false,
          },
        });
        if (!existing) {
          await prisma.alert.create({
            data: {
              configId: cfg.id,
              playerProfileId: profile.id,
              severity,
              message: `${maxStreak}x nacheinander schlechte Bewertungen (<= ${cfg.threshold})`,
            },
          });
          created++;
        }
      }
    }
  }

  res.json({ createdAlerts: created });
});

export default router;
