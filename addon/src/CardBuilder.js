/**
 * CardBuilder.js
 *
 * All CardService UI construction lives here. Keeping this separate from
 * EmailExtractor/BackendClient/Actions keeps each file focused on one job.
 *
 * Design rule from the product spec: never rely on color alone to convey
 * risk. The words LOW RISK / SUSPICIOUS / HIGH RISK are always rendered as
 * visible bold text, with color only as a secondary reinforcement.
 */

var RISK_DISPLAY = {
  LOW_RISK: { label: "LOW RISK", color: "#188038" },
  SUSPICIOUS: { label: "SUSPICIOUS", color: "#e37400" },
  HIGH_RISK: { label: "HIGH RISK", color: "#c5221f" }
};

var MAX_PROMINENT_FINDINGS = 5;

function buildHeader_() {
  return CardService.newCardHeader()
    .setTitle("InboxGuard")
    .setSubtitle("Email risk check");
}

/**
 * @param {Object} result the /analyze response body
 * @param {string} senderEmail
 * @param {boolean} isCurrentlyTrusted
 */
function buildResultCard(result, senderEmail, isCurrentlyTrusted) {
  var card = CardService.newCardBuilder().setHeader(buildHeader_());
  var display = RISK_DISPLAY[result.riskLevel] || RISK_DISPLAY.LOW_RISK;

  var verdictSection = CardService.newCardSection();
  verdictSection.addWidget(
    CardService.newTextParagraph().setText(
      '<b><font color="' + display.color + '">' + display.label + "</font></b>"
    )
  );
  verdictSection.addWidget(CardService.newTextParagraph().setText(result.summary));

  if (result.trustedSenderNote) {
    // Intentionally plain/small - a user decision, not an InboxGuard finding,
    // and must never outweigh the verdict above it.
    verdictSection.addWidget(
      CardService.newTextParagraph().setText("<i>" + escapeHtml_(result.trustedSenderNote) + "</i>")
    );
  }
  card.addSection(verdictSection);

  var findings = result.findings || [];
  if (findings.length > 0) {
    var whySection = CardService.newCardSection().setHeader("WHY?");
    findings.slice(0, MAX_PROMINENT_FINDINGS).forEach(function (finding) {
      whySection.addWidget(
        CardService.newTextParagraph().setText("• " + escapeHtml_(finding.userExplanation))
      );
    });
    card.addSection(whySection);
  } else {
    var noneSection = CardService.newCardSection().setHeader("WHY?");
    noneSection.addWidget(
      CardService.newTextParagraph().setText("No strong suspicious signals were detected.")
    );
    card.addSection(noneSection);
  }

  var actionSection = CardService.newCardSection().setHeader("WHAT SHOULD I DO?");
  actionSection.addWidget(CardService.newTextParagraph().setText(escapeHtml_(result.recommendedAction)));
  card.addSection(actionSection);

  var userActionsSection = CardService.newCardSection().setHeader("Your actions");
  userActionsSection.addWidget(
    CardService.newTextParagraph().setText(
      "<i>These are your decisions, not an InboxGuard recommendation.</i>"
    )
  );

  var buttonSet = CardService.newButtonSet();
  buttonSet.addButton(
    CardService.newTextButton()
      .setText("Block this sender")
      .setTextButtonStyle(CardService.TextButtonStyle.OUTLINED)
      .setOnClickAction(
        CardService.newAction().setFunctionName("handleBlockSenderRequested").setParameters({ senderEmail: senderEmail })
      )
  );

  if (isCurrentlyTrusted) {
    buttonSet.addButton(
      CardService.newTextButton()
        .setText("Remove from trusted senders")
        .setTextButtonStyle(CardService.TextButtonStyle.OUTLINED)
        .setOnClickAction(
          CardService.newAction().setFunctionName("handleUntrustSender").setParameters({ senderEmail: senderEmail })
        )
    );
  } else {
    buttonSet.addButton(
      CardService.newTextButton()
        .setText("Ignore — I trust this sender")
        .setTextButtonStyle(CardService.TextButtonStyle.OUTLINED)
        .setOnClickAction(
          CardService.newAction().setFunctionName("handleTrustSender").setParameters({ senderEmail: senderEmail })
        )
    );
  }
  userActionsSection.addWidget(buttonSet);
  card.addSection(userActionsSection);

  card.addSection(buildTechnicalDetailsSection_(result));
  card.addSection(buildAnalyzeAgainSection_());

  return card.build();
}

function buildTechnicalDetailsSection_(result) {
  var section = CardService.newCardSection().setHeader("TECHNICAL DETAILS").setCollapsible(true);

  section.addWidget(
    CardService.newTextParagraph().setText("Attachment contents are not uploaded or opened.")
  );

  if (result.technicalNote) {
    section.addWidget(CardService.newTextParagraph().setText(escapeHtml_(result.technicalNote)));
  }

  (result.findings || []).forEach(function (finding) {
    section.addWidget(
      CardService.newDecoratedText()
        .setText(escapeHtml_(finding.userTitle))
        .setBottomLabel(escapeHtml_(finding.technicalExplanation))
        .setWrapText(true)
    );
  });

  section.addWidget(
    CardService.newTextParagraph().setText(
      "<i>This analysis can identify suspicious signals but cannot guarantee that an email is safe.</i>"
    )
  );

  return section;
}

function buildAnalyzeAgainSection_() {
  var section = CardService.newCardSection();
  section.addWidget(
    CardService.newTextButton()
      .setText("Analyze Again")
      .setOnClickAction(CardService.newAction().setFunctionName("buildAddOn"))
  );
  return section;
}

function buildLoadingErrorCard_(title, message, showRetry) {
  var card = CardService.newCardBuilder().setHeader(buildHeader_());
  var section = CardService.newCardSection();
  section.addWidget(CardService.newTextParagraph().setText("<b>" + escapeHtml_(title) + "</b>"));
  section.addWidget(CardService.newTextParagraph().setText(escapeHtml_(message)));
  if (showRetry) {
    section.addWidget(
      CardService.newTextButton()
        .setText("Retry")
        .setOnClickAction(CardService.newAction().setFunctionName("buildAddOn"))
    );
  }
  card.addSection(section);
  return card.build();
}

function buildErrorCard(message) {
  return buildLoadingErrorCard_(
    "We couldn't analyze this email",
    message || "Something went wrong. Please try again.",
    true
  );
}

function buildEmptyStateCard(message) {
  return buildLoadingErrorCard_("InboxGuard", message, false);
}

function buildBlockConfirmationCard(senderEmail) {
  var card = CardService.newCardBuilder().setHeader(buildHeader_());
  var section = CardService.newCardSection();
  section.addWidget(
    CardService.newTextParagraph().setText(
      "Block future emails from <b>" + escapeHtml_(senderEmail) + "</b>?"
    )
  );
  section.addWidget(
    CardService.newTextParagraph().setText(
      "This creates a Gmail filter that automatically sends future messages from this address to Trash. See the technical details on the previous screen for how this differs from Gmail's built-in Block sender menu action."
    )
  );

  var buttonSet = CardService.newButtonSet();
  buttonSet.addButton(
    CardService.newTextButton()
      .setText("Confirm block")
      .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
      .setOnClickAction(
        CardService.newAction().setFunctionName("handleConfirmBlockSender").setParameters({ senderEmail: senderEmail })
      )
  );
  buttonSet.addButton(
    CardService.newTextButton()
      .setText("Cancel")
      .setOnClickAction(CardService.newAction().setFunctionName("buildAddOn"))
  );
  section.addWidget(buttonSet);
  card.addSection(section);
  return card.build();
}

function buildSimpleMessageCard_(title, message) {
  var card = CardService.newCardBuilder().setHeader(buildHeader_());
  var section = CardService.newCardSection();
  section.addWidget(CardService.newTextParagraph().setText("<b>" + escapeHtml_(title) + "</b>"));
  section.addWidget(CardService.newTextParagraph().setText(escapeHtml_(message)));
  section.addWidget(
    CardService.newTextButton()
      .setText("Back to analysis")
      .setOnClickAction(CardService.newAction().setFunctionName("buildAddOn"))
  );
  card.addSection(section);
  return card.build();
}

function buildBlockSuccessCard() {
  return buildSimpleMessageCard_("Sender blocked", "Future emails from this sender will be sent to Trash automatically.");
}

function buildBlockFailureCard(message) {
  return buildSimpleMessageCard_(
    "Couldn't block sender",
    message || "We weren't able to block this sender. Please try again, or block them from Gmail settings directly."
  );
}

function buildTrustConfirmationCard() {
  return buildSimpleMessageCard_("Sender trusted", "You marked this sender as trusted.");
}

function buildUntrustConfirmationCard() {
  return buildSimpleMessageCard_("Trust removed", "This sender is no longer marked as trusted.");
}

function escapeHtml_(text) {
  if (!text) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
