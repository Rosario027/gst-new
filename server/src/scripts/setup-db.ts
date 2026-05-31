import fs from 'fs';
import path from 'path';
import { pool, closePool } from '../db';
import { config } from '../config';

/** Apply schema.sql then seed.sql. Idempotent — safe to re-run. */
async function main(): Promise<void> {
  const schemaPath = path.join(config.paths.dbDir, 'schema.sql');
  const seedPath = path.join(config.paths.dbDir, 'seed.sql');

  console.log('[db:setup] applying schema.sql ...');
  await pool.query(fs.readFileSync(schemaPath, 'utf8'));
  console.log('[db:setup] schema applied.');

  if (fs.existsSync(seedPath)) {
    console.log('[db:setup] applying seed.sql ...');
    await pool.query(fs.readFileSync(seedPath, 'utf8'));
    console.log('[db:setup] seed applied (clean slate — onboard via "New user?" with new / new123).');
  }

  await closePool();
  console.log('[db:setup] done.');
}

main().catch((err) => {
  console.error('[db:setup] failed:', err);
  process.exit(1);
});
