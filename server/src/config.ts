import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '8080', 10),

  databaseUrl: required('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/fylepro'),
  pgSsl: (process.env.PGSSL ?? 'false').toLowerCase() === 'true',

  jwtSecret: required('JWT_SECRET', 'dev-insecure-secret-change-me'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '12h',

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
