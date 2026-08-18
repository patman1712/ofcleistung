import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { Role } from '../types.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

export interface AuthPayload {
  userId: string;
  role: Role;
  name: string;
}

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });
}

export function parseAuthHeader(req: Request): AuthPayload | null {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    const token = header.slice(7);
    try {
      return jwt.verify(token, JWT_SECRET) as AuthPayload;
    } catch {
      return null;
    }
  }
  const cookieToken = req.cookies?.token;
  if (cookieToken) {
    try {
      return jwt.verify(cookieToken, JWT_SECRET) as AuthPayload;
    } catch {
      return null;
    }
  }
  return null;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthPayload | null;
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  req.auth = parseAuthHeader(req);
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.auth) return res.status(401).json({ error: 'Nicht eingeloggt' });
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.auth) return res.status(401).json({ error: 'Nicht eingeloggt' });
  if (req.auth.role !== 'ADMIN') return res.status(403).json({ error: 'Keine Admin-Rechte' });
  next();
}
