import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAdmin, authMiddleware, requireAuth } from '../middleware/auth.js';
import { QuestionType, asString } from '../types.js';
import { startOfDay, format } from 'date-fns';

const router = Router();

const questionSchema = z.object({
  text: z.string().min(1),
  questionType: z.enum(['RATING_1_10', 'TEXT']).default('RATING_1_10'),
  sortOrder: z.number().int().min(0).default(0),
  active: z.boolean().default(true),
  repeatTime: z.string().optional().nullable(),
});

// Alle täglichen Fragen (Admin verwaltet, Spieler sieht aktive)
router.get('/', authMiddleware, requireAuth, async (req, res) => {
  const questions = await prisma.dailyQuestion.findMany({
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  res.json(questions);
});

// Admin: Frage anlegen
router.post('/', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const data = questionSchema.parse(req.body);
    const q = await prisma.dailyQuestion.create({ data: data as any });
    res.status(201).json(q);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Fehler' });
  }
});

// Admin: Frage bearbeiten
router.put('/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const id = asString(req.params.id)!;
    const data = questionSchema.partial().parse(req.body);
    const q = await prisma.dailyQuestion.update({ where: { id }, data: data as any });
    res.json(q);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Fehler' });
  }
});

// Admin: Frage löschen
router.delete('/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const id = asString(req.params.id)!;
    await prisma.dailyQuestion.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Fehler' });
  }
});

// Spieler: Habe ich heutige tägliche Abfrage schon beantwortet?
router.get('/status/today', authMiddleware, requireAuth, async (req, res) => {
  const playerId = req.auth!.userId;
  const today = startOfDay(new Date());
  const session = await prisma.dailyAnswerSession.findUnique({
    where: {
      playerId_date: {
        playerId,
        date: today,
      },
    },
    include: { answers: true },
  });
  const activeQuestions = await prisma.dailyQuestion.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });

  if (!session) {
    return res.json({
      answered: false,
      questions: activeQuestions,
      sessionId: null,
    });
  }
  if (session.completedAt) {
    return res.json({
      answered: true,
      questions: activeQuestions,
      sessionId: session.id,
      completedAt: session.completedAt,
    });
  }
  // offen / teilweise beantwortet
  return res.json({
    answered: false,
    partial: true,
    questions: activeQuestions,
    sessionId: session.id,
    answers: session.answers,
  });
});

const answerSchema = z.object({
  sessionId: z.string().optional().nullable(),
  answers: z.array(
    z.object({
      questionId: z.string(),
      rating: z.number().int().min(1).max(10).optional().nullable(),
      text: z.string().optional().nullable(),
    }),
  ),
});

// Spieler: Tägliche Antworten speichern und abschließen
router.post('/submit/today', authMiddleware, requireAuth, async (req, res) => {
  try {
    const playerId = req.auth!.userId;
    const today = startOfDay(new Date());
    const body = answerSchema.parse(req.body);

    const activeQuestions = await prisma.dailyQuestion.findMany({
      where: { active: true },
    });

    const session = await prisma.dailyAnswerSession.upsert({
      where: {
        playerId_date: {
          playerId,
          date: today,
        },
      },
      create: {
        playerId,
        date: today,
        completedAt: new Date(),
      },
      update: {
        completedAt: new Date(),
      },
      include: { answers: true },
    });

    // Alte Antworten dieser Session löschen und neu schreiben
    if (session.answers.length > 0) {
      await prisma.dailyAnswer.deleteMany({
        where: { sessionId: session.id },
      });
    }

    for (const a of body.answers) {
      const q = activeQuestions.find((x) => x.id === a.questionId);
      if (!q) continue;
      await prisma.dailyAnswer.create({
        data: {
          sessionId: session.id,
          playerId,
          questionId: a.questionId,
          rating: q.questionType === 'RATING_1_10' ? a.rating ?? null : null,
          text: q.questionType === 'TEXT' ? a.text ?? null : null,
        },
      });
    }

    res.json({ ok: true, sessionId: session.id });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Fehler' });
  }
});

export default router;
