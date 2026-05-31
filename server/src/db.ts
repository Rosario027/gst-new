import { Pool, PoolClient } from 'pg';
import { config } from './config';

export const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.pgSsl ? { rejectUnauthorized: false } : undefined,
  max: 10,
});

pool.on('error', (err) => {
  console.error('[db] unexpected idle client error', err);
});

export interface TenantContext {
  tenantId: string;
  userId: string;
}

/**
 * Run `fn` inside a transaction with the RLS session variables set so all
 * queries are automatically scoped to the tenant/user. This is the ONLY way
 * application code should touch tenant data — never query the pool directly
 * for tenant-scoped tables.
 */
export async function withTenant<T>(
  ctx: TenantContext,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // set_config(..., true) = local to transaction
    await client.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [ctx.tenantId]);
    await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [ctx.userId]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Unscoped query — only for auth/bootstrap (login lookup, onboarding creds). */
export async function rawQuery<T = any>(text: string, params: any[] = []): Promise<T[]> {
  const res = await pool.query(text, params);
  return res.rows as T[];
}

export async function closePool(): Promise<void> {
  await pool.end();
}
