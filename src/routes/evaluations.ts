import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAdmin, authMiddleware } from '../middleware/auth.js';
import { startOfDay, subDays } from 'date-fns';

const router = Router();

// Admin: Übersicht mit allen Spielern + aktuellen Werten
router.get('/overview', authMiddleware, requireAdmin, async (req, res) => {
  const players = await prisma.user.findMany({
    where: { role: 'PLAYER' },
    include: { playerProfile: true },
    orderBy: { name: 'asc' },
  });

  const result = [];
  for (const p of players) {
    // Letzte 7 Tage tägliche Antworten
    const weekAgo = subDays(startOfDay(new Date()), 7);
    const dailySessions = await prisma.dailyAnswerSession.findMany({
      where: { playerId: p.id, date: { gte: weekAgo } },
      include: { answers: true },
    });
    const allDailyRatings = dailySessions.flatMap((s) =>
      s.answers.filter((a) => a.rating != null).map((a) => a.rating as number),
    );
    const avgDaily =
      allDailyRatings.length > 0
        ? allDailyRatings.reduce((a, b) => a + b, 0) / allDailyRatings.length
        : null;

    // Aktive Warnsignale
    const alerts = await prisma.alert.findMany({
      where: { playerProfileId: p.playerProfile?.id, resolved: false },
      include: { config: true },
    });

    result.push({
      player: p,
      avgDailyLast7Days: avgDaily ? Math.round(avgDaily * 10) / 10 : null,
      activeAlerts: alerts.length,
      lastDailyCompletedAt:
        dailySessions.find((s) => s.completedAt)?.completedAt ?? null,
    });
  }
  res.json(result);
});

// Admin: Detailansicht eines Spielers
router.get('/player/:playerId', authMiddleware, requireAdmin, async (req, res) => {
  const { playerId } = req.params;
  const user = await prisma.user.findUnique({
    where: { id: playerId },
    include: { playerProfile: true },
  });
  if (!user) return res.status(404).json({ error: 'Nicht gefunden' });

  const dailySessions = await prisma.dailyAnswerSession.findMany({
    where: { playerId },
    include: { answers: { include: { question: true } } },
    orderBy: { date: 'desc' },
    take: 30,
  });

  const trainingAnswers = await prisma.trainingAnswer.findMany({
    where: { playerId },
    include: {
      question: true,
      trainingPlayer: {
        include: {
          training: { select: { id: true, title: true, scheduledAt: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  const alerts = await prisma.alert.findMany({
    where: { playerProfileId: user.playerProfile?.id },
    include: { config: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  res.json({
    user,
    dailySessions,
    trainingAnswers,
    alerts,
  });
});

export default router;
