import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import { config } from './config';
import { pool } from './db';
import { authRouter } from './routes/auth.routes';
import { gstr1Router } from './routes/gstr1.routes';
import { gstr3bRouter } from './routes/gstr3b.routes';
import { databaseSetupMessage, isDatabaseSetupError } from './db-errors';

/** Apply schema.sql (+ seed.sql) on boot — idempotent, so a fresh deploy is self-setup. */
async function runMigrations(): Promise<void> {
  if (!config.runMigrationsOnBoot) return;
  try {
    const schemaPath = path.join(config.paths.dbDir, 'schema.sql');
    if (fs.existsSync(schemaPath)) {
      await pool.query(fs.readFileSync(schemaPath, 'utf8'));
      console.log('[boot] schema.sql applied (idempotent).');
    }
    const seedPath = path.join(config.paths.dbDir, 'seed.sql');
    if (fs.existsSync(seedPath)) await pool.query(fs.readFileSync(seedPath, 'utf8'));
  } catch (err: any) {
    // Don't crash the server — surface via /api/health and logs.
    console.error('[boot] migration failed (server will still start):', err.message);
  }
}

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// ── Health check (used by Railway) — also reports DB identity + standard user ──
app.get('/api/health', async (_req, res) => {
  try {
    const meta = await pool.query(
      `SELECT current_database() AS db_name, current_user AS db_role,
              (SELECT count(*)::int FROM users) AS user_count,
              EXISTS(SELECT 1 FROM users WHERE login_id = 'user' AND is_active) AS has_standard_user`
    );
    res.json({
      ok: true, db: 'up', env: config.env, ssl: config.pgSsl,
      db_source: config.databaseSource, db_host: config.databaseHost,
      jwtSecretSet: !!process.env.JWT_SECRET && process.env.JWT_SECRET.trim() !== '',
      ...meta.rows[0],
    });
  } catch (err: any) {
    // 'relation users does not exist' here means tables aren't applied on THIS db.
    let dbName: string | null = null;
    try { dbName = (await pool.query('SELECT current_database() AS db')).rows[0].db; } catch {}
    res.status(503).json({
      ok: false, db: 'down_or_unmigrated', db_name: dbName,
      db_source: config.databaseSource, db_host: config.databaseHost,
      error: err.message,
    });
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
  if (isDatabaseSetupError(err)) {
    res.status(err.status ?? 503).json({ error: databaseSetupMessage(err) });
    return;
  }
  res.status(err.status ?? 500).json({ error: err.message ?? 'Internal server error' });
});

async function start(): Promise<void> {
  // Apply migrations BEFORE accepting traffic so the first login/onboarding
  // request never hits missing tables. Resilient: starts even if it fails.
  await runMigrations();
  const server = app.listen(config.port, () => {
    console.log(`FylePro GST server listening on :${config.port} (${config.env}) · ssl=${config.pgSsl}`);
  });
  process.on('SIGTERM', () => server.close(() => pool.end()));
  process.on('SIGINT', () => server.close(() => pool.end()));
}

start().catch((err) => {
  console.error('[fatal] failed to start', err);
  process.exit(1);
});
