import type { Finding } from "../types/models.js";

/**
 * Trusting a sender is a usability signal, not a security bypass: a
 * legitimate contact's account can be compromised and later send a
 * malicious link or attachment. So this only suppresses the Add-on's own
 * *low-confidence* sender-identity noise (severity "info" or "low", e.g. "no
 * authentication headers were available" or a minor Return-Path mismatch).
 * Every medium/high/critical finding - including all link, content, and
 * attachment findings - passes through completely untouched regardless of
 * trust status.
 */
export function applyTrustedSenderAdjustment(
  findings: Finding[],
  isTrustedSender: boolean
): Finding[] {
  if (!isTrustedSender) return findings;

  return findings.filter((finding) => {
    const isLowConfidenceSenderNoise =
      finding.category === "sender" && (finding.severity === "info" || finding.severity === "low");
    return !isLowConfidenceSenderNoise;
  });
}
