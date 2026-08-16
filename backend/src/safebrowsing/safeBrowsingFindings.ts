import type { Finding } from "../types/models.js";

/**
 * A confirmed Safe Browsing match is treated as a strong, high-confidence
 * signal (it dominates the Links category on its own). A URL with no match
 * is NOT treated as "known safe" - it simply means Google has no record of
 * it, which is common for brand-new phishing infrastructure. That is why
 * this file only ever produces findings for positive matches; the absence
 * of a match never suppresses anything.
 */
export function buildSafeBrowsingFindings(maliciousUrls: Set<string>): Finding[] {
  return Array.from(maliciousUrls).map((url, index) => ({
    id: `link.safe-browsing-match.${index}`,
    category: "links",
    severity: "critical",
    scoreContribution: 30,
    userTitle: "A link in this email is known to be dangerous",
    userExplanation:
      "Google's threat intelligence service has flagged one of the links in this email as a known dangerous website.",
    technicalExplanation: `Google Safe Browsing returned a positive threat match for: ${url}`,
    recommendedAction:
      "Do not click the links in this email. Open the company's website directly instead."
  }));
}
