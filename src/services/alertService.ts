import { prisma } from '../lib/prisma.js';
import { format } from 'date-fns';

// Standard-Schwellwert: Wenn minRating bei Frage 1 ist (Default 1, also nie vom Admin explizit gesetzt!)
// → Nutze diesen Fallback 5, wie User explizit gefordert hat (Bewertungen UNTER 5 = Warnsignal!)
const FALLBACK_SINGLE_QUESTION_THRESHOLD = 5;

// Name für Standard-AlertConfig für einzelne Antworten (wird automatisch angelegt falls nicht vorhanden!)
const SINGLE_QUESTION_CONFIG_NAME = 'Einzelfrage (pro Antwort) - Unterschreitung Schwellwert';

export type Scope = 'DAILY_SINGLE' | 'TRAINING_SINGLE' | 'STREAK';

export async function getOrCreateSingleAnswerConfig(): Promise<string> {
  // Suche nach vorhandener Config
  const found = await prisma.alertConfig.findFirst({
    where: { name: SINGLE_QUESTION_CONFIG_NAME },
  });
  if (found) return found.id;

  // Oder erstelle Standard-Konfiguration
  const created = await prisma.alertConfig.create({
    data: {
      name: SINGLE_QUESTION_CONFIG_NAME,
      scope: 'ALL',
      threshold: FALLBACK_SINGLE_QUESTION_THRESHOLD,
      consecutiveCount: 1, // Sofort bei 1x Unterschreitung!
      active: true,
    },
  });
  return created.id;
}

// Hilfsfunktion: Effektiver Schwellwert pro Frage
// - Wenn Admin ein minRating > 1 gesetzt hat → genau das nehmen
// - Sonst Fallback 5!
function effectiveThreshold(questionMinRating: number | null | undefined): number {
  if (!questionMinRating || questionMinRating <= 1) {
    return FALLBACK_SINGLE_QUESTION_THRESHOLD;
  }
  return questionMinRating;
}

function severityOf(ratingValue: number, threshold: number): 'WARNING' | 'CRITICAL' {
  const delta = threshold - ratingValue;
  if (delta >= 2) return 'CRITICAL'; // z.B. Rating 2 bei Schwellwert 5 oder schlechter
  return 'WARNING';
}

function fmtDate(d: Date): string {
  try {
    return format(d, 'dd.MM.yyyy');
  } catch {
    return '';
  }
}

/**
 * DailyAnswerSession nach Submit auf einzelne Antworten prüfen
 * und Alerts erstellen wenn rating < threshold
 */
export async function processDailyAnswers(sessionId: string): Promise<number> {
  const session = await prisma.dailyAnswerSession.findUnique({
    where: { id: sessionId },
    include: {
      answers: { include: { question: true } },
      player: true,
    },
  });
  if (!session) return 0;

  const profile = await prisma.playerProfile.findUnique({
    where: { userId: session.playerId },
  });
  if (!profile) return 0;

  const configId = await getOrCreateSingleAnswerConfig();
  let createdAlerts = 0;

  for (const answer of session.answers) {
    if (answer.rating == null) continue; // Nur Rating-Fragen
    const threshold = effectiveThreshold(answer.question.minRating);
    if (answer.rating >= threshold) continue;

    // Bereits ein Alert für genau diese DailyAnswer vorhanden? (Unique Constraint dailyAnswerId → verhindert doppelt!)
    const existing = await prisma.alert.findFirst({
      where: { dailyAnswerId: answer.id },
    });
    if (existing) continue;

    const severity = severityOf(answer.rating, threshold);
    const dateStr = fmtDate(session.date);

    const qTextShort = (answer.question.text || '').slice(0, 80);
    const message =
      `Einzelfrage Unterschritten am ${dateStr}: Frage "${qTextShort}" ` +
      `Bewertung: ${answer.rating} / ${threshold} (Schwellwert)`;

    await prisma.alert.create({
      data: {
        configId,
        playerProfileId: profile.id,
        severity,
        resolved: false,
        message,
        dailyAnswerId: answer.id,
        answerScope: 'DAILY_SINGLE',
        ratingValue: answer.rating,
        thresholdUsed: threshold,
        questionSnapshot: answer.question.text || null,
      },
    });
    createdAlerts++;
  }

  return createdAlerts;
}

/**
 * Training Player Answer einzeln prüfen
 */
export async function processTrainingAnswers(trainingPlayerIdOrTrainingAnswerIds:
  | string
  | string[]): Promise<number> {
  let answers: any[] = [];

  if (Array.isArray(trainingPlayerIdOrTrainingAnswerIds)) {
    // Array von TrainingAnswer IDs
    answers = await prisma.trainingAnswer.findMany({
      where: { id: { in: trainingPlayerIdOrTrainingAnswerIds } },
      include: { question: true, player: true, trainingPlayer: true },
    });
  } else {
    answers = await prisma.trainingAnswer.findMany({
      where: { trainingPlayerId: trainingPlayerIdOrTrainingAnswerIds },
      include: { question: true, player: true, trainingPlayer: true },
    });
  }

  if (answers.length === 0) return 0;

  const configId = await getOrCreateSingleAnswerConfig();
  let createdAlerts = 0;

  for (const answer of answers) {
    if (answer.rating == null) continue;
    const threshold = effectiveThreshold(answer.question.minRating);
    if (answer.rating >= threshold) continue;

    const existing = await prisma.alert.findFirst({
      where: { trainingAnswerId: answer.id },
    });
    if (existing) continue;

    // Spieler-
    const profile = await prisma.playerProfile.findUnique({
      where: { userId: answer.playerId },
    });
    if (!profile) continue;

    const severity = severityOf(answer.rating, threshold);
    const dateStr = fmtDate(answer.createdAt);

    const qTextShort = (answer.question.text || '').slice(0, 80);
    // Wenn training Titel holen
    let trainingInfo = '';
    try {
      const tp = await prisma.trainingPlayer.findUnique({
        where: { id: answer.trainingPlayerId },
        include: { training: true },
      });
      if (tp?.training?.title) {
        trainingInfo = ` Training "${tp.training.title.slice(0,40)}"`;
      }
    } catch {}

    const message =
      `Training${trainingInfo || ''} Einzelfrage Unterschritten am ${dateStr}: Frage "${qTextShort}" ` +
      `Bewertung: ${answer.rating} / ${threshold} (Schwellwert)`;

    await prisma.alert.create({
      data: {
        configId,
        playerProfileId: profile.id,
        severity,
        resolved: false,
        message,
        trainingAnswerId: answer.id,
        answerScope: 'TRAINING_SINGLE',
        ratingValue: answer.rating,
        thresholdUsed: threshold,
        questionSnapshot: answer.question.text || null,
      },
    });
    createdAlerts++;
  }

  return createdAlerts;
}

/**
 * BACKFILL: Alle vergangenen Antworten durchgehen (für alerts.ts check route)
 */
export async function backfillAllSingleAnswerAlerts(): Promise<number> {
  let totalCreated = 0;

  // Alle Daily Sessions durchgehen
  const allDaily = await prisma.dailyAnswerSession.findMany({
    where: { completedAt: { not: null } },
    select: { id: true },
    orderBy: { completedAt: 'asc' },
    take: 500,
  });
  for (const s of allDaily) {
    totalCreated += await processDailyAnswers(s.id);
  }

  // Alle TrainingAnswers durchgehen
  const allTrainingAnswers = await prisma.trainingAnswer.findMany({
    where: { rating: { not: null } },
    select: { id: true },
    take: 2000,
  });
  if (allTrainingAnswers.length > 0) {
    totalCreated += await processTrainingAnswers(
      allTrainingAnswers.map((x) => x.id),
    );
  }

  return totalCreated;
}
