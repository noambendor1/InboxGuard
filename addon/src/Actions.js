/**
 * Actions.js
 *
 * Handlers for the two user actions: "Block this sender" and
 * "Ignore - I trust this sender" (plus its reverse, "Remove from trusted
 * senders"). Each handler is a CardService click-handler function
 * referenced from CardBuilder.js via CardService.newAction().
 *
 * IMPORTANT LIMITATION (read before assuming this "blocks" a sender the
 * same way Gmail's own UI does):
 *
 * As of the current Gmail API / Google Workspace Add-on surface, there is
 * no public API that performs Gmail's native "Block sender" action (the one
 * available from the Gmail message's "..." menu). That native action is an
 * internal Gmail feature, not exposed to the Gmail API or Apps Script.
 *
 * The closest safe, officially supported behavior is to create a Gmail
 * filter (via the Gmail Advanced Service / Gmail API's
 * users.settings.filters.create) that matches the sender's address and
 * automatically moves their future messages to Trash. This achieves the
 * same practical outcome for the user (future mail from this address stops
 * appearing in the inbox) without pretending to call an API that does not
 * exist. See docs/ARCHITECTURE_AND_DECISIONS.md for more detail.
 */

function handleBlockSenderRequested(e) {
  var senderEmail = e.parameters.senderEmail;
  return buildBlockConfirmationCard(senderEmail);
}

function handleConfirmBlockSender(e) {
  var senderEmail = e.parameters.senderEmail;
  try {
    Gmail.Users.Settings.Filters.create(
      {
        criteria: { from: senderEmail },
        action: { addLabelIds: ["TRASH"], removeLabelIds: ["INBOX"] }
      },
      "me"
    );
    return buildBlockSuccessCard();
  } catch (err) {
    return buildBlockFailureCard(
      "Gmail did not allow us to create a filter for this sender. You can block them manually from Gmail settings."
    );
  }
}

function handleTrustSender(e) {
  var senderEmail = e.parameters.senderEmail;
  try {
    markSenderTrusted(senderEmail);
    return buildTrustConfirmationCard();
  } catch (err) {
    return buildErrorCard("We couldn't save your trusted-sender preference. Please try again.");
  }
}

function handleUntrustSender(e) {
  var senderEmail = e.parameters.senderEmail;
  try {
    removeSenderTrusted(senderEmail);
    return buildUntrustConfirmationCard();
  } catch (err) {
    return buildErrorCard("We couldn't update your trusted-sender preference. Please try again.");
  }
}
