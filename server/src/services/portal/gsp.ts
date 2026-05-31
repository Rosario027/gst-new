import { PortalClient, PortalSaveResult } from './client';
import { config } from '../../config';

/**
 * GSP-backed client (placeholder).
 *
 * Fill in the real request/response handling once the GSP (GST Suvidha
 * Provider) credentials and endpoints are provided. The GSTN GSTR-1 "save"
 * API typically requires: app auth token, an AES session key, and an
 * RSA-encrypted + base64 payload. This class isolates all of that so the
 * rest of the app only ever sees a PortalClient.
 *
 * Wire-up checklist (when GSP details arrive):
 *  1. Auth: obtain auth-token / sek using GSP_CLIENT_ID + GSP_CLIENT_SECRET.
 *  2. Encrypt the gstr1Json payload with the session key.
 *  3. POST to `${GSP_BASE_URL}/standard/gstr1/save` with action=RETSAVE.
 *  4. Parse the reference id, then poll the return-status endpoint.
 */
export class GspPortalClient implements PortalClient {
  constructor(private readonly opts = config.gsp) {}

  private ensureConfigured(): void {
    if (!this.opts.baseUrl || !this.opts.clientId) {
      throw new Error('GSP not configured (set GSP_BASE_URL, GSP_CLIENT_ID, GSP_CLIENT_SECRET).');
    }
  }

  async saveGstr1(gstin: string, period: string, gstr1Json: Record<string, any>): Promise<PortalSaveResult> {
    this.ensureConfigured();
    // TODO: implement real GSP auth + encryption + POST.
    // const res = await fetch(`${this.opts.baseUrl}/standard/gstr1/save`, { ... });
    void gstr1Json;
    throw new Error(`GSP push not yet implemented for ${gstin} ${period}. Provide GSP integration details.`);
  }

  async getReturnStatus(_gstin: string, _period: string, _reference: string): Promise<PortalSaveResult> {
    this.ensureConfigured();
    throw new Error('GSP status polling not yet implemented.');
  }
}
