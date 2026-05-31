// Portal delivery abstraction.
// Two modes per gst_registration.delivery_mode:
//   'json' -> JSON file download only (no push); the app returns the file.
//   'api'  -> push to GSTN via a GSP (GST Suvidha Provider).
// Swap the concrete implementation in index.ts via getPortalClient().

export interface PortalSaveResult {
  status: 'pushed' | 'accepted' | 'error' | 'generated';
  reference?: string;
  raw?: any;
  message?: string;
}

export interface PortalClient {
  /** Save (upload) the GSTR-1 JSON to the portal for a return period. */
  saveGstr1(gstin: string, period: string, gstr1Json: Record<string, any>): Promise<PortalSaveResult>;
  /** Poll the processing/return status. */
  getReturnStatus(gstin: string, period: string, reference: string): Promise<PortalSaveResult>;
}
