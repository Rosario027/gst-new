import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { rawQuery, withTenant, pool } from '../db';
import { signToken, requireAuth } from '../middleware/auth';
import { wrap } from '../middleware/async';
import { AuthUser } from '../types';
import { isValidGstin, stateCodeFromGstin, panFromGstin } from '../services/gstin';
import { STATE_NAMES } from '../services/gstr1/util';
import { config } from '../config';
import { databaseSetupMessage, isDatabaseSetupError } from '../db-errors';

export const authRouter = Router();

const ROLE_MAP: Record<string, string> = {
  'company admin': 'company_admin', 'tax manager': 'tax_manager', approver: 'approver',
  reviewer: 'reviewer', preparer: 'preparer', viewer: 'viewer',
};
const mapRole = (r?: string) => ROLE_MAP[String(r ?? '').trim().toLowerCase()] ?? 'preparer';

const LOCAL_DEMO_USER: AuthUser = {
  tenantId: '00000000-0000-4000-8000-000000000001',
  userId: '00000000-0000-4000-8000-000000000002',
  loginId: 'user',
  fullName: 'admin',
  role: 'company_admin',
};

const LOCAL_DEMO_REGISTRATIONS = [{
  id: '00000000-0000-4000-8000-000000000003',
  gstin: '27AALCT0864B1ZE',
  legal_name: 'Primary Company',
  state_code: '27',
  state_name: 'Maharashtra',
  filing_scheme: 'monthly',
  delivery_mode: 'json',
  company_id: '00000000-0000-4000-8000-000000000004',
  company_name: 'Primary Company',
}];

function isLocalDemoLogin(loginId: string, password: string): boolean {
  return config.env !== 'production' && loginId === 'user' && password === 'user123';
}

function isLocalDemoUser(user?: AuthUser): boolean {
  return config.env !== 'production' && user?.userId === LOCAL_DEMO_USER.userId;
}

/** Find a usable (not used, not expired) temporary onboarding credential. */
async function findValidTempCredential(tempUserId: string, tempPassword: string): Promise<string | null> {
  const rows = await rawQuery<any>(
    `SELECT id, temp_password_hash, is_used, expires_at
       FROM temporary_onboarding_credentials WHERE temp_user_id = $1`,
    [tempUserId]
  );
  for (const r of rows) {
    if (r.is_used) continue;
    if (new Date(r.expires_at).getTime() < Date.now()) continue;
    if (await bcrypt.compare(tempPassword, r.temp_password_hash)) return r.id;
  }
  return null;
}

authRouter.post('/login', wrap(async (req, res) => {
  const { loginId, password } = req.body ?? {};
  if (!loginId || !password) {
    return res.status(400).json({ error: 'loginId and password are required' });
  }
  // login_id is unique per tenant; for a simple multi-tenant login we match the
  // first active user whose password verifies.
  let candidates: any[];
  try {
    candidates = await rawQuery<any>(
      `SELECT id, tenant_id, login_id, password_hash, full_name, role
         FROM users WHERE login_id = $1 AND is_active = true`,
      [loginId]
    );
  } catch (err: any) {
    if (isDatabaseSetupError(err) && isLocalDemoLogin(loginId, password)) {
      const token = signToken(LOCAL_DEMO_USER);
      res.cookie('fp_token', token, { httpOnly: true, sameSite: 'lax', maxAge: 12 * 3600 * 1000 });
      return res.json({ token, user: LOCAL_DEMO_USER, demoMode: true });
    }
    if (isDatabaseSetupError(err)) {
      err.status = 503;
      err.message = databaseSetupMessage(err);
    }
    throw err;
  }
  for (const u of candidates) {
    if (!u.password_hash || typeof u.password_hash !== 'string') continue; // skip malformed rows
    let ok = false;
    try { ok = await bcrypt.compare(password, u.password_hash); } catch { ok = false; }
    if (ok) {
      const user: AuthUser = {
        tenantId: u.tenant_id, userId: u.id, loginId: u.login_id,
        fullName: u.full_name, role: u.role,
      };
      const token = signToken(user);
      res.cookie('fp_token', token, { httpOnly: true, sameSite: 'lax', maxAge: 12 * 3600 * 1000 });
      return res.json({ token, user });
    }
  }
  return res.status(401).json({ error: 'Invalid login ID or password' });
}));

// ── Onboarding: verify the temporary credential ──
authRouter.post('/onboarding/verify', wrap(async (req, res) => {
  const { tempUserId, tempPassword } = req.body ?? {};
  if (!tempUserId || !tempPassword) return res.status(400).json({ error: 'Temporary credentials required' });
  const credId = await findValidTempCredential(tempUserId, tempPassword);
  if (!credId) return res.status(401).json({ error: 'Invalid or expired temporary credentials' });
  return res.json({ ok: true });
}));

// ── Onboarding: create the real tenant, admin, companies, GSTINs, team ──
authRouter.post('/onboarding/complete', wrap(async (req, res) => {
  const { tempUserId, tempPassword, workspaceName, companies, admin, team } = req.body ?? {};
  if (!admin?.loginId || !admin?.password) return res.status(400).json({ error: 'Admin login id and password are required' });
  if (!Array.isArray(companies) || companies.length === 0) return res.status(400).json({ error: 'At least one company / GSTIN is required' });

  const credId = await findValidTempCredential(tempUserId, tempPassword);
  if (!credId) return res.status(401).json({ error: 'Invalid or expired temporary credentials' });

  // Validate every GSTIN up front.
  for (const c of companies) {
    const g = String(c.gstin ?? '').trim().toUpperCase();
    if (!isValidGstin(g)) return res.status(400).json({ error: `Invalid GSTIN: ${c.gstin}` });
  }

  const adminHash = await bcrypt.hash(admin.password, 10);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const tenantId = (await client.query(
      `INSERT INTO tenants (name) VALUES ($1) RETURNING id`,
      [workspaceName || `${admin.fullName || admin.loginId} workspace`]
    )).rows[0].id;

    const adminId = (await client.query(
      `INSERT INTO users (tenant_id, login_id, password_hash, full_name, role)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [tenantId, admin.loginId, adminHash, admin.fullName || admin.loginId, mapRole(admin.role)]
    )).rows[0].id;

    // One company per distinct PAN; each GSTIN becomes a registration under it.
    const companyByPan: Record<string, string> = {};
    for (const c of companies) {
      const gstin = String(c.gstin).trim().toUpperCase();
      const pan = panFromGstin(gstin);
      let companyId = companyByPan[pan];
      if (!companyId) {
        companyId = (await client.query(
          `INSERT INTO companies (tenant_id, legal_name, pan, created_by) VALUES ($1, $2, $3, $4) RETURNING id`,
          [tenantId, c.legalName || c.companyName || 'Company', pan, adminId]
        )).rows[0].id;
        companyByPan[pan] = companyId;
        await client.query(
          `INSERT INTO user_company_access (tenant_id, user_id, company_id, access, granted_by)
           VALUES ($1, $2, $3, 'admin', $2) ON CONFLICT DO NOTHING`,
          [tenantId, adminId, companyId]
        );
      }
      const sc = stateCodeFromGstin(gstin);
      await client.query(
        `INSERT INTO gst_registrations (tenant_id, company_id, gstin, legal_name, state_code, state_name, filing_scheme, delivery_mode)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'json') ON CONFLICT (tenant_id, gstin) DO NOTHING`,
        [tenantId, companyId, gstin, c.legalName || c.companyName || null, sc, STATE_NAMES[sc] || c.stateName || '', c.filingScheme === 'qrmp' ? 'qrmp' : 'monthly']
      );
    }

    // Optional team members — granted access to all companies created here.
    for (const t of Array.isArray(team) ? team : []) {
      if (!t.loginId || !t.password) continue;
      const tHash = await bcrypt.hash(t.password, 10);
      const tId = (await client.query(
        `INSERT INTO users (tenant_id, login_id, password_hash, full_name, role)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [tenantId, t.loginId, tHash, t.fullName || t.loginId, mapRole(t.role)]
      )).rows[0].id;
      for (const companyId of Object.values(companyByPan)) {
        await client.query(
          `INSERT INTO user_company_access (tenant_id, user_id, company_id, access, granted_by)
           VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
          [tenantId, tId, companyId, mapRole(t.role) === 'viewer' ? 'read' : 'write', adminId]
        );
      }
    }

    await client.query(`UPDATE temporary_onboarding_credentials SET is_used = true WHERE id = $1`, [credId]);
    await client.query('COMMIT');

    const user: AuthUser = { tenantId, userId: adminId, loginId: admin.loginId, fullName: admin.fullName || admin.loginId, role: mapRole(admin.role) };
    const token = signToken(user);
    res.cookie('fp_token', token, { httpOnly: true, sameSite: 'lax', maxAge: 12 * 3600 * 1000 });
    return res.json({ token, user });
  } catch (err: any) {
    await client.query('ROLLBACK');
    if (err.code === '23505') return res.status(409).json({ error: 'A user login id or GSTIN already exists' });
    throw err;
  } finally {
    client.release();
  }
}));

authRouter.post('/logout', (_req, res) => {
  res.clearCookie('fp_token');
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

/** Companies + GST registrations the user can access (drives the entity switcher). */
authRouter.get('/registrations', requireAuth, wrap(async (req, res) => {
  let rows;
  try {
    rows = await withTenant({ tenantId: req.user!.tenantId, userId: req.user!.userId }, (c) =>
      c.query(
        `SELECT g.id, g.gstin, g.legal_name, g.state_code, g.state_name,
                g.filing_scheme, g.delivery_mode, c.id AS company_id, c.legal_name AS company_name
           FROM gst_registrations g
           JOIN companies c ON c.id = g.company_id
          WHERE g.is_active = true
          ORDER BY c.legal_name, g.gstin`
      ).then((r) => r.rows)
    );
  } catch (err: any) {
    if (isDatabaseSetupError(err) && isLocalDemoUser(req.user)) {
      return res.json({ registrations: LOCAL_DEMO_REGISTRATIONS, demoMode: true });
    }
    if (isDatabaseSetupError(err)) {
      err.status = 503;
      err.message = databaseSetupMessage(err);
    }
    throw err;
  }
  res.json({ registrations: rows });
}));
