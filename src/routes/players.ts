import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAdmin, authMiddleware } from '../middleware/auth.js';
import { Role, asString } from '../types.js';

const router = Router();

const createPlayerSchema = z.object({
  email: z.string().email().min(3),
  password: z.string().min(6),
  name: z.string().min(1),
  birthDate: z.string().optional().nullable(),
  heightCm: z.number().int().positive().optional().nullable(),
  weightKg: z.number().positive().optional().nullable(),
  position: z.string().optional().nullable(),
});

// ADMIN: Liste aller Spieler (User mit Rolle PLAYER)
router.get('/', authMiddleware, requireAdmin, async (req, res) => {
  const players = await prisma.user.findMany({
    where: { role: 'PLAYER' },
    include: { playerProfile: true },
    orderBy: { name: 'asc' },
  });
  res.json(players);
});

// ADMIN: Spieler anlegen
router.post('/', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const data = createPlayerSchema.parse(req.body);
    const passwordHash = await bcrypt.hash(data.password, 10);

    const user = await prisma.user.create({
      data: {
        email: data.email.toLowerCase(),
        name: data.name,
        passwordHash,
        role: 'PLAYER',
        playerProfile: {
          create: {
            birthDate: data.birthDate ? new Date(data.birthDate) : undefined,
            heightCm: data.heightCm ?? undefined,
            weightKg: data.weightKg ?? undefined,
            position: data.position ?? undefined,
          },
        },
      },
      include: { playerProfile: true },
    });
    res.status(201).json(user);
  } catch (err: any) {
    if (err?.code === 'P2002') {
      res.status(400).json({ error: 'E-Mail existiert bereits' });
    } else {
      res.status(400).json({ error: err.message || 'Fehler beim Anlegen' });
    }
  }
});

// ADMIN: Spieler bearbeiten
router.put('/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const id = asString(req.params.id)!;
    const body = createPlayerSchema.partial().parse(req.body);
    const updateData: any = {};
    if (body.email) updateData.email = body.email.toLowerCase();
    if (body.name) updateData.name = body.name;
    if (body.password) updateData.passwordHash = await bcrypt.hash(body.password, 10);

    const profileUpdate: any = {};
    if (body.birthDate !== undefined) profileUpdate.birthDate = body.birthDate ? new Date(body.birthDate) : null;
    if (body.heightCm !== undefined) profileUpdate.heightCm = body.heightCm ?? null;
    if (body.weightKg !== undefined) profileUpdate.weightKg = body.weightKg ?? null;
    if (body.position !== undefined) profileUpdate.position = body.position ?? null;

    const user = await prisma.user.update({
      where: { id },
      data: {
        ...updateData,
        playerProfile: {
          update: profileUpdate,
        },
      },
      include: { playerProfile: true },
    });
    res.json(user);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Fehler beim Bearbeiten' });
  }
});

// ADMIN: Spieler löschen
router.delete('/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const id = asString(req.params.id)!;
    await prisma.user.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Fehler beim Löschen' });
  }
});

// Spieler (selbst) - eigene Profildaten
router.get('/me/profile', authMiddleware, async (req, res) => {
  if (!req.auth) return res.status(401).json({ error: 'Nicht eingeloggt' });
  const profile = await prisma.playerProfile.findUnique({
    where: { userId: req.auth.userId },
  });
  res.json(profile);
});

export default router;
