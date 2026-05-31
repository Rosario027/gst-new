-- ════════════════════════════════════════════════════════════════════
-- FylePro GST — demo seed data (idempotent)
-- Login:  admin / admin123   (tenant: Apex Group)
-- Mirrors the prototype's "Apex Steel · Maharashtra" normal registration.
-- bcrypt hashes generated with pgcrypto so the Node bcryptjs verifier matches.
-- ════════════════════════════════════════════════════════════════════

-- RLS is bypassed here because this script runs as the table owner.
-- (Owners bypass RLS by default unless FORCE ROW LEVEL SECURITY is set.)

DO $$
DECLARE
  v_tenant uuid;
  v_user   uuid;
  v_company uuid;
BEGIN
  -- Tenant
  SELECT id INTO v_tenant FROM tenants WHERE name = 'Apex Group';
  IF v_tenant IS NULL THEN
    INSERT INTO tenants (name) VALUES ('Apex Group') RETURNING id INTO v_tenant;
  END IF;

  -- Admin user
  SELECT id INTO v_user FROM users WHERE tenant_id = v_tenant AND login_id = 'admin';
  IF v_user IS NULL THEN
    INSERT INTO users (tenant_id, login_id, password_hash, full_name, role)
    VALUES (v_tenant, 'admin', crypt('admin123', gen_salt('bf')), 'Jude Akash', 'company_admin')
    RETURNING id INTO v_user;
  END IF;

  -- Company
  SELECT id INTO v_company FROM companies WHERE tenant_id = v_tenant AND pan = 'AABCT3518Q';
  IF v_company IS NULL THEN
    INSERT INTO companies (tenant_id, legal_name, pan, created_by)
    VALUES (v_tenant, 'Apex Steel Private Limited', 'AABCT3518Q', v_user)
    RETURNING id INTO v_company;
  END IF;

  -- Access grant
  INSERT INTO user_company_access (tenant_id, user_id, company_id, access, granted_by)
  VALUES (v_tenant, v_user, v_company, 'admin', v_user)
  ON CONFLICT (tenant_id, user_id, company_id) DO NOTHING;

  -- GST registration (normal, monthly, Maharashtra)
  INSERT INTO gst_registrations
    (tenant_id, company_id, gstin, legal_name, state_code, state_name, filing_scheme, delivery_mode)
  VALUES
    (v_tenant, v_company, '27AABCT3518Q1ZV', 'Apex Steel Private Limited', '27', 'Maharashtra', 'monthly', 'json')
  ON CONFLICT (tenant_id, gstin) DO NOTHING;
END $$;
