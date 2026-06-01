import { Router } from 'express';
import { withTenant } from '../db';
import { requireAuth } from '../middleware/auth';
import { wrap } from '../middleware/async';
import { computeGstr3b, buildGstr3bJson } from '../services/gstr3b/compute';
import { ParsedRecord } from '../types';

export const gstr3bRouter = Router();
const ctx = (req: any) => ({ tenantId: req.user.tenantId, userId: req.user.userId });
const normPeriod = (p: any) => String(p ?? '').replace(/\D/g, '').padStart(6, '0').slice(0, 6);

// ── Auto-compute GSTR-3B from the period's GSTR-1 data ──
gstr3bRouter.post('/compute', requireAuth, wrap(async (req, res) => {
  const { registrationId } = req.body ?? {};
  const period = normPeriod(req.body?.period);
  if (!registrationId || !period) return res.status(400).json({ error: 'registrationId and period are required' });

  const result = await withTenant(ctx(req), async (client) => {
    const reg = (await client.query(
      `SELECT id, gstin FROM gst_registrations WHERE id = $1`, [registrationId]
    )).rows[0];
    if (!reg) throw Object.assign(new Error('Registration not found'), { status: 404 });

    // Most-recent books dataset for the period.
    const ds = (await client.query(
      `SELECT id FROM gstr1_datasets
        WHERE gst_registration_id = $1 AND period = $2
        ORDER BY (source = 'books') DESC, created_at DESC LIMIT 1`,
      [registrationId, period]
    )).rows[0];
    if (!ds) return { reg, hasData: false } as const;

    const recs = await client.query(
      `SELECT section, row_no, data, errors, is_valid FROM gstr1_records WHERE dataset_id = $1`, [ds.id]
    );
    const records: ParsedRecord[] = recs.rows.map((r: any) => ({ section: r.section, rowNo: r.row_no, data: r.data, errors: r.errors, isValid: r.is_valid }));
    return { reg, hasData: true, records, datasetId: ds.id } as const;
  });

  if (!result.hasData) {
    return res.json({ hasData: false, message: 'No GSTR-1 data uploaded for this period yet. Prepare GSTR-1 first.' });
  }
  const summary = computeGstr3b(result.records!, { gstin: result.reg.gstin, period });
  res.json({ hasData: true, datasetId: result.datasetId, summary, gstr3bJson: buildGstr3bJson(summary) });
}));
