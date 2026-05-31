-- ════════════════════════════════════════════════════════════════════
-- FylePro GST — full database schema (PostgreSQL)
-- Idempotent: safe to run multiple times. Run with `npm run db:setup`.
--
-- Multi-tenant with row-level security. The application sets per request:
--   set_config('app.current_tenant_id', '<tenant uuid>', true)
--   set_config('app.current_user_id',   '<user uuid>',   true)
-- ════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE filing_scheme AS ENUM ('monthly', 'qrmp');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('company_admin', 'tax_manager', 'approver', 'reviewer', 'preparer', 'viewer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE access_level AS ENUM ('admin', 'write', 'review', 'read');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Core tenancy ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
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

CREATE TABLE IF NOT EXISTS companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  legal_name text NOT NULL,
  pan char(10) NOT NULL,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS gst_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  gstin char(15) NOT NULL,
  legal_name text,
  state_code char(2) NOT NULL,
  state_name text NOT NULL,
  filing_scheme filing_scheme NOT NULL DEFAULT 'monthly',
  -- 'json' = download portal JSON only; 'api' = push via GSP
  delivery_mode text NOT NULL DEFAULT 'json',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, gstin),
  UNIQUE (tenant_id, id)
);

CREATE OR REPLACE FUNCTION pan_from_gstin(gstin text)
RETURNS text LANGUAGE sql IMMUTABLE
AS $$ SELECT substring($1 from 3 for 10); $$;

ALTER TABLE gst_registrations DROP CONSTRAINT IF EXISTS gst_registrations_gstin_check;
ALTER TABLE gst_registrations DROP CONSTRAINT IF EXISTS gst_registrations_gstin_pan_format;
ALTER TABLE gst_registrations
  ADD CONSTRAINT gst_registrations_gstin_pan_format CHECK (length(gstin) = 15);

CREATE TABLE IF NOT EXISTS user_company_access (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  access access_level NOT NULL DEFAULT 'read',
  granted_by uuid REFERENCES users(id),
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id, company_id)
);

CREATE TABLE IF NOT EXISTS temporary_onboarding_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  temp_user_id text NOT NULL,
  temp_password_hash text NOT NULL,
  is_used boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
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

-- ── GSTR-1 reconciliation pipeline ──────────────────────────────────
-- A dataset is one uploaded/sourced set of outward-supply data for a period.
-- source: 'books' (user upload), 'einvoice' (IRN), 'portal' (GSTN saved data)
CREATE TABLE IF NOT EXISTS gstr1_datasets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  gst_registration_id uuid NOT NULL REFERENCES gst_registrations(id) ON DELETE CASCADE,
  period char(6) NOT NULL,                 -- MMYYYY, e.g. 052026
  source text NOT NULL DEFAULT 'books',
  original_filename text,
  status text NOT NULL DEFAULT 'uploaded', -- uploaded|validated|reconciled|json_generated|filed
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  uploaded_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Normalized records parsed from a dataset, one row per source line, tagged by section.
CREATE TABLE IF NOT EXISTS gstr1_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  dataset_id uuid NOT NULL REFERENCES gstr1_datasets(id) ON DELETE CASCADE,
  section text NOT NULL,                    -- b2b|b2cl|b2cs|cdnr|cdnur|exp|nil|hsn|docs|at|atadj
  row_no int NOT NULL,
  data jsonb NOT NULL,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_valid boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS gstr1_reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  gst_registration_id uuid NOT NULL REFERENCES gst_registrations(id) ON DELETE CASCADE,
  period char(6) NOT NULL,
  base_dataset_id uuid NOT NULL REFERENCES gstr1_datasets(id) ON DELETE CASCADE,
  compare_dataset_id uuid REFERENCES gstr1_datasets(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'completed',
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gstr1_recon_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  reconciliation_id uuid NOT NULL REFERENCES gstr1_reconciliations(id) ON DELETE CASCADE,
  section text NOT NULL,
  match_key text NOT NULL,
  status text NOT NULL,                     -- matched|mismatch|only_in_books|only_in_compare
  base jsonb,
  compare jsonb,
  diff jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS gstr1_filings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  gst_registration_id uuid NOT NULL REFERENCES gst_registrations(id) ON DELETE CASCADE,
  period char(6) NOT NULL,
  dataset_id uuid REFERENCES gstr1_datasets(id) ON DELETE SET NULL,
  gstr1_json jsonb NOT NULL,
  delivery_mode text NOT NULL DEFAULT 'json',
  portal_status text NOT NULL DEFAULT 'generated', -- generated|pushed|accepted|error
  portal_reference text,
  portal_response jsonb,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── Indexes ─────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_companies_tenant ON companies(tenant_id);
CREATE INDEX IF NOT EXISTS idx_access_user ON user_company_access(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_gstr1_datasets_scope ON gstr1_datasets(tenant_id, gst_registration_id, period);
CREATE INDEX IF NOT EXISTS idx_gstr1_records_dataset ON gstr1_records(dataset_id, section);
CREATE INDEX IF NOT EXISTS idx_gstr1_recon_lines_recon ON gstr1_recon_lines(reconciliation_id, status);
CREATE INDEX IF NOT EXISTS idx_gstr1_filings_scope ON gstr1_filings(tenant_id, gst_registration_id, period);

-- ── Composite-tenant FKs ────────────────────────────────────────────
ALTER TABLE gst_registrations DROP CONSTRAINT IF EXISTS fk_gst_company_same_tenant;
ALTER TABLE gst_registrations
  ADD CONSTRAINT fk_gst_company_same_tenant
  FOREIGN KEY (tenant_id, company_id) REFERENCES companies(tenant_id, id) ON DELETE CASCADE;

-- ── Helper functions ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION current_tenant_id()
RETURNS uuid LANGUAGE sql STABLE
AS $$ SELECT nullif(current_setting('app.current_tenant_id', true), '')::uuid; $$;

CREATE OR REPLACE FUNCTION current_app_user_id()
RETURNS uuid LANGUAGE sql STABLE
AS $$ SELECT nullif(current_setting('app.current_user_id', true), '')::uuid; $$;

CREATE OR REPLACE FUNCTION can_access_company(company_uuid uuid)
RETURNS boolean LANGUAGE sql STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_company_access uca
    WHERE uca.tenant_id = current_tenant_id()
      AND uca.user_id = current_app_user_id()
      AND uca.company_id = company_uuid
  );
$$;

-- ── Row-level security ──────────────────────────────────────────────
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE gst_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_company_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE gstr1_datasets ENABLE ROW LEVEL SECURITY;
ALTER TABLE gstr1_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE gstr1_reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE gstr1_recon_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE gstr1_filings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_self ON tenants;
CREATE POLICY tenant_self ON tenants USING (id = current_tenant_id());

DROP POLICY IF EXISTS users_same_tenant ON users;
CREATE POLICY users_same_tenant ON users
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

DROP POLICY IF EXISTS companies_by_access ON companies;
CREATE POLICY companies_by_access ON companies
  USING (tenant_id = current_tenant_id() AND can_access_company(id))
  WITH CHECK (tenant_id = current_tenant_id());

DROP POLICY IF EXISTS gst_by_company_access ON gst_registrations;
CREATE POLICY gst_by_company_access ON gst_registrations
  USING (tenant_id = current_tenant_id() AND can_access_company(company_id))
  WITH CHECK (tenant_id = current_tenant_id() AND can_access_company(company_id));

DROP POLICY IF EXISTS access_rows_for_user ON user_company_access;
CREATE POLICY access_rows_for_user ON user_company_access
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

DROP POLICY IF EXISTS audit_by_company_access ON audit_logs;
CREATE POLICY audit_by_company_access ON audit_logs
  USING (tenant_id = current_tenant_id() AND (company_id IS NULL OR can_access_company(company_id)))
  WITH CHECK (tenant_id = current_tenant_id() AND (company_id IS NULL OR can_access_company(company_id)));

DROP POLICY IF EXISTS gstr1_datasets_access ON gstr1_datasets;
CREATE POLICY gstr1_datasets_access ON gstr1_datasets
  USING (tenant_id = current_tenant_id() AND can_access_company(company_id))
  WITH CHECK (tenant_id = current_tenant_id() AND can_access_company(company_id));

DROP POLICY IF EXISTS gstr1_records_access ON gstr1_records;
CREATE POLICY gstr1_records_access ON gstr1_records
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

DROP POLICY IF EXISTS gstr1_recon_access ON gstr1_reconciliations;
CREATE POLICY gstr1_recon_access ON gstr1_reconciliations
  USING (tenant_id = current_tenant_id() AND can_access_company(company_id))
  WITH CHECK (tenant_id = current_tenant_id() AND can_access_company(company_id));

DROP POLICY IF EXISTS gstr1_recon_lines_access ON gstr1_recon_lines;
CREATE POLICY gstr1_recon_lines_access ON gstr1_recon_lines
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

DROP POLICY IF EXISTS gstr1_filings_access ON gstr1_filings;
CREATE POLICY gstr1_filings_access ON gstr1_filings
  USING (tenant_id = current_tenant_id() AND can_access_company(company_id))
  WITH CHECK (tenant_id = current_tenant_id() AND can_access_company(company_id));

-- ── Demo onboarding credential: id "new", password "new123" ─────────
INSERT INTO temporary_onboarding_credentials (temp_user_id, temp_password_hash)
SELECT 'new', crypt('new123', gen_salt('bf'))
WHERE NOT EXISTS (SELECT 1 FROM temporary_onboarding_credentials WHERE temp_user_id = 'new');
