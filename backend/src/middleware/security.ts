import type { NextFunction, Request, Response } from "express";

/**
 * Minimal, dependency-free security headers appropriate for a JSON-only API
 * that is never rendered as HTML and never embeds third-party content.
 */
export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Content-Security-Policy", "default-src 'none'");
  res.removeHeader("X-Powered-By");
  next();
}
