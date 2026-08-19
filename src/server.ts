import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import fs from 'fs';

import authRouter from './routes/auth.js';
import usersRouter from './routes/users.js';
import playersRouter from './routes/players.js';
import dailyQuestionsRouter from './routes/dailyQuestions.js';
import trainingsRouter from './routes/trainings.js';
import evaluationsRouter from './routes/evaluations.js';
import alertsRouter from './routes/alerts.js';
import settingsRouter from './routes/settings.js';
import { authMiddleware } from './middleware/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.resolve(PROJECT_ROOT, 'prisma', 'data');
const PORT = Number(process.env.PORT || 8080);
const HOST = '0.0.0.0';

// Sicherstellen, dass prisma/data existiert (Volume Mount)
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  console.log(`[boot] Created data dir: ${DATA_DIR}`);
}

// 1) Prisma DB Push (erstellt Setting-Modell + neue Tabellen auf jeden Fall)
try {
  console.log('[boot] Running prisma db push ...');
  execSync('npx prisma db push --skip-generate', {
    cwd: PROJECT_ROOT,
    stdio: 'inherit',
    env: { ...process.env },
  });
  console.log('[boot] prisma db push OK ✅');
} catch (e: any) {
  console.warn('[boot] prisma db push WARNUNG (weiter gehts trotzdem):', e?.message || e);
}

// 2) Seed (nur wenn DB frisch ist - auskommentiert aber behalten wir NPM seed fallback bei)
try {
  console.log('[boot] Running prisma seed ... (falls noch kein Admin)');
  execSync('npm run seed', {
    cwd: PROJECT_ROOT,
    stdio: 'inherit',
    env: { ...process.env },
  });
  console.log('[boot] prisma seed OK ✅');
} catch (e: any) {
  // Seed darf fehlschlagen, falls Admin schon existiert (Unique-Constraint)
  console.warn('[boot] seed übersprungen (Daten existieren vermutlich schon):', e?.message || String(e).slice(0, 200));
}

const app = express();

app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(authMiddleware);

app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/players', playersRouter);
app.use('/api/daily-questions', dailyQuestionsRouter);
app.use('/api/trainings', trainingsRouter);
app.use('/api/evaluations', evaluationsRouter);
app.use('/api/alerts', alertsRouter);
app.use('/api/settings', settingsRouter);

// Frontend ausliefern (Production)
const clientDist = path.resolve(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get(/^\/(?!api).*/, (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`OFC Leistungsdiagnostik läuft auf http://${HOST}:${PORT}`);
  console.log(`Frontend wird ausgeliefert aus: ${clientDist}`);
  if (process.env.NODE_ENV === 'production') {
    console.log(`PID ${process.pid} - NODE_ENV=production`);
  }
});
