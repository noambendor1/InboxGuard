import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export interface RequestContext {
  requestId: string;
  startedAt: number;
}

declare module "express-serve-static-core" {
  interface Request {
    context?: RequestContext;
  }
}

/**
 * Attaches a request ID and start time for operational logging only.
 * Per the privacy requirements, logs in this project never include email
 * body/subject/sender/links/attachment names - only metadata like this.
 */
export function requestContext(req: Request, _res: Response, next: NextFunction): void {
  req.context = {
    requestId: crypto.randomUUID(),
    startedAt: Date.now()
  };
  next();
}
