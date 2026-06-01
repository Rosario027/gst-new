import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import { config } from './config';
import { pool } from './db';
import { authRouter } from './routes/auth.routes';
import { gstr1Router } from './routes/gstr1.routes';
import { gstr3bRouter } from './routes/gstr3b.routes';

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// ── Health check (used by Railway) ──
app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, db: 'up', env: config.env });
  } catch (err: any) {
    res.status(503).json({ ok: false, db: 'down', error: err.message });
  }
});

// ── API ──
app.use('/api/auth', authRouter);
app.use('/api/gstr1', gstr1Router);
app.use('/api/gstr3b', gstr3bRouter);

// ── Static frontend (the existing prototype) ──
app.use(express.static(config.paths.publicDir));

// SPA-ish fallback: serve login for unknown non-API GET routes
app.get(/^(?!\/api).*/, (req, res, next) => {
  if (req.method !== 'GET') return next();
  res.sendFile(path.join(config.paths.publicDir, 'login.html'));
});

// ── Error handler ──
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[error]', err);
  res.status(err.status ?? 500).json({ error: err.message ?? 'Internal server error' });
});

const server = app.listen(config.port, () => {
  console.log(`FylePro GST server listening on :${config.port} (${config.env})`);
});

process.on('SIGTERM', () => server.close(() => pool.end()));
process.on('SIGINT', () => server.close(() => pool.end()));
