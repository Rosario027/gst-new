-- ════════════════════════════════════════════════════════════════════
-- FylePro GST — seed
--
-- Standard login for the main application (created in the DB for ease of use):
--   Login ID : user
--   Password : user123
--   Name     : admin   (role: company_admin)
--   GSTIN    : 27AALCT0864B1ZE  (Maharashtra · 27 · Regular/Normal monthly)
--
-- Idempotent: re-running resets the password and keeps a single account.
-- Applied automatically on server boot (see runMigrations) and by `npm run db:setup`.
-- ════════════════════════════════════════════════════════════════════

DO $$
DECLARE v_tenant uuid; v_user uuid; v_company uuid;
BEGIN
  -- Tenant / workspace
  SELECT id INTO v_tenant FROM tenants WHERE name = 'Primary Workspace';
  IF v_tenant IS NULL THEN
    INSERT INTO tenants (name) VALUES ('Primary Workspace') RETURNING id INTO v_tenant;
  END IF;

  -- Standard user: user / user123 (name "admin")
  SELECT id INTO v_user FROM users WHERE tenant_id = v_tenant AND login_id = 'user';
  IF v_user IS NULL THEN
    INSERT INTO users (tenant_id, login_id, password_hash, full_name, role)
    VALUES (v_tenant, 'user', crypt('user123', gen_salt('bf')), 'admin', 'company_admin')
    RETURNING id INTO v_user;
  ELSE
    UPDATE users SET password_hash = crypt('user123', gen_salt('bf')), full_name = 'admin',
                     role = 'company_admin', is_active = true
    WHERE id = v_user;
  END IF;

  -- Company (PAN = chars 3-12 of the GSTIN)
  SELECT id INTO v_company FROM companies WHERE tenant_id = v_tenant AND pan = 'AALCT0864B';
  IF v_company IS NULL THEN
    INSERT INTO companies (tenant_id, legal_name, pan, created_by)
    VALUES (v_tenant, 'Primary Company', 'AALCT0864B', v_user)
    RETURNING id INTO v_company;
  END IF;

  -- Access grant
  INSERT INTO user_company_access (tenant_id, user_id, company_id, access, granted_by)
  VALUES (v_tenant, v_user, v_company, 'admin', v_user)
  ON CONFLICT (tenant_id, user_id, company_id) DO NOTHING;

  -- GST registration: regular/normal, monthly, Maharashtra
  INSERT INTO gst_registrations
    (tenant_id, company_id, gstin, legal_name, state_code, state_name, filing_scheme, delivery_mode)
  VALUES
    (v_tenant, v_company, '27AALCT0864B1ZE', 'Primary Company', '27', 'Maharashtra', 'monthly', 'json')
  ON CONFLICT (tenant_id, gstin) DO NOTHING;
END $$;

-- Keep the onboarding credential (new / new123) usable for creating more workspaces.
INSERT INTO temporary_onboarding_credentials (temp_user_id, temp_password_hash)
SELECT 'new', crypt('new123', gen_salt('bf'))
WHERE NOT EXISTS (SELECT 1 FROM temporary_onboarding_credentials WHERE temp_user_id = 'new');

UPDATE temporary_onboarding_credentials
   SET is_used = false, expires_at = now() + interval '365 days'
 WHERE temp_user_id = 'new';
