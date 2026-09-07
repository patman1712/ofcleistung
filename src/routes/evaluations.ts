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

// Helper: Extrahiert Bemerkungen IMMER aus Alt-Daten (Antworten mit --- Allgemeine Bemerkung --- Header)
// UND kombiniert mit session.remarks / trainingPlayer.remarks → Immer einheitlich remarks string|null!
function normalizeDailySessionRemarks(session: any): string | null {
  const final: string[] = [];
  if (typeof session.remarks === 'string' && session.remarks.trim().length > 0) {
    final.push(session.remarks.trim());
  }
  // Alt-Daten Migration on-the-fly (ohne DB zu schreiben, direkt für die Response!)
  for (const ans of session.answers || []) {
    const t = typeof ans.text === 'string' ? ans.text : '';
    const marker = '--- Allgemeine Bemerkung ---';
    const idx = t.indexOf(marker);
    if (idx >= 0) {
      const extracted = t.slice(idx + marker.length).trim();
      if (extracted.length > 0) final.push(extracted);
    }
  }
  if (final.length === 0) return null;
  return final.join('\n\n');
}

function normalizeTrainingPlayerRemarks(tp: any, answers?: any[]): string | null {
  const final: string[] = [];
  if (typeof tp?.remarks === 'string' && tp.remarks.trim().length > 0) {
    final.push(tp.remarks.trim());
  }
  for (const ans of answers || []) {
    const t = typeof ans.text === 'string' ? ans.text : '';
    const marker = '--- Allgemeine Bemerkung ---';
    const idx = t.indexOf(marker);
    if (idx >= 0) {
      const extracted = t.slice(idx + marker.length).trim();
      if (extracted.length > 0) final.push(extracted);
    }
  }
  if (final.length === 0) return null;
  return final.join('\n\n');
}

// Helper: Wenn Alt-Daten in Antwort-Texten den Marker haben,
// den Marker AUS der Antwort entfernen (UI soll Text nicht doppelt zeigen!)
function filterRemarksFromAnswerText(ans: any): string | null {
  const t = typeof ans.text === 'string' ? ans.text : null;
  if (!t) return t;
  const marker = '--- Allgemeine Bemerkung ---';
  const idx = t.indexOf(marker);
  if (idx < 0) return t;
  const before = t.slice(0, idx).trim();
  return before.length > 0 ? before : null;
}

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
      include: { answers: { include: { question: true } } },
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
    const todayRemarks = todayCompletedSession
      ? normalizeDailySessionRemarks(todayCompletedSession)
      : null;
    const latestCompletedSession = dailySessions.find((s) => s.completedAt);

    result.push({
      player: p,
      avgDailyLast7Days: avgDaily ? Math.round(avgDaily * 10) / 10 : null,
      activeAlerts: alerts.length,
      lastDailyCompletedAt: latestCompletedSession?.completedAt ?? null,
      todayCompletedAt: todayCompletedSession?.completedAt ?? null,
      completedToday: todayCompletedSession != null,
      todayRemarks,
      todayDailyAnswers:
        todayCompletedSession
          ? todayCompletedSession.answers.map((ans) => ({
              id: ans.id,
              rating: ans.rating,
              text: filterRemarksFromAnswerText(ans),
              question: {
                id: ans.question.id,
                text: ans.question.text,
                questionType: ans.question.questionType,
                minRating: ans.question.minRating,
                maxRating: ans.question.maxRating,
              },
            }))
          : [],
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

  const trainingAnswersRaw = await prisma.trainingAnswer.findMany({
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

  // TrainingPlayer Entitäten für remarks + Alt Extrakt (mappen auf trainingPlayerId!)
  const tpIds = new Set<string>();
  for (const ta of trainingAnswersRaw) {
    if (ta.trainingPlayerId) tpIds.add(ta.trainingPlayerId);
  }
  const tpList = tpIds.size
    ? await prisma.trainingPlayer.findMany({
        where: { id: { in: Array.from(tpIds) } },
        include: { answers: true },
      })
    : [];
  const tpMap = new Map<string, any>();
  for (const tp of tpList) {
    tpMap.set(tp.id, {
      remarks: normalizeTrainingPlayerRemarks(tp, tp.answers || []),
    });
  }

  // Daily Sessions: remarks + answer Text Bereinigen (Alt Marker entfernen)
  const cleanDailySessions = dailySessions.map((s) => {
    const remarks = normalizeDailySessionRemarks(s);
    return {
      id: s.id,
      date: s.date,
      completedAt: s.completedAt,
      remarks,
      answers: s.answers.map((a) => ({
        id: a.id,
        rating: a.rating,
        text: filterRemarksFromAnswerText(a),
        question: {
          id: (a as any).question?.id,
          text: (a as any).question?.text,
          questionType: (a as any).question?.questionType,
          minRating: (a as any).question?.minRating,
          maxRating: (a as any).question?.maxRating,
        },
      })),
    };
  });

  // Training Answers: Bereinigen + remarks pro tpId hinzufügen
  const cleanTrainingAnswers = trainingAnswersRaw.map((a) => ({
    id: a.id,
    rating: a.rating,
    text: filterRemarksFromAnswerText(a),
    createdAt: a.createdAt,
    question: {
      id: (a as any).question?.id,
      text: (a as any).question?.text,
      questionType: (a as any).question?.questionType,
      minRating: (a as any).question?.minRating,
      maxRating: (a as any).question?.maxRating,
    },
    trainingPlayerId: a.trainingPlayerId,
    trainingPlayer: {
      id: (a as any).trainingPlayer?.id,
      remarks: tpMap.get(a.trainingPlayerId)?.remarks ?? null,
      training: (a as any).trainingPlayer?.training,
    },
    playerId: a.playerId,
  }));

  const userAny = user as any;
  const alerts = await prisma.alert.findMany({
    where: { playerProfileId: userAny.playerProfile?.id },
    include: { config: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  res.json({
    user,
    dailySessions: cleanDailySessions,
    trainingAnswers: cleanTrainingAnswers,
    alerts,
  });
});

export default router;
