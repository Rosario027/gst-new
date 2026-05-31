import { PortalClient, PortalSaveResult } from './client';

/**
 * Stub GSP client — used when a registration is in JSON-only mode or no GSP is
 * configured. It does not contact GSTN; it returns a deterministic local
 * reference so the rest of the flow (status, audit) works end-to-end.
 */
export class StubPortalClient implements PortalClient {
  async saveGstr1(gstin: string, period: string, _json: Record<string, any>): Promise<PortalSaveResult> {
    return {
      status: 'generated',
      reference: `LOCAL-${gstin}-${period}`,
      message: 'JSON generated locally. Upload manually on the GST portal, or enable API delivery for this GSTIN.',
    };
  }

  async getReturnStatus(_gstin: string, _period: string, reference: string): Promise<PortalSaveResult> {
    return { status: 'generated', reference, message: 'No portal connection (stub).' };
  }
}
