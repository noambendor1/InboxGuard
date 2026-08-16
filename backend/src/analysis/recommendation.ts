import type { Finding, RiskLevel } from "../types/models.js";

/**
 * Picks one specific, actionable top-level recommendation. Priority order
 * reflects potential harm: a confirmed dangerous link or credential request
 * can cause immediate damage, so those recommendations win over softer
 * "verify the sender" advice when several finding types are present.
 */
const PRIORITY_ORDER = [
  "link.safe-browsing-match",
  "content.credential",
  "attachment.double-extension",
  "attachment.dangerous-extension",
  "link.text-mismatch",
  "sender.display-name-impersonation",
  "sender.dmarc-fail",
  "content.payment",
  "content.threat"
];

export function pickRecommendedAction(findings: Finding[], riskLevel: RiskLevel): string {
  for (const prefix of PRIORITY_ORDER) {
    const match = findings.find((f) => f.id.startsWith(prefix));
    if (match) return match.recommendedAction;
  }

  if (findings.length > 0) {
    return findings[0]?.recommendedAction ?? defaultRecommendation(riskLevel);
  }

  return defaultRecommendation(riskLevel);
}

function defaultRecommendation(riskLevel: RiskLevel): string {
  switch (riskLevel) {
    case "HIGH_RISK":
      return "Do not click links or open attachments in this email. Verify the sender independently before taking any action.";
    case "SUSPICIOUS":
      return "Proceed with caution. Verify the sender using a trusted contact method before acting on this email.";
    case "LOW_RISK":
    default:
      return "No specific action is required, but always stay alert for anything that looks unusual.";
  }
}

export function buildSummary(riskLevel: RiskLevel, wasTrustedSender: boolean): string {
  switch (riskLevel) {
    case "HIGH_RISK":
      return wasTrustedSender
        ? "You previously trusted this sender, but this message contains strong security risks."
        : "This email shows strong signs of phishing.";
    case "SUSPICIOUS":
      return "This email has some signals worth a closer look before you act on it.";
    case "LOW_RISK":
    default:
      return "No strong suspicious signals were detected.";
  }
}
