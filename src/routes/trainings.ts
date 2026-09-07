import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAdmin, authMiddleware, requireAuth } from '../middleware/auth.js';
import { QuestionType, asString } from '../types.js';
import { addMinutes } from 'date-fns';
import { processTrainingAnswers } from '../services/alertService.js';

const router = Router();

// --- Basis Schemas (kein Refine!) damit .partial() später auf ZodObject funktioniert ---
const baseQuestionWithRatingSchema = z.object({
  text: z.string().min(1),
  questionType: z.enum(['RATING_1_10', 'RATING', 'TEXT']).default('RATING'),
  minRating: z.number().int().min(0).max(100).default(1),
  maxRating: z.number().int().min(1).max(100).default(10),
  sortOrder: z.number().int().min(0).default(0),
});

// Frage-Create Schema mit Refine (max > min)
const questionCreateSchema = baseQuestionWithRatingSchema.refine(
  (v) => v.maxRating > v.minRating,
  { message: 'maxRating muss größer als minRating sein', path: ['maxRating'] },
);

// Frage-Update Schema (partial) + superRefine wenn beide Rating-Felder gesetzt sind
const questionUpdateSchema = baseQuestionWithRatingSchema.partial().superRefine((val, ctx) => {
  if (val.minRating !== undefined && val.maxRating !== undefined) {
    if (val.maxRating <= val.minRating) {
      ctx.addIssue({ code: 'custom', path: ['maxRating'], message: 'maxRating muss größer als minRating sein' });
    }
  }
});

// Basis-Training-Schema (ohne Refine, nutzt questionCreateSchema nicht hier als Sub)
const baseCreateTrainingSchema = z.object({
  title: z.string().min(1),
  scheduledAt: z.string().datetime(),
  durationMin: z.number().int().positive().optional().nullable(),
  playerProfileIds: z.array(z.string()).default([]),
  questions: z.array(questionCreateSchema).default([]),
});
const createTrainingSchema = baseCreateTrainingSchema; // alias für Klarheit

// Training-Update Schema (partial - ohne nested questions partial ist OK)
const trainingUpdateSchema = baseCreateTrainingSchema.partial();

// Admin + Staff: Alle Trainings (Spieler sieht nur eigene)
router.get('/', authMiddleware, requireAuth, async (req, res) => {
  const isAdminOrStaff = req.auth!.role === 'ADMIN' || req.auth!.role === 'STAFF';
  const where: any = {};
  if (!isAdminOrStaff) {
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
          create: data.questions as any,
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
    const id = asString(req.params.id)!;
    const body = trainingUpdateSchema.parse(req.body);

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
    const id = asString(req.params.id)!;
    await prisma.training.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Fehler' });
  }
});

// Admin: Frage zu Training hinzufügen
router.post('/:id/questions', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const id = asString(req.params.id)!;
    const body = questionCreateSchema.parse(req.body);
    const q = await prisma.trainingQuestion.create({
      data: { trainingId: id, ...body } as any,
    });
    res.status(201).json(q);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Fehler' });
  }
});

// Admin: Frage bearbeiten
router.put('/questions/:qid', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const qid = asString(req.params.qid)!;
    const body = questionUpdateSchema.parse(req.body);
    const q = await prisma.trainingQuestion.update({ where: { id: qid }, data: body as any });
    res.json(q);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Fehler' });
  }
});

// Admin: Frage löschen
router.delete('/questions/:qid', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const qid = asString(req.params.qid)!;
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
  }) as any[];
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
  remarks: z.string().max(5000).optional().nullable(),
  answers: z.array(
    z.object({
      questionId: z.string(),
      rating: z.number().int().optional().nullable(),
      text: z.string().optional().nullable(),
    }),
  ),
});

// Spieler: Trainings-Fragen beantworten
router.post('/submit/answers', authMiddleware, requireAuth, async (req, res) => {
  try {
    const playerId = req.auth!.userId;
    const body = trainingAnswerSchema.parse(req.body);

    // Alt-Daten Migration: Allgemeine Bemerkung aus Text-Antworten extrahieren
    let extractedRemarksFromAnswers: string | null = null;
    for (const a of body.answers) {
      const t = a.text?.toString() ?? '';
      const marker = '--- Allgemeine Bemerkung ---';
      const idx = t.indexOf(marker);
      if (idx >= 0) {
        const extracted = t.slice(idx + marker.length).trim();
        if (extracted.length > 0) {
          extractedRemarksFromAnswers = extractedRemarksFromAnswers
            ? `${extractedRemarksFromAnswers}\n\n${extracted}`
            : extracted;
        }
        a.text = t.slice(0, idx).trim() || null;
      }
    }
    const finalRemarks =
      body.remarks?.toString().trim().length! > 0
        ? body.remarks.toString().trim()
        : extractedRemarksFromAnswers;

    const tp = await prisma.trainingPlayer.findUnique({
      where: { id: body.trainingPlayerId },
      include: { training: { include: { questions: true } } },
    });
    if (!tp) return res.status(404).json({ error: 'Nicht gefunden' });

    if (finalRemarks != null) {
      await prisma.trainingPlayer.update({
        where: { id: tp.id },
        data: { remarks: finalRemarks },
      });
    }

    const profile = await prisma.playerProfile.findUnique({ where: { userId: playerId } });
    if (!profile || tp.playerProfileId !== profile.id) {
      return res.status(403).json({ error: 'Keine Berechtigung' });
    }

    const isRatingQuestion = (qt: string) => qt === 'RATING_1_10' || qt === 'RATING';

    const createdAnswerIds: string[] = [];
    for (const a of body.answers) {
      const q = tp.training.questions.find((x) => x.id === a.questionId);
      if (!q) continue;
      let finalRating: number | null = null;
      let finalText: string | null = null;
      if (isRatingQuestion(q.questionType)) {
        const minR = (q as any).minRating ?? 1;
        const maxR = (q as any).maxRating ?? 10;
        if (a.rating == null || Number.isNaN(+a.rating)) {
          return res.status(400).json({ error: `Bitte Bewertung für Frage "${q.text}" eingeben (${minR} – ${maxR}).` });
        }
        if (+a.rating < minR || +a.rating > maxR) {
          return res.status(400).json({ error: `Bewertung für Frage "${q.text}" muss zwischen ${minR} und ${maxR} liegen.` });
        }
        finalRating = +a.rating;
      } else if (q.questionType === 'TEXT') {
        if (a.text == null || a.text.toString().trim().length === 0) {
          return res.status(400).json({ error: `Bitte Text-Frage "${q.text}" beantworten.` });
        }
        finalText = a.text.toString();
      }
      const ans = await prisma.trainingAnswer.create({
        data: {
          trainingPlayerId: tp.id,
          questionId: a.questionId,
          playerId,
          rating: finalRating,
          text: finalText,
        },
      });
      createdAnswerIds.push(ans.id);
    }

    // 🆕 SINGLE QUESTION ALERTS für Trainingsantworten!
    try {
      await processTrainingAnswers(createdAnswerIds);
    } catch (err: any) {
      console.error('[Training alert processing failed:', err?.message || err);
    }

    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Fehler' });
  }
});

export default router;
