import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';

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
const PORT = Number(process.env.PORT || 8080);
const HOST = '0.0.0.0';
const app = express();

app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);
app.use(express.json());
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
