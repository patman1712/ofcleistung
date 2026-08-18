import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAdmin, authMiddleware } from '../middleware/auth.js';
import { Role, asString, isRole } from '../types.js';

const router = Router();

const createUserSchema = z.object({
  email: z.string().email().min(3),
  password: z.string().min(6),
  name: z.string().min(1),
  role: z.enum(['ADMIN', 'STAFF']),
});

// ADMIN: Alle Nutzer (Admin/Staff, KEINE Player): Liste + Anlegen + Bearbeiten + Loeschen)
router.get('/', authMiddleware, requireAdmin, async (req, res) => {
  const users = await prisma.user.findMany({
    where: {
      role: { in: ['ADMIN', 'STAFF'] },
    },
    orderBy: [{ role: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  res.json(users);
});

router.post('/', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const body = createUserSchema.parse(req.body);
    const passwordHash = await bcrypt.hash(body.password, 10);
    const user = await prisma.user.create({
      data: {
        email: body.email.toLowerCase(),
        name: body.name,
        passwordHash,
        role: body.role,
      },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });
    res.status(201).json(user);
  } catch (err: any) {
    if (err?.code === 'P2002') {
      res.status(400).json({ error: 'E-Mail existiert bereits' });
    } else {
      res.status(400).json({ error: err.message || 'Fehler' });
    }
  }
});

router.put('/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const id = asString(req.params.id)!;
    const body = z.object({
      name: z.string().min(1).optional(),
      email: z.string().email().min(3).optional(),
      password: z.string().min(6).optional(),
      role: z.enum(['ADMIN', 'STAFF']).optional(),
    }).parse(req.body);

    const data: any = {};
    if (body.email) data.email = body.email.toLowerCase();
    if (body.name) data.name = body.name;
    if (body.password) data.passwordHash = await bcrypt.hash(body.password, 10);
    if (body.role) data.role = body.role;

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'Keine Daten zum Aktualisieren' });
    }
    const user = await prisma.user.update({
      where: { id },
      data,
      select: { id: true, email: true, name: true, role: true, updatedAt: true },
    });
    res.json(user);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Fehler' });
  }
});

router.delete('/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const id = asString(req.params.id)!;
    // User SELBST LOESCHEN VERBIETEN!
    if (req.auth && req.auth.userId === id) {
      return res.status(400).json({ error: 'Du kannst dich nicht selbst löschen!' });
    }
    await prisma.user.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Fehler' });
  }
});

export default router;
