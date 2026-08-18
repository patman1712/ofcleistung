import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { signToken, requireAuth, authMiddleware } from '../middleware/auth.js';
import { Role } from '../types.js';

const router = Router();

const loginSchema = z.object({
  email: z.string().email().min(3),
  password: z.string().min(6),
});

router.post('/login', authMiddleware, async (req, res) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { playerProfile: true },
    });
    if (!user) return res.status(401).json({ error: 'Login fehlgeschlagen' });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Login fehlgeschlagen' });

    const token = signToken({ userId: user.id, role: user.role as Role, name: user.name });
    res.cookie('token', token, {
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60 * 1000,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        hasPlayerProfile: !!user.playerProfile,
      },
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Ungültige Eingabe' });
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

router.get('/me', authMiddleware, async (req, res) => {
  if (!req.auth) return res.status(401).json({ error: 'Nicht eingeloggt' });
  const user = await prisma.user.findUnique({
    where: { id: req.auth.userId },
    include: { playerProfile: true },
  });
  if (!user) return res.status(401).json({ error: 'Nicht eingeloggt' });
  res.json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    playerProfile: user.playerProfile ?? null,
  });
});

export default router;
