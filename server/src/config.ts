import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

/** Treat empty / whitespace-only env vars as unset. */
function envOr(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.trim() !== '' ? v : fallback;
}

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() !== '' ? v.trim() : undefined;
}

function firstEnv(...names: string[]): { name: string; value: string } | null {
  for (const name of names) {
    const value = env(name);
    if (value) return { name, value };
  }
  return null;
}

function buildPgUrlFromParts(): { source: string; url: string } | null {
  const host = env('PGHOST') || env('POSTGRES_HOST');
  const user = env('PGUSER') || env('POSTGRES_USER');
  const password = env('PGPASSWORD') || env('POSTGRES_PASSWORD');
  const database = env('PGDATABASE') || env('POSTGRES_DB') || env('POSTGRES_DATABASE');
  if (!host || !user || !password || !database) return null;

  const port = env('PGPORT') || env('POSTGRES_PORT') || '5432';
  const protocol = env('PGPROTOCOL') || env('POSTGRES_PROTOCOL') || 'postgresql';
  return {
    source: 'PGHOST/PGUSER/PGPASSWORD/PGDATABASE',
    url: `${protocol}://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`,
  };
}

function resolveDatabaseUrl(): { source: string; url: string } {
  const direct = firstEnv(
    'DATABASE_URL',
    'DATABASE_PRIVATE_URL',
    'DATABASE_PUBLIC_URL',
    'POSTGRES_URL',
    'RAILWAY_DATABASE_URL'
  );
  if (direct) return { source: direct.name, url: direct.value };

  const fromParts = buildPgUrlFromParts();
  if (fromParts) return fromParts;

  return { source: 'default-local', url: 'postgresql://postgres:postgres@localhost:5432/fylepro' };
}

function databaseHost(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname}${u.port ? `:${u.port}` : ''}`;
  } catch {
    return 'unparseable';
  }
}

const database = resolveDatabaseUrl();
const databaseUrl = database.url;

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
  databaseSource: database.source,
  databaseHost: databaseHost(databaseUrl),
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
