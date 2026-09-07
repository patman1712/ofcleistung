import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAdmin, requireAdminOrStaff, authMiddleware } from '../middleware/auth.js';
import { startOfDay, subDays, isSameDay } from 'date-fns';
import { toZonedTime, fromZonedTime, formatInTimeZone } from 'date-fns-tz';
import { asString } from '../types.js';

const TZ = 'Europe/Berlin';

// Helper: Vergleicht ob ein Date (Datumsteil!) "heute" ist in der gegebenen Zeitzone.
// Wir benutzen das für DailyAnswerSession.date (das ein DATE-Feld ist, gespeichert als Mitternacht UTC des Tages)
// UND für completedAt (der echte Submit-Timestamp)
function isTodayInTz(date: Date | null | undefined): boolean {
  if (!date) return false;
  const zonedNow = toZonedTime(new Date(), TZ);
  const zonedCheck = toZonedTime(date, TZ);
  return isSameDay(zonedNow, zonedCheck);
}

const router = Router();

// Admin + Staff: Übersicht mit allen Spielern + aktuellen Werten
router.get('/overview', authMiddleware, requireAdminOrStaff, async (req, res) => {
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
      orderBy: { date: 'desc' },
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

    // 🔑 FIX: HEUTE ERLEDIGT prüfen! (NICHT irgendeine Session der letzten 7 Tage!)
    // Kriterium: Entweder DailyAnswerSession.date ist HEUTE (TZ Berlin) + completedAt gesetzt
    // ODER completedAt (Submit-Zeitpunkt) ist HEUTE (TZ Berlin)
    const todayCompletedSession = dailySessions.find(
      (s) =>
        s.completedAt != null &&
        (isTodayInTz(s.date) || isTodayInTz(s.completedAt)),
    );
    const latestCompletedSession = dailySessions.find((s) => s.completedAt);

    result.push({
      player: p,
      avgDailyLast7Days: avgDaily ? Math.round(avgDaily * 10) / 10 : null,
      activeAlerts: alerts.length,
      lastDailyCompletedAt: latestCompletedSession?.completedAt ?? null,
      todayCompletedAt: todayCompletedSession?.completedAt ?? null,
      completedToday: todayCompletedSession != null,
    });
  }
  res.json(result);
});

// Admin + Staff: Detailansicht eines Spielers
router.get('/player/:playerId', authMiddleware, requireAdminOrStaff, async (req, res) => {
  const playerId = asString(req.params.playerId)!;
  const user = await prisma.user.findUnique({
    where: { id: playerId },
    include: { playerProfile: true },
  });
  if (!user) return res.status(404).json({ error: 'Nicht gefunden' });

  const dailySessions = await prisma.dailyAnswerSession.findMany({
    where: { playerId: playerId },
    include: { answers: { include: { question: true } } },
    orderBy: { date: 'desc' },
    take: 30,
  });

  const trainingAnswers = await prisma.trainingAnswer.findMany({
    where: { playerId: playerId },
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

  const userAny = user as any;
  const alerts = await prisma.alert.findMany({
    where: { playerProfileId: userAny.playerProfile?.id },
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
