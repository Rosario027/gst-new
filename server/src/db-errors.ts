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

  if (code === '28P01' || message.includes('password authentication failed')) {
    return 'Database login failed. Check DATABASE_URL in .env, then run npm run db:setup:dev.';
  }

  if (message.includes('relation "users" does not exist')) {
    return 'Database tables are missing. Run npm run db:setup:dev, then try logging in again.';
  }

  if (code === '3D000' || message.includes('database') && message.includes('does not exist')) {
    return 'Configured database was not found. Create it or update DATABASE_URL, then run npm run db:setup:dev.';
  }

  return 'Database is unavailable. Check DATABASE_URL/Postgres, then run npm run db:setup:dev.';
}

