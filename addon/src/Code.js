/**
 * Code.js
 *
 * Entry points wired up in appsscript.json (contextual trigger + homepage
 * trigger). Kept intentionally thin: it wires together EmailExtractor,
 * TrustedSenderStore, BackendClient, and CardBuilder, and is the single
 * place responsible for graceful error handling around the whole flow.
 */

/**
 * Shown when the user opens the add-on without a specific email in context
 * (e.g. from the Gmail side panel with nothing open).
 */
function onHomepage(e) {
  return buildEmptyStateCard("Open an email in Gmail to see its InboxGuard risk analysis.");
}

/**
 * Gmail contextual trigger: runs whenever the user opens (or switches to)
 * an email while the add-on panel is visible.
 */
function buildAddOn(e) {
  try {
    if (!e || !e.gmail || !e.gmail.messageId) {
      return buildEmptyStateCard("Open an email in Gmail to see its InboxGuard risk analysis.");
    }

    GmailApp.setCurrentMessageAccessToken(e.gmail.accessToken);
    var message = GmailApp.getMessageById(e.gmail.messageId);
    if (!message) {
      return buildErrorCard("This email could not be loaded. Please try again.");
    }

    var emailData = extractEmailForAnalysis(message);
    var senderEmail = emailData.sender.email;
    var trusted = isSenderTrusted(senderEmail);

    var payload = {
      // Session.getTemporaryActiveUserKey() gives a stable-per-user,
      // anonymous identifier scoped to this script - no email address or
      // other PII is sent to the backend for identification purposes.
      userId: Session.getTemporaryActiveUserKey() || "unknown-user",
      sender: emailData.sender,
      headers: emailData.headers,
      subject: emailData.subject,
      bodyText: emailData.bodyText,
      links: emailData.links,
      attachments: emailData.attachments,
      isTrustedSender: trusted
    };

    var response = callAnalyzeEndpoint(payload);
    if (!response.ok) {
      return buildErrorCard(response.message);
    }

    return buildResultCard(response.result, senderEmail, trusted);
  } catch (err) {
    return buildErrorCard("An unexpected error occurred while analyzing this email.");
  }
}
