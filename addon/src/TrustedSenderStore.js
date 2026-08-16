/**
 * TrustedSenderStore.js
 *
 * Stores "I trust this sender" preferences using PropertiesService's
 * User Properties store. User Properties are automatically scoped to the
 * individual Gmail user running the Add-on and are never shared across
 * users of the same script - this satisfies the "per-user, not a global
 * allowlist" requirement without needing any external database.
 *
 * Trusting a sender is a pure usability signal read by the scoring engine
 * to reduce low-confidence noise; it is passed to the backend as
 * `isTrustedSender` on every request and never used client-side to skip
 * analysis.
 */

var TRUST_KEY_PREFIX = "inboxguard.trusted.";

function trustKeyFor_(senderEmail) {
  return TRUST_KEY_PREFIX + senderEmail.trim().toLowerCase();
}

function isSenderTrusted(senderEmail) {
  if (!senderEmail) return false;
  var value = PropertiesService.getUserProperties().getProperty(trustKeyFor_(senderEmail));
  return value === "true";
}

function markSenderTrusted(senderEmail) {
  PropertiesService.getUserProperties().setProperty(trustKeyFor_(senderEmail), "true");
}

function removeSenderTrusted(senderEmail) {
  PropertiesService.getUserProperties().deleteProperty(trustKeyFor_(senderEmail));
}
