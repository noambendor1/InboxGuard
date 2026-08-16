import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";

/**
 * Pragmatic take-home/demo authentication between the Gmail Add-on and this
 * backend. The Add-on signs `timestamp + "." + rawRequestBody` with a shared
 * secret (HMAC-SHA256) and sends the timestamp and signature as headers.
 *
 * This is intentionally simple. A production system should prefer a
 * short-lived, service-to-service credential (e.g. a signed OIDC identity
 * token from Apps Script's `ScriptApp.getIdentityToken()` validated against
 * Google's public keys, or a Cloud Run "invoker" IAM binding) instead of a
 * long-lived static shared secret, and should add replay protection beyond a
 * timestamp window (e.g. a nonce cache). See docs/ARCHITECTURE_AND_DECISIONS.md.
 */

const TIMESTAMP_HEADER = "x-inboxguard-timestamp";
const SIGNATURE_HEADER = "x-inboxguard-signature";

export interface HmacAuthOptions {
  secret: string;
  maxRequestAgeSeconds: number;
}

function timingSafeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length || bufA.length === 0) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

export function createHmacAuthMiddleware(options: HmacAuthOptions) {
  return function hmacAuth(req: Request, res: Response, next: NextFunction): void {
    const timestampHeader = req.header(TIMESTAMP_HEADER);
    const signatureHeader = req.header(SIGNATURE_HEADER);
    const rawBody = (req as Request & { rawBody?: string }).rawBody ?? "";

    if (!timestampHeader || !signatureHeader) {
      res.status(401).json({ error: "unauthorized", message: "Missing signature headers." });
      return;
    }

    const timestamp = Number(timestampHeader);
    if (!Number.isFinite(timestamp)) {
      res.status(401).json({ error: "unauthorized", message: "Invalid timestamp." });
      return;
    }

    const ageSeconds = Math.abs(Date.now() / 1000 - timestamp);
    if (ageSeconds > options.maxRequestAgeSeconds) {
      res.status(401).json({ error: "unauthorized", message: "Request expired." });
      return;
    }

    if (!/^[0-9a-f]{64}$/i.test(signatureHeader)) {
      res.status(401).json({ error: "unauthorized", message: "Invalid signature." });
      return;
    }

    const expectedSignature = crypto
      .createHmac("sha256", options.secret)
      .update(`${timestampHeader}.${rawBody}`)
      .digest("hex");

    if (!timingSafeEqualHex(expectedSignature, signatureHeader)) {
      res.status(401).json({ error: "unauthorized", message: "Invalid signature." });
      return;
    }

    next();
  };
}
