import { ATTACHMENTS_CATEGORY_MAX } from "../analysis/detectors/attachments.js";
import { CONTENT_CATEGORY_MAX } from "../analysis/detectors/content.js";
import { LINKS_CATEGORY_MAX } from "../analysis/detectors/links.js";
import { SENDER_CATEGORY_MAX } from "../analysis/detectors/senderIdentity.js";
import type { CategoryBreakdown, Finding, FindingCategory } from "../types/models.js";

const CATEGORY_MAX: Record<FindingCategory, number> = {
  sender: SENDER_CATEGORY_MAX,
  links: LINKS_CATEGORY_MAX,
  content: CONTENT_CATEGORY_MAX,
  attachments: ATTACHMENTS_CATEGORY_MAX
};

const SEVERITY_RANK: Record<Finding["severity"], number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  info: 1
};

export interface ScoreResult {
  score: number;
  categoryBreakdown: CategoryBreakdown;
  sortedFindings: Finding[];
}

/**
 * Sums each finding's contribution per category, caps each category at its
 * documented maximum (so no single category can dominate through sheer
 * volume of small findings), then sums the capped categories into a 0-100
 * total. Because the four category maximums (30+30+20+20) add up to exactly
 * 100, the total is always within [0, 100] by construction.
 */
export function scoreFindings(findings: Finding[]): ScoreResult {
  const rawTotals: CategoryBreakdown = { sender: 0, links: 0, content: 0, attachments: 0 };

  for (const finding of findings) {
    rawTotals[finding.category] += finding.scoreContribution;
  }

  const categoryBreakdown: CategoryBreakdown = {
    sender: Math.min(rawTotals.sender, CATEGORY_MAX.sender),
    links: Math.min(rawTotals.links, CATEGORY_MAX.links),
    content: Math.min(rawTotals.content, CATEGORY_MAX.content),
    attachments: Math.min(rawTotals.attachments, CATEGORY_MAX.attachments)
  };

  const score =
    categoryBreakdown.sender +
    categoryBreakdown.links +
    categoryBreakdown.content +
    categoryBreakdown.attachments;

  const sortedFindings = [...findings].sort((a, b) => {
    const severityDiff = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
    if (severityDiff !== 0) return severityDiff;
    return b.scoreContribution - a.scoreContribution;
  });

  return { score, categoryBreakdown, sortedFindings };
}
