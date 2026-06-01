import { Router } from 'express';
import multer from 'multer';
import { PoolClient } from 'pg';
import { withTenant } from '../db';
import { requireAuth } from '../middleware/auth';
import { wrap } from '../middleware/async';
import { buildTemplateWorkbook } from '../services/gstr1/template';
import { buildFlatTemplate, parseFlatWorkbook } from '../services/gstr1/flat-format';
import { buildReconReport } from '../services/gstr1/recon-report';
import { parseWorkbook, parseCsv, summarizeRecords } from '../services/gstr1/parser';
import { reconcile } from '../services/gstr1/reconcile';
import { validateDataset } from '../services/gstr1/validate';
import { buildValidationReport } from '../services/gstr1/validation-report';
import { buildGstr1Json } from '../services/gstr1/json-builder';
import { SECTIONS } from '../services/gstr1/sections';
import { getPortalClient } from '../services/portal';
import { ParsedRecord } from '../types';

export const gstr1Router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

const ctx = (req: any) => ({ tenantId: req.user.tenantId, userId: req.user.userId });
const normPeriod = (p: any) => String(p ?? '').replace(/\D/g, '').padStart(6, '0').slice(0, 6);

async function loadRegistration(client: PoolClient, registrationId: string) {
  const r = await client.query(
    `SELECT id, company_id, gstin, state_code, delivery_mode FROM gst_registrations WHERE id = $1`,
    [registrationId]
  );
  return r.rows[0];
}

// ── Section metadata (drives dynamic UI) ──
gstr1Router.get('/sections', requireAuth, (_req, res) => {
  res.json({
    sections: SECTIONS.map((s) => ({
      key: s.key, sheet: s.sheet, label: s.label, table: s.table, hasTax: s.hasTax,
      columns: s.columns.map((c) => ({ key: c.key, header: c.header, type: c.type, required: !!c.required, note: c.note })),
    })),
  });
});

// ── Download the upload template ──
gstr1Router.get('/template', requireAuth, wrap(async (req, res) => {
  // Flat single-sheet template by default; ?format=sections for the legacy multi-sheet layout.
  const period = normPeriod(req.query.period) || undefined;
  const gstin = req.query.gstin as string;
  const buf = req.query.format === 'sections'
    ? await buildTemplateWorkbook({ gstin, period })
    : await buildFlatTemplate({ gstin, period });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="GSTR1-Template-${period || 'blank'}.xlsx"`);
  res.send(buf);
}));

// ── Upload a dataset (books / e-invoice / portal) ──
gstr1Router.post('/datasets', requireAuth, upload.single('file'), async (req, res) => {
  const { registrationId, source = 'books', section } = req.body ?? {};
  const period = normPeriod(req.body?.period);
  if (!registrationId || !period || !req.file) {
    return res.status(400).json({ error: 'registrationId, period and file are required' });
  }

  const isCsv = /\.csv$/i.test(req.file.originalname) || req.file.mimetype.includes('csv');
  let parsed: { records: any[]; summary: any; warnings: string[] };
  if (isCsv) {
    parsed = await parseCsv(req.file.buffer, section);
  } else {
    // Prefer the flat single-sheet format; fall back to the legacy multi-sheet layout.
    const flat = await parseFlatWorkbook(req.file.buffer);
    if (flat) {
      parsed = { records: flat.records, summary: summarizeRecords(flat.records), warnings: flat.warnings };
    } else {
      parsed = await parseWorkbook(req.file.buffer);
    }
  }

  try {
    const result = await withTenant(ctx(req), async (client) => {
      const reg = await loadRegistration(client, registrationId);
      if (!reg) throw Object.assign(new Error('Registration not found or access denied'), { status: 404 });

      // Validate with supplier context so inter/intra (IGST vs CGST+SGST) rules apply.
      const { records, validation } = validateDataset(parsed.records, {
        supplierGstin: reg.gstin,
        supplierStateCode: reg.state_code,
        period,
      });
      const summary = { ...parsed.summary, validRecords: validation.totals.validRows, errorRecords: validation.totals.errorRows };

      const ds = await client.query(
        `INSERT INTO gstr1_datasets (tenant_id, company_id, gst_registration_id, period, source, original_filename, status, summary, validation, uploaded_by)
         VALUES (current_tenant_id(), $1, $2, $3, $4, $5, $6, $7, $8, current_app_user_id())
         RETURNING id, created_at`,
        [reg.company_id, registrationId, period, source, req.file!.originalname,
         validation.status === 'errors' ? 'errors' : 'validated', summary, validation]
      );
      const datasetId = ds.rows[0].id;

      for (const rec of records) {
        await client.query(
          `INSERT INTO gstr1_records (tenant_id, dataset_id, section, row_no, data, errors, is_valid)
           VALUES (current_tenant_id(), $1, $2, $3, $4, $5, $6)`,
          [datasetId, rec.section, rec.rowNo, rec.data, JSON.stringify(rec.errors), rec.isValid]
        );
      }

      await client.query(
        `INSERT INTO audit_logs (tenant_id, company_id, actor_user_id, action, entity_type, entity_id, details)
         VALUES (current_tenant_id(), $1, current_app_user_id(), 'gstr1.dataset.upload', 'gstr1_dataset', $2, $3)`,
        [reg.company_id, datasetId, { period, source, records: records.length, status: validation.status }]
      );

      return { datasetId, createdAt: ds.rows[0].created_at, summary, validation, records };
    });

    res.json({
      datasetId: result.datasetId,
      createdAt: result.createdAt,
      summary: result.summary,
      validation: result.validation,
      warnings: parsed.warnings,
      records: result.records,
    });
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: err.message });
  }
});

// ── Reset: wipe all GSTR-1 working data for a registration + period ──
gstr1Router.post('/reset', requireAuth, wrap(async (req, res) => {
  const { registrationId } = req.body ?? {};
  const period = req.body?.period ? normPeriod(req.body.period) : null;
  if (!registrationId) return res.status(400).json({ error: 'registrationId is required' });

  const result = await withTenant(ctx(req), async (client) => {
    const reg = await loadRegistration(client, registrationId);
    if (!reg) throw Object.assign(new Error('Registration not found'), { status: 404 });
    const scope = period ? 'AND period = $2' : '';
    const params = period ? [registrationId, period] : [registrationId];
    // Filings + reconciliations + datasets (records/recon_lines cascade via FKs).
    const f = await client.query(`DELETE FROM gstr1_filings WHERE gst_registration_id = $1 ${scope}`, params);
    const r = await client.query(`DELETE FROM gstr1_reconciliations WHERE gst_registration_id = $1 ${scope}`, params);
    const d = await client.query(`DELETE FROM gstr1_datasets WHERE gst_registration_id = $1 ${scope}`, params);
    await client.query(
      `INSERT INTO audit_logs (tenant_id, company_id, actor_user_id, action, entity_type, entity_id, details)
       VALUES (current_tenant_id(), $1, current_app_user_id(), 'gstr1.reset', 'gst_registration', $2, $3)`,
      [reg.company_id, registrationId, { period, datasets: d.rowCount, reconciliations: r.rowCount, filings: f.rowCount }]
    );
    return { datasets: d.rowCount, reconciliations: r.rowCount, filings: f.rowCount };
  });
  res.json({ ok: true, ...result });
}));

// ── List datasets ──
gstr1Router.get('/datasets', requireAuth, wrap(async (req, res) => {
  const { registrationId, period } = req.query;
  const rows = await withTenant(ctx(req), (c) =>
    c.query(
      `SELECT id, period, source, original_filename, status, summary, created_at
         FROM gstr1_datasets
        WHERE ($1::uuid IS NULL OR gst_registration_id = $1)
          AND ($2::text IS NULL OR period = $2)
        ORDER BY created_at DESC`,
      [registrationId || null, period ? normPeriod(period) : null]
    ).then((r) => r.rows)
  );
  res.json({ datasets: rows });
}));

// ── Get one dataset + its records ──
gstr1Router.get('/datasets/:id', requireAuth, wrap(async (req, res) => {
  const data = await withTenant(ctx(req), async (c) => {
    const ds = await c.query(`SELECT * FROM gstr1_datasets WHERE id = $1`, [req.params.id]);
    if (!ds.rows[0]) return null;
    const recs = await c.query(
      `SELECT section, row_no, data, errors, is_valid FROM gstr1_records WHERE dataset_id = $1 ORDER BY section, row_no`,
      [req.params.id]
    );
    return { dataset: ds.rows[0], records: recs.rows };
  });
  if (!data) return res.status(404).json({ error: 'Dataset not found' });
  res.json(data);
}));

// ── Download the validation report (Excel) for a dataset ──
gstr1Router.get('/datasets/:id/validation-report', requireAuth, wrap(async (req, res) => {
  const data = await withTenant(ctx(req), async (c) => {
    const ds = await c.query(
      `SELECT d.period, d.original_filename, d.validation, g.gstin
         FROM gstr1_datasets d JOIN gst_registrations g ON g.id = d.gst_registration_id
        WHERE d.id = $1`,
      [req.params.id]
    );
    if (!ds.rows[0]) return null;
    const recs = await c.query(
      `SELECT section, row_no, data, errors, is_valid FROM gstr1_records WHERE dataset_id = $1 ORDER BY section, row_no`,
      [req.params.id]
    );
    return { ds: ds.rows[0], recs: recs.rows };
  });
  if (!data) return res.status(404).json({ error: 'Dataset not found' });

  const records = data.recs.map((r: any) => ({ section: r.section, rowNo: r.row_no, data: r.data, errors: r.errors, isValid: r.is_valid }));
  const buf = await buildValidationReport({
    gstin: data.ds.gstin, period: data.ds.period, filename: data.ds.original_filename,
    records, validation: data.ds.validation,
  });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="GSTR1-validation-${data.ds.period}.xlsx"`);
  res.send(buf);
}));

// ── Reconcile two datasets (books vs compare) ──
gstr1Router.post('/reconcile', requireAuth, async (req, res) => {
  const { baseDatasetId, compareDatasetId } = req.body ?? {};
  if (!baseDatasetId) return res.status(400).json({ error: 'baseDatasetId is required' });

  try {
    const result = await withTenant(ctx(req), async (client) => {
      const base = await loadRecords(client, baseDatasetId);
      if (!base) throw Object.assign(new Error('Base dataset not found'), { status: 404 });
      const compare = compareDatasetId ? await loadRecords(client, compareDatasetId) : null;

      const recon = reconcile(base.records, compare?.records ?? []);

      const ins = await client.query(
        `INSERT INTO gstr1_reconciliations (tenant_id, company_id, gst_registration_id, period, base_dataset_id, compare_dataset_id, summary, created_by)
         VALUES (current_tenant_id(), $1, $2, $3, $4, $5, $6, current_app_user_id())
         RETURNING id, created_at`,
        [base.meta.company_id, base.meta.gst_registration_id, base.meta.period, baseDatasetId, compareDatasetId || null, recon.summary]
      );
      const reconId = ins.rows[0].id;

      for (const line of recon.lines) {
        await client.query(
          `INSERT INTO gstr1_recon_lines (tenant_id, reconciliation_id, section, match_key, status, base, compare, diff)
           VALUES (current_tenant_id(), $1, $2, $3, $4, $5, $6, $7)`,
          [reconId, line.section, line.matchKey, line.status, line.base, line.compare, JSON.stringify(line.diff)]
        );
      }
      await client.query(`UPDATE gstr1_datasets SET status = 'reconciled' WHERE id = $1`, [baseDatasetId]);
      return { reconciliationId: reconId, createdAt: ins.rows[0].created_at, summary: recon.summary, lines: recon.lines };
    });
    res.json(result);
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: err.message });
  }
});

gstr1Router.get('/reconciliations/:id', requireAuth, wrap(async (req, res) => {
  const data = await withTenant(ctx(req), async (c) => {
    const r = await c.query(`SELECT * FROM gstr1_reconciliations WHERE id = $1`, [req.params.id]);
    if (!r.rows[0]) return null;
    const lines = await c.query(`SELECT section, match_key, status, base, compare, diff FROM gstr1_recon_lines WHERE reconciliation_id = $1`, [req.params.id]);
    return { reconciliation: r.rows[0], lines: lines.rows };
  });
  if (!data) return res.status(404).json({ error: 'Reconciliation not found' });
  res.json(data);
}));

// ── Download the reconciliation report as an Excel output file ──
gstr1Router.get('/reconciliations/:id/report', requireAuth, wrap(async (req, res) => {
  const data = await withTenant(ctx(req), async (c) => {
    const r = await c.query(
      `SELECT rec.period, rec.summary, g.gstin
         FROM gstr1_reconciliations rec
         JOIN gst_registrations g ON g.id = rec.gst_registration_id
        WHERE rec.id = $1`,
      [req.params.id]
    );
    if (!r.rows[0]) return null;
    const lines = await c.query(
      `SELECT section, match_key, status, base, compare, diff FROM gstr1_recon_lines WHERE reconciliation_id = $1`,
      [req.params.id]
    );
    return { recon: r.rows[0], lines: lines.rows };
  });
  if (!data) return res.status(404).json({ error: 'Reconciliation not found' });

  const lines = data.lines.map((l: any) => ({
    section: l.section, matchKey: l.match_key, status: l.status, base: l.base, compare: l.compare, diff: l.diff,
  }));
  const buf = await buildReconReport({ gstin: data.recon.gstin, period: data.recon.period, lines, summary: data.recon.summary });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="GSTR1-reconciliation-${data.recon.period}.xlsx"`);
  res.send(buf);
}));

// ── Generate GSTR-1 portal JSON from a dataset ──
gstr1Router.post('/generate', requireAuth, async (req, res) => {
  const { datasetId } = req.body ?? {};
  if (!datasetId) return res.status(400).json({ error: 'datasetId is required' });

  try {
    const result = await withTenant(ctx(req), async (client) => {
      const loaded = await loadRecords(client, datasetId);
      if (!loaded) throw Object.assign(new Error('Dataset not found'), { status: 404 });
      const reg = await loadRegistration(client, loaded.meta.gst_registration_id);

      const json = buildGstr1Json(loaded.records, { gstin: reg.gstin, period: loaded.meta.period });

      const ins = await client.query(
        `INSERT INTO gstr1_filings (tenant_id, company_id, gst_registration_id, period, dataset_id, gstr1_json, delivery_mode, portal_status, created_by)
         VALUES (current_tenant_id(), $1, $2, $3, $4, $5, $6, 'generated', current_app_user_id())
         RETURNING id, created_at`,
        [reg.company_id, reg.id, loaded.meta.period, datasetId, json, reg.delivery_mode]
      );
      await client.query(`UPDATE gstr1_datasets SET status = 'json_generated' WHERE id = $1`, [datasetId]);
      return { filingId: ins.rows[0].id, createdAt: ins.rows[0].created_at, deliveryMode: reg.delivery_mode, gstr1Json: json };
    });
    res.json(result);
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: err.message });
  }
});

// ── Download generated JSON file ──
gstr1Router.get('/filings/:id/json', requireAuth, wrap(async (req, res) => {
  const row = await withTenant(ctx(req), (c) =>
    c.query(`SELECT gstr1_json, period FROM gstr1_filings WHERE id = $1`, [req.params.id]).then((r) => r.rows[0])
  );
  if (!row) return res.status(404).json({ error: 'Filing not found' });
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="GSTR1-${row.period}.json"`);
  res.send(JSON.stringify(row.gstr1_json, null, 2));
}));

// ── Push to portal (delivery-mode aware) ──
gstr1Router.post('/filings/:id/push', requireAuth, async (req, res) => {
  try {
    const result = await withTenant(ctx(req), async (client) => {
      const f = await client.query(
        `SELECT f.*, g.gstin FROM gstr1_filings f JOIN gst_registrations g ON g.id = f.gst_registration_id WHERE f.id = $1`,
        [req.params.id]
      );
      const filing = f.rows[0];
      if (!filing) throw Object.assign(new Error('Filing not found'), { status: 404 });

      const portal = getPortalClient(filing.delivery_mode);
      const pushRes = await portal.saveGstr1(filing.gstin, filing.period, filing.gstr1_json);

      await client.query(
        `UPDATE gstr1_filings SET portal_status = $2, portal_reference = $3, portal_response = $4 WHERE id = $1`,
        [filing.id, pushRes.status, pushRes.reference ?? null, JSON.stringify(pushRes)]
      );
      return pushRes;
    });
    res.json(result);
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: err.message });
  }
});

// ── helper: load a dataset's records as ParsedRecord[] + meta ──
async function loadRecords(client: PoolClient, datasetId: string): Promise<{ meta: any; records: ParsedRecord[] } | null> {
  const ds = await client.query(
    `SELECT id, company_id, gst_registration_id, period FROM gstr1_datasets WHERE id = $1`,
    [datasetId]
  );
  if (!ds.rows[0]) return null;
  const recs = await client.query(
    `SELECT section, row_no, data, errors, is_valid FROM gstr1_records WHERE dataset_id = $1`,
    [datasetId]
  );
  const records: ParsedRecord[] = recs.rows.map((r: any) => ({
    section: r.section, rowNo: r.row_no, data: r.data, errors: r.errors, isValid: r.is_valid,
  }));
  return { meta: ds.rows[0], records };
}
