import type { Finding, HeaderSignals, SenderInput } from "../../types/models.js";

export const SENDER_CATEGORY_MAX = 30;

/**
 * A conservative list of well-known brand keywords used only to catch a
 * display name that *claims* to be a well-known brand while the sending
 * domain has nothing to do with it (e.g. "PayPal Security"
 * <security@random-payments-example.com>). This intentionally stays small
 * and literal to reduce false positives on legitimate senders who merely
 * mention a brand.
 */
const BRAND_KEYWORDS = [
  "paypal",
  "amazon",
  "microsoft",
  "apple",
  "netflix",
  "docusign",
  "fedex",
  "ups",
  "google",
  "irs",
  "bank of america",
  "wells fargo",
  "chase",
  "linkedin",
  "facebook",
  "instagram"
];

function extractDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at === -1 || at === email.length - 1) return null;
  return email
    .slice(at + 1)
    .toLowerCase()
    .trim();
}

function domainsMatch(a: string, b: string): boolean {
  if (a === b) return true;
  // allow subdomain relationships (mail.paypal.com vs paypal.com)
  return a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}

export function detectSenderIdentitySignals(
  sender: SenderInput,
  headers: HeaderSignals | undefined
): Finding[] {
  const findings: Finding[] = [];
  const senderDomain = extractDomain(sender.email);

  // --- Authentication results (SPF / DKIM / DMARC) ---
  if (headers?.dmarc === "fail") {
    findings.push({
      id: "sender.dmarc-fail",
      category: "sender",
      severity: "high",
      scoreContribution: 14,
      userTitle: "Sender verification failed",
      userExplanation:
        "This email failed a standard check that confirms it really came from the domain it claims to be from.",
      technicalExplanation: "DMARC alignment check failed for this message.",
      recommendedAction: "Verify the sender using a trusted contact method before replying."
    });
  }
  if (headers?.spf === "fail") {
    findings.push({
      id: "sender.spf-fail",
      category: "sender",
      severity: "medium",
      scoreContribution: 8,
      userTitle: "Sender's mail server could not be verified",
      userExplanation:
        "The server that sent this email is not on the approved list for the sender's domain.",
      technicalExplanation: "SPF check failed for this message.",
      recommendedAction: "Verify the sender using a trusted contact method before replying."
    });
  }
  if (headers?.dkim === "fail") {
    findings.push({
      id: "sender.dkim-fail",
      category: "sender",
      severity: "medium",
      scoreContribution: 8,
      userTitle: "Message integrity check failed",
      userExplanation:
        "This email's digital signature did not check out, which can indicate tampering.",
      technicalExplanation: "DKIM signature verification failed for this message.",
      recommendedAction: "Verify the sender using a trusted contact method before replying."
    });
  }
  if (
    (headers?.spf === "none" || headers?.spf === "unknown" || headers?.spf === undefined) &&
    (headers?.dkim === "none" || headers?.dkim === "unknown" || headers?.dkim === undefined) &&
    (headers?.dmarc === "none" || headers?.dmarc === "unknown" || headers?.dmarc === undefined)
  ) {
    findings.push({
      id: "sender.auth-unavailable",
      category: "sender",
      severity: "info",
      scoreContribution: 3,
      userTitle: "Sender verification could not be confirmed",
      userExplanation: "We could not confirm standard sender authentication for this message.",
      technicalExplanation:
        "No SPF/DKIM/DMARC authentication results were available for this message.",
      recommendedAction:
        "Verify the sender using a trusted contact method if this message is unexpected."
    });
  }

  // --- Display-name brand impersonation (conservative) ---
  if (sender.displayName && senderDomain) {
    const displayLower = sender.displayName.toLowerCase();
    const claimedBrand = BRAND_KEYWORDS.find((brand) => displayLower.includes(brand));
    if (claimedBrand) {
      const brandToken = claimedBrand.replace(/\s+/g, "");
      const domainMatchesBrand = senderDomain.replace(/-/g, "").includes(brandToken);
      if (!domainMatchesBrand) {
        findings.push({
          id: "sender.display-name-impersonation",
          category: "sender",
          severity: "high",
          scoreContribution: 12,
          userTitle: "Sender name may be misleading",
          userExplanation: `The sender name says "${sender.displayName}", but the email came from a different domain (${senderDomain}).`,
          technicalExplanation: `Display name references brand "${claimedBrand}" but sending domain "${senderDomain}" does not match.`,
          recommendedAction:
            "If this claims to be from a company you know, open that company's website directly instead of replying."
        });
      }
    }
  }

  // --- From vs Reply-To mismatch ---
  if (sender.replyTo) {
    const replyDomain = extractDomain(sender.replyTo);
    if (senderDomain && replyDomain && !domainsMatch(senderDomain, replyDomain)) {
      findings.push({
        id: "sender.reply-to-mismatch",
        category: "sender",
        severity: "medium",
        scoreContribution: 10,
        userTitle: "Replies would go somewhere unexpected",
        userExplanation:
          "If you reply to this email, your response would go to a different domain than the one it was sent from.",
        technicalExplanation: `From domain "${senderDomain}" does not match Reply-To domain "${replyDomain}".`,
        recommendedAction: "Verify the sender using a trusted contact method before replying."
      });
    }
  }

  // --- Return-Path mismatch (lower confidence, many legitimate senders vary this) ---
  if (headers?.returnPath) {
    const returnPathDomain = extractDomain(headers.returnPath);
    if (senderDomain && returnPathDomain && !domainsMatch(senderDomain, returnPathDomain)) {
      findings.push({
        id: "sender.return-path-mismatch",
        category: "sender",
        severity: "low",
        scoreContribution: 6,
        userTitle: "Sending path looks unusual",
        userExplanation:
          "The technical delivery path for this email does not match the sender's domain.",
        technicalExplanation: `Return-Path domain "${returnPathDomain}" does not match From domain "${senderDomain}".`,
        recommendedAction:
          "Verify the sender using a trusted contact method if this message is unexpected."
      });
    }
  }

  return findings;
}
