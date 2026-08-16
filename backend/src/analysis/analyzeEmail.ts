import { detectAttachmentSignals } from "./detectors/attachments.js";
import { detectContentSignals } from "./detectors/content.js";
import { detectLinkSignals } from "./detectors/links.js";
import { detectSenderIdentitySignals } from "./detectors/senderIdentity.js";
import { buildSummary, pickRecommendedAction } from "./recommendation.js";
import { lookupUrlsWithSafeBrowsing } from "../safebrowsing/safeBrowsingClient.js";
import { buildSafeBrowsingFindings } from "../safebrowsing/safeBrowsingFindings.js";
import { scoreFindings } from "../scoring/scoreEngine.js";
import { applyTrustedSenderAdjustment } from "../scoring/trustedSenderAdjustment.js";
import { scoreToRiskLevel } from "../scoring/riskLevel.js";
import type { AnalyzeInput, AnalyzeResult } from "../types/models.js";

export interface AnalyzeEmailDependencies {
  safeBrowsingApiKey: string | undefined;
}

export async function analyzeEmail(
  input: AnalyzeInput,
  deps: AnalyzeEmailDependencies
): Promise<AnalyzeResult> {
  const senderFindings = detectSenderIdentitySignals(input.sender, input.headers);
  const { findings: linkFindings, uniqueUrls } = detectLinkSignals(input.links);
  const contentFindings = detectContentSignals(input.bodyText, input.subject);
  const attachmentFindings = detectAttachmentSignals(input.attachments);

  const safeBrowsingResult = await lookupUrlsWithSafeBrowsing(uniqueUrls, deps.safeBrowsingApiKey);
  const safeBrowsingFindings = buildSafeBrowsingFindings(safeBrowsingResult.maliciousUrls);

  const allFindings = [
    ...senderFindings,
    ...linkFindings,
    ...safeBrowsingFindings,
    ...contentFindings,
    ...attachmentFindings
  ];

  const adjustedFindings = applyTrustedSenderAdjustment(allFindings, input.isTrustedSender);

  const { score, categoryBreakdown, sortedFindings } = scoreFindings(adjustedFindings);

  // A confirmed Google Safe Browsing match is a known-threat signal, not a
  // heuristic guess, so it always forces HIGH_RISK regardless of the
  // numeric total - and, crucially, regardless of trusted-sender status,
  // since applyTrustedSenderAdjustment never removes link findings.
  const hasConfirmedMaliciousLink = adjustedFindings.some((f) =>
    f.id.startsWith("link.safe-browsing-match")
  );
  const riskLevel = hasConfirmedMaliciousLink ? "HIGH_RISK" : scoreToRiskLevel(score);

  const recommendedAction = pickRecommendedAction(sortedFindings, riskLevel);
  const summary = buildSummary(riskLevel, input.isTrustedSender);

  const result: AnalyzeResult = {
    riskLevel,
    summary,
    recommendedAction,
    findings: sortedFindings,
    meta: {
      urlsAnalyzed: uniqueUrls.length,
      attachmentsAnalyzed: input.attachments.length,
      safeBrowsingAvailable: safeBrowsingResult.available,
      isTrustedSender: input.isTrustedSender
    },
    internal: {
      score,
      categoryBreakdown
    }
  };

  if (!safeBrowsingResult.available && uniqueUrls.length > 0) {
    result.technicalNote =
      "Link reputation check was unavailable. Local link analysis was still used.";
  }

  if (input.isTrustedSender) {
    result.trustedSenderNote = "You previously marked this sender as trusted.";
  }

  return result;
}
