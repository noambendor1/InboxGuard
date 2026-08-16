/**
 * Core domain types shared across the analysis engine.
 *
 * NOTE on the numeric score: `score` and the per-category numbers in
 * `CategoryBreakdown` are an internal decision mechanism used only to pick a
 * RiskLevel and to rank findings. They are not a statistical probability and
 * must never be rendered as-is in the Gmail UI. See docs/ARCHITECTURE_AND_DECISIONS.md.
 */

export type RiskLevel = "LOW_RISK" | "SUSPICIOUS" | "HIGH_RISK";

export type FindingCategory = "sender" | "links" | "content" | "attachments";

export type FindingSeverity = "info" | "low" | "medium" | "high" | "critical";

export interface Finding {
  id: string;
  category: FindingCategory;
  severity: FindingSeverity;
  /** Internal points this finding contributed, already capped. Not shown to the user. */
  scoreContribution: number;
  /** Short, plain-language title shown prominently in the UI. */
  userTitle: string;
  /** One or two plain-language sentences explaining the finding to a non-technical user. */
  userExplanation: string;
  /** More technical detail, only shown in a secondary "Technical details" section. */
  technicalExplanation: string;
  /** A concrete, specific next step tied to this finding. */
  recommendedAction: string;
}

export interface CategoryBreakdown {
  sender: number;
  links: number;
  content: number;
  attachments: number;
}

export interface AnalyzeMeta {
  urlsAnalyzed: number;
  attachmentsAnalyzed: number;
  safeBrowsingAvailable: boolean;
  isTrustedSender: boolean;
}

export interface AnalyzeResult {
  riskLevel: RiskLevel;
  /** One-sentence, plain-language summary of the verdict. */
  summary: string;
  /** Top-level recommended action, chosen from the highest-priority finding. */
  recommendedAction: string;
  /** All findings, sorted by importance (most important first). */
  findings: Finding[];
  /** Optional neutral note, e.g. when Safe Browsing was unavailable. */
  technicalNote?: string;
  /** Optional note about a pre-existing trusted-sender preference for this contact. */
  trustedSenderNote?: string;
  meta: AnalyzeMeta;
  /**
   * Internal-only fields. The Gmail Add-on must not render these as a score.
   * Kept on the response for debugging/observability and for the tests that
   * verify scoring invariants.
   */
  internal: {
    score: number;
    categoryBreakdown: CategoryBreakdown;
  };
}

export interface SenderInput {
  email: string;
  displayName?: string;
  replyTo?: string;
}

export type AuthResult = "pass" | "fail" | "neutral" | "softfail" | "none" | "unknown";

export interface HeaderSignals {
  spf?: AuthResult;
  dkim?: AuthResult;
  dmarc?: AuthResult;
  returnPath?: string;
}

export interface LinkInput {
  href: string;
  displayText?: string;
}

export interface AttachmentInput {
  filename: string;
  mimeType?: string;
  sizeBytes?: number;
}

export interface AnalyzeInput {
  userId: string;
  sender: SenderInput;
  headers?: HeaderSignals;
  subject?: string;
  bodyText: string;
  links: LinkInput[];
  attachments: AttachmentInput[];
  isTrustedSender: boolean;
}

export interface SafeBrowsingLookupResult {
  available: boolean;
  maliciousUrls: Set<string>;
}
