import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

/** Treat empty / whitespace-only env vars as unset. */
function envOr(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.trim() !== '' ? v : fallback;
}

const databaseUrl = envOr('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/fylepro');

// SSL: honor PGSSL when explicitly set; otherwise infer — managed/remote
// Postgres (Railway, Render, Supabase, …) needs SSL; localhost does not.
function resolveSsl(): boolean {
  const explicit = process.env.PGSSL;
  if (explicit && explicit.trim() !== '') return explicit.toLowerCase() === 'true';
  return !/@(localhost|127\.0\.0\.1)[:/]/.test(databaseUrl);
}

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '8080', 10),

  databaseUrl,
  pgSsl: resolveSsl(),

  // Empty string is treated as unset so a blank Railway var can't break JWT signing.
  jwtSecret: envOr('JWT_SECRET', 'dev-insecure-secret-change-me'),
  jwtExpiresIn: envOr('JWT_EXPIRES_IN', '12h'),

  // Apply schema.sql on boot (idempotent) so a fresh deploy has its tables.
  runMigrationsOnBoot: (process.env.RUN_MIGRATIONS_ON_BOOT ?? 'true').toLowerCase() !== 'false',

  gsp: {
    provider: process.env.GSP_PROVIDER ?? 'stub',
    baseUrl: process.env.GSP_BASE_URL ?? '',
    clientId: process.env.GSP_CLIENT_ID ?? '',
    clientSecret: process.env.GSP_CLIENT_SECRET ?? '',
  },

  paths: {
    publicDir: path.resolve(process.cwd(), 'public'),
    uploadsDir: path.resolve(process.cwd(), 'uploads'),
    dbDir: path.resolve(process.cwd(), 'db'),
  },
};

export const isProd = config.env === 'production';
