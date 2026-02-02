/**
 * Claw/OpenClaw client detection
 * Sets req.isClawClient when request comes from ClawHub/OpenClaw so credit markup (20%) can be applied.
 */
import type { Request, Response, NextFunction } from 'express';

const CLAW_HEADERS = ['x-client', 'x-origin'];
const CLAW_VALUES = ['clawhub', 'openclaw', 'claw'];
const CLAW_UA_SUBSTRINGS = ['clawhub', 'openclaw', 'claw/'];

export interface ClawAwareRequest extends Request {
  isClawClient?: boolean;
}

/**
 * Detect Claw/OpenClaw client from headers or User-Agent.
 * Sets req.isClawClient = true when X-Client, X-Origin, or User-Agent indicates Claw.
 */
export function detectClawClient(req: Request, _res: Response, next: NextFunction): void {
  const r = req as ClawAwareRequest;
  r.isClawClient = false;

  for (const h of CLAW_HEADERS) {
    const val = req.headers[h]?.toString()?.toLowerCase().trim();
    if (val && CLAW_VALUES.some((v) => val === v || val.startsWith(v + '/'))) {
      r.isClawClient = true;
      break;
    }
  }
  if (!r.isClawClient) {
    const ua = req.headers['user-agent']?.toLowerCase() ?? '';
    if (CLAW_UA_SUBSTRINGS.some((s) => ua.includes(s))) {
      r.isClawClient = true;
    }
  }
  next();
}
