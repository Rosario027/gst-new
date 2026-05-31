import { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Wrap an async route handler so rejected promises are forwarded to Express's
 * error middleware instead of crashing the process (Express 4 does not catch
 * async rejections automatically).
 */
export function wrap(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>): RequestHandler {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}
