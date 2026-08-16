import type { NextFunction, Request, Response } from "express";

/**
 * Catches anything that reaches Express's error path and returns a generic,
 * user-safe message. Raw stack traces and error internals are never sent to
 * the client - they would leak implementation details and, per the
 * "never render email content" rule, could in theory echo back untrusted
 * input in an error message.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const requestId = req.context?.requestId ?? "unknown";
  console.error(
    JSON.stringify({
      requestId,
      event: "unhandled_error",
      message: err instanceof Error ? err.message : "unknown error"
    })
  );
  res.status(500).json({
    error: "internal_error",
    message: "Something went wrong while analyzing this email. Please try again.",
    requestId
  });
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: "not_found", message: "Not found." });
}
