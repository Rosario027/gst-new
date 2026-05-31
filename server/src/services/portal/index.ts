import { config } from '../../config';
import { PortalClient } from './client';
import { StubPortalClient } from './stub';
import { GspPortalClient } from './gsp';

let stub: StubPortalClient | null = null;
let gsp: GspPortalClient | null = null;

/**
 * Resolve the portal client for a registration's delivery mode.
 * 'api' uses the configured GSP (falls back to stub if provider is 'stub').
 */
export function getPortalClient(deliveryMode: string): PortalClient {
  if (deliveryMode === 'api' && config.gsp.provider !== 'stub') {
    return (gsp ??= new GspPortalClient());
  }
  return (stub ??= new StubPortalClient());
}

export * from './client';
