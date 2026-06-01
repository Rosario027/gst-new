import { config } from './config';

const DB_SETUP_ERROR_CODES = new Set([
  '28P01', // invalid_password
  '3D000', // invalid_catalog_name
  '08000',
  '08001',
  '08003',
  '08004',
  '08006',
  '08007',
  '57P01',
  'ECONNREFUSED',
  'ENOTFOUND',
  'ETIMEDOUT',
]);

export function isDatabaseSetupError(err: any): boolean {
  const code = err?.code;
  if (code && DB_SETUP_ERROR_CODES.has(String(code))) return true;

  const message = String(err?.message ?? '').toLowerCase();
  return (
    message.includes('password authentication failed') ||
    message.includes('database') && message.includes('does not exist') ||
    message.includes('relation "users" does not exist') ||
    message.includes('connect econnrefused') ||
    message.includes('getaddrinfo enotfound')
  );
}

export function databaseSetupMessage(err: any): string {
  const code = String(err?.code ?? '');
  const message = String(err?.message ?? '').toLowerCase();
  const target = `${config.databaseSource} (${config.databaseHost})`;

  if (config.env === 'production' && config.databaseSource === 'default-local') {
    return 'Railway app is not receiving the Postgres connection variables. Add DATABASE_URL (or DATABASE_PRIVATE_URL) from the Postgres service to the app service variables and redeploy.';
  }

  if (code === '28P01' || message.includes('password authentication failed')) {
    return `Database login failed for ${target}. Check the app service database variables and redeploy.`;
  }

  if (message.includes('relation "users" does not exist')) {
    return `Database tables are missing on ${target}. Set RUN_MIGRATIONS_ON_BOOT=true or run the schema setup once.`;
  }

  if (code === '3D000' || message.includes('database') && message.includes('does not exist')) {
    return `Configured database was not found for ${target}. Check the database name in the app service variables.`;
  }

  return `Database is unavailable at ${target}. The Postgres deployment may be online, but the app service cannot connect with its current variables.`;
}

