import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';

import authRouter from './routes/auth.js';
import playersRouter from './routes/players.js';
import dailyQuestionsRouter from './routes/dailyQuestions.js';
import trainingsRouter from './routes/trainings.js';
import evaluationsRouter from './routes/evaluations.js';
import alertsRouter from './routes/alerts.js';
import { authMiddleware } from './middleware/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
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
app.use('/api/players', playersRouter);
app.use('/api/daily-questions', dailyQuestionsRouter);
app.use('/api/trainings', trainingsRouter);
app.use('/api/evaluations', evaluationsRouter);
app.use('/api/alerts', alertsRouter);

// Frontend ausliefern (Production)
const clientDist = path.resolve(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get(/^\/(?!api).*/, (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`OFC Leistungsdiagnostik läuft auf Port ${PORT}`);
  console.log(`Frontend wird ausgeliefert aus: ${clientDist}`);
});
