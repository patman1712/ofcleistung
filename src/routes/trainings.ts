import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAdmin, authMiddleware, requireAuth } from '../middleware/auth.js';
import { QuestionType } from '@prisma/client';
import { addMinutes } from 'date-fns';

const router = Router();

const createTrainingSchema = z.object({
  title: z.string().min(1),
  scheduledAt: z.string().datetime(),
  durationMin: z.number().int().positive().optional().nullable(),
  playerProfileIds: z.array(z.string()).default([]),
  questions: z.array(
    z.object({
      text: z.string().min(1),
      questionType: z.enum(['RATING_1_10', 'TEXT']).default('RATING_1_10'),
      sortOrder: z.number().int().min(0).default(0),
    }),
  ).default([]),
});

// Admin: Alle Trainings
router.get('/', authMiddleware, requireAuth, async (req, res) => {
  const isAdmin = req.auth!.role === 'ADMIN';
  const where: any = {};
  if (!isAdmin) {
    // Nur Trainings anzeigen, in denen der Spieler eingetragen ist
    const profile = await prisma.playerProfile.findUnique({
      where: { userId: req.auth!.userId },
    });
    if (!profile) return res.json([]);
    where.players = {
      some: { playerProfileId: profile.id },
    };
  }
  const trainings = await prisma.training.findMany({
    where,
    include: {
      createdBy: { select: { id: true, name: true } },
      players: { include: { playerProfile: { include: { user: { select: { id: true, name: true, email: true } } } } } },
      questions: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
    },
    orderBy: { scheduledAt: 'desc' },
  });
  res.json(trainings);
});

// Admin: Training anlegen
router.post('/', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const data = createTrainingSchema.parse(req.body);
    const training = await prisma.training.create({
      data: {
        title: data.title,
        scheduledAt: new Date(data.scheduledAt),
        durationMin: data.durationMin ?? undefined,
        createdById: req.auth!.userId,
        players: {
          create: data.playerProfileIds.map((id) => ({ playerProfileId: id })),
        },
        questions: {
          create: data.questions,
        },
      },
      include: {
        players: true,
        questions: true,
      },
    });
    res.status(201).json(training);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Fehler' });
  }
});

// Admin: Training bearbeiten (Titel, Datum, Dauer, Spieler)
router.put('/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const body = createTrainingSchema.partial().parse(req.body);

    const updateData: any = {};
    if (body.title) updateData.title = body.title;
    if (body.scheduledAt) updateData.scheduledAt = new Date(body.scheduledAt);
    if (body.durationMin !== undefined) updateData.durationMin = body.durationMin;

    if (body.playerProfileIds) {
      await prisma.trainingPlayer.deleteMany({ where: { trainingId: id } });
      updateData.players = {
        create: body.playerProfileIds.map((pid) => ({ playerProfileId: pid })),
      };
    }

    const training = await prisma.training.update({
      where: { id },
      data: updateData,
      include: {
        players: true,
        questions: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
      },
    });
    res.json(training);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Fehler' });
  }
});

// Admin: Training löschen
router.delete('/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.training.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Fehler' });
  }
});

// Admin: Frage zu Training hinzufügen
router.post('/:id/questions', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const body = z.object({
      text: z.string().min(1),
      questionType: z.enum(['RATING_1_10', 'TEXT']).default('RATING_1_10'),
      sortOrder: z.number().int().min(0).default(0),
    }).parse(req.body);
    const q = await prisma.trainingQuestion.create({
      data: { trainingId: id, ...body },
    });
    res.status(201).json(q);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Fehler' });
  }
});

// Admin: Frage bearbeiten
router.put('/questions/:qid', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { qid } = req.params;
    const body = z.object({
      text: z.string().min(1).optional(),
      questionType: z.enum(['RATING_1_10', 'TEXT']).optional(),
      sortOrder: z.number().int().min(0).optional(),
    }).parse(req.body);
    const q = await prisma.trainingQuestion.update({ where: { id: qid }, data: body as any });
    res.json(q);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Fehler' });
  }
});

// Admin: Frage löschen
router.delete('/questions/:qid', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { qid } = req.params;
    await prisma.trainingQuestion.delete({ where: { id: qid } });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Fehler' });
  }
});

// Spieler: Offene Trainings-Fragen (Trainings, die vorbei sind + noch nicht beantwortet)
router.get('/open/pending', authMiddleware, requireAuth, async (req, res) => {
  if (req.auth!.role !== 'PLAYER') return res.json([]);
  const profile = await prisma.playerProfile.findUnique({
    where: { userId: req.auth!.userId },
  });
  if (!profile) return res.json([]);

  const now = new Date();
  const tps = await prisma.trainingPlayer.findMany({
    where: {
      playerProfileId: profile.id,
      training: {
        scheduledAt: { lte: now },
      },
    },
    include: {
      training: {
        include: {
          questions: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
        },
      },
      answers: true,
    },
  });
  const result = tps
    .filter((tp) => tp.answers.length === 0 && tp.training.questions.length > 0)
    .map((tp) => ({
      trainingPlayerId: tp.id,
      trainingId: tp.training.id,
      title: tp.training.title,
      scheduledAt: tp.training.scheduledAt,
      durationMin: tp.training.durationMin,
      questions: tp.training.questions,
    }));
  res.json(result);
});

const trainingAnswerSchema = z.object({
  trainingPlayerId: z.string(),
  answers: z.array(
    z.object({
      questionId: z.string(),
      rating: z.number().int().min(1).max(10).optional().nullable(),
      text: z.string().optional().nullable(),
    }),
  ),
});

// Spieler: Trainings-Fragen beantworten
router.post('/submit/answers', authMiddleware, requireAuth, async (req, res) => {
  try {
    const playerId = req.auth!.userId;
    const body = trainingAnswerSchema.parse(req.body);

    const tp = await prisma.trainingPlayer.findUnique({
      where: { id: body.trainingPlayerId },
      include: { training: { include: { questions: true } } },
    });
    if (!tp) return res.status(404).json({ error: 'Nicht gefunden' });

    const profile = await prisma.playerProfile.findUnique({ where: { userId: playerId } });
    if (!profile || tp.playerProfileId !== profile.id) {
      return res.status(403).json({ error: 'Keine Berechtigung' });
    }

    for (const a of body.answers) {
      const q = tp.training.questions.find((x) => x.id === a.questionId);
      if (!q) continue;
      await prisma.trainingAnswer.create({
        data: {
          trainingPlayerId: tp.id,
          questionId: a.questionId,
          playerId,
          rating: q.questionType === 'RATING_1_10' ? a.rating ?? null : null,
          text: q.questionType === 'TEXT' ? a.text ?? null : null,
        },
      });
    }
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Fehler' });
  }
});

export default router;
