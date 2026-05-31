-- FylePro PostgreSQL schema for pgAdmin 4
-- Run in a new database. The application should set these per request:
--   set_config('app.current_tenant_id', '<tenant uuid>', true)
--   set_config('app.current_user_id', '<user uuid>', true)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE filing_scheme AS ENUM ('monthly', 'qrmp');
CREATE TYPE user_role AS ENUM ('company_admin', 'tax_manager', 'approver', 'reviewer', 'preparer', 'viewer');
CREATE TYPE access_level AS ENUM ('admin', 'write', 'review', 'read');

CREATE TABLE tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  login_id text NOT NULL,
  password_hash text NOT NULL,
  full_name text NOT NULL,
  role user_role NOT NULL DEFAULT 'viewer',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, login_id)
);

CREATE TABLE companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  legal_name text NOT NULL,
  pan char(10) NOT NULL,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id)
);

CREATE TABLE gst_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  gstin char(15) NOT NULL,
  state_code char(2) NOT NULL,
  state_name text NOT NULL,
  filing_scheme filing_scheme NOT NULL DEFAULT 'monthly',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, gstin),
  UNIQUE (tenant_id, id)
);

-- Helper used by checks and policies.
CREATE OR REPLACE FUNCTION pan_from_gstin(gstin text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$ SELECT substring($1 from 3 for 10); $$;

ALTER TABLE gst_registrations
  DROP CONSTRAINT IF EXISTS gst_registrations_gstin_check;

ALTER TABLE gst_registrations
  ADD CONSTRAINT gst_registrations_gstin_pan_format
  CHECK (length(gstin) = 15);

CREATE TABLE user_company_access (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  access access_level NOT NULL DEFAULT 'read',
  granted_by uuid REFERENCES users(id),
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id, company_id)
);

CREATE TABLE temporary_onboarding_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  temp_user_id text NOT NULL,
  temp_password_hash text NOT NULL,
  is_used boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE return_workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  gst_registration_id uuid NOT NULL REFERENCES gst_registrations(id) ON DELETE CASCADE,
  return_type text NOT NULL,
  period text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
  id bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES users(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE INDEX idx_companies_tenant ON companies(tenant_id);
CREATE INDEX idx_access_user ON user_company_access(tenant_id, user_id);
CREATE INDEX idx_returns_scope ON return_workspaces(tenant_id, company_id, gst_registration_id, period);

ALTER TABLE gst_registrations
  ADD CONSTRAINT fk_gst_company_same_tenant
  FOREIGN KEY (tenant_id, company_id) REFERENCES companies(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE user_company_access
  ADD CONSTRAINT fk_access_user_same_tenant
  FOREIGN KEY (tenant_id, user_id) REFERENCES users(tenant_id, id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_access_company_same_tenant
  FOREIGN KEY (tenant_id, company_id) REFERENCES companies(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE return_workspaces
  ADD CONSTRAINT fk_return_company_same_tenant
  FOREIGN KEY (tenant_id, company_id) REFERENCES companies(tenant_id, id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_return_gst_same_tenant
  FOREIGN KEY (tenant_id, gst_registration_id) REFERENCES gst_registrations(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE audit_logs
  ADD CONSTRAINT fk_audit_company_same_tenant
  FOREIGN KEY (tenant_id, company_id) REFERENCES companies(tenant_id, id) ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$ SELECT nullif(current_setting('app.current_tenant_id', true), '')::uuid; $$;

CREATE OR REPLACE FUNCTION current_app_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$ SELECT nullif(current_setting('app.current_user_id', true), '')::uuid; $$;

CREATE OR REPLACE FUNCTION can_access_company(company_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM user_company_access uca
    WHERE uca.tenant_id = current_tenant_id()
      AND uca.user_id = current_app_user_id()
      AND uca.company_id = company_uuid
  );
$$;

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE gst_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_company_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE return_workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_self ON tenants
  USING (id = current_tenant_id());

CREATE POLICY users_same_tenant ON users
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY companies_by_access ON companies
  USING (tenant_id = current_tenant_id() AND can_access_company(id))
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY gst_by_company_access ON gst_registrations
  USING (tenant_id = current_tenant_id() AND can_access_company(company_id))
  WITH CHECK (tenant_id = current_tenant_id() AND can_access_company(company_id));

CREATE POLICY access_rows_for_user ON user_company_access
  USING (tenant_id = current_tenant_id() AND user_id = current_app_user_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY returns_by_company_access ON return_workspaces
  USING (tenant_id = current_tenant_id() AND can_access_company(company_id))
  WITH CHECK (tenant_id = current_tenant_id() AND can_access_company(company_id));

CREATE POLICY audit_by_company_access ON audit_logs
  USING (
    tenant_id = current_tenant_id()
    AND (company_id IS NULL OR can_access_company(company_id))
  )
  WITH CHECK (
    tenant_id = current_tenant_id()
    AND (company_id IS NULL OR can_access_company(company_id))
  );

-- Demo temporary onboarding credential: user id "new", password "new123".
INSERT INTO temporary_onboarding_credentials (temp_user_id, temp_password_hash)
VALUES ('new', crypt('new123', gen_salt('bf')))
ON CONFLICT DO NOTHING;
