import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { rawQuery, withTenant } from '../db';
import { signToken, requireAuth } from '../middleware/auth';
import { wrap } from '../middleware/async';
import { AuthUser } from '../types';

export const authRouter = Router();

authRouter.post('/login', wrap(async (req, res) => {
  const { loginId, password } = req.body ?? {};
  if (!loginId || !password) {
    return res.status(400).json({ error: 'loginId and password are required' });
  }
  // login_id is unique per tenant; for a simple multi-tenant login we match the
  // first active user whose password verifies.
  const candidates = await rawQuery<any>(
    `SELECT id, tenant_id, login_id, password_hash, full_name, role
       FROM users WHERE login_id = $1 AND is_active = true`,
    [loginId]
  );
  for (const u of candidates) {
    if (await bcrypt.compare(password, u.password_hash)) {
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

authRouter.post('/logout', (_req, res) => {
  res.clearCookie('fp_token');
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

/** Companies + GST registrations the user can access (drives the entity switcher). */
authRouter.get('/registrations', requireAuth, wrap(async (req, res) => {
  const rows = await withTenant({ tenantId: req.user!.tenantId, userId: req.user!.userId }, (c) =>
    c.query(
      `SELECT g.id, g.gstin, g.legal_name, g.state_code, g.state_name,
              g.filing_scheme, g.delivery_mode, c.id AS company_id, c.legal_name AS company_name
         FROM gst_registrations g
         JOIN companies c ON c.id = g.company_id
        WHERE g.is_active = true
        ORDER BY c.legal_name, g.gstin`
    ).then((r) => r.rows)
  );
  res.json({ registrations: rows });
}));
