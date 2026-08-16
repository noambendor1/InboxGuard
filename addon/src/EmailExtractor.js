/**
 * EmailExtractor.js
 *
 * Reads the currently opened Gmail message and turns it into the plain
 * JSON shape the backend's /analyze endpoint expects. This is the only
 * file that touches GmailApp directly.
 *
 * Privacy/security notes:
 *  - Only the currently opened message is read (contextual, least-privilege
 *    OAuth scope: gmail.addons.current.message.readonly).
 *  - We use getPlainBody() for content analysis, which Gmail renders for us
 *    server-side - the Add-on never parses or executes the message's HTML/JS.
 *  - The raw HTML body is only ever used for a narrow, non-executing regex
 *    scan to pull out (href, visible text) pairs for link analysis. It is
 *    never injected into any UI, never eval'd, and never sent anywhere in
 *    full - only the individual extracted URLs and their link text are sent.
 *  - Attachment bytes are never read - only filename/type/size metadata.
 */

var MAX_BODY_CHARS = 20000;
var MAX_LINKS = 30;
var MAX_ATTACHMENTS = 20;

/**
 * @param {GoogleAppsScript.Gmail.GmailMessage} message
 * @return {{email: string, displayName: (string|undefined), replyTo: (string|undefined)}}
 */
function extractSender_(message) {
  var fromHeader = message.getFrom() || "";
  var match = fromHeader.match(/^(.*?)<([^>]+)>\s*$/);
  var displayName;
  var email;
  if (match) {
    displayName = match[1].replace(/^"|"$/g, "").trim() || undefined;
    email = match[2].trim();
  } else {
    email = fromHeader.trim();
  }

  var replyTo;
  try {
    var replyToHeader = message.getReplyTo();
    if (replyToHeader && replyToHeader.indexOf(email) === -1) {
      var replyMatch = replyToHeader.match(/<([^>]+)>/);
      replyTo = replyMatch ? replyMatch[1] : replyToHeader.trim();
    }
  } catch (err) {
    // Reply-To is best-effort; absence is not an error.
  }

  return { email: email, displayName: displayName, replyTo: replyTo };
}

/**
 * Parses SPF/DKIM/DMARC results out of the raw "Authentication-Results"
 * header. Gmail does not expose these as structured fields, only as raw
 * MIME header text, so this is a best-effort regex parse.
 * @param {string} rawHeaders
 */
function extractAuthSignals_(rawHeaders) {
  var authResultsMatch = rawHeaders.match(/^Authentication-Results:.*(?:\r?\n[ \t].*)*/im);
  var authResults = authResultsMatch ? authResultsMatch[0] : "";

  function extractResult(mechanism) {
    var re = new RegExp(mechanism + "\\s*=\\s*(pass|fail|softfail|neutral|none)", "i");
    var m = authResults.match(re);
    return m ? m[1].toLowerCase() : "unknown";
  }

  var returnPathMatch = rawHeaders.match(/^Return-Path:\s*<?([^>\r\n]+)>?/im);

  return {
    spf: authResults ? extractResult("spf") : "unknown",
    dkim: authResults ? extractResult("dkim") : "unknown",
    dmarc: authResults ? extractResult("dmarc") : "unknown",
    returnPath: returnPathMatch ? returnPathMatch[1].trim() : undefined
  };
}

/**
 * Extracts (href, visible text) pairs from the HTML body using a narrow
 * regex scan. This never parses the HTML into a DOM and never renders it -
 * it only looks for <a ...href="...">...</a> patterns as plain text.
 * @param {string} html
 */
function extractLinks_(html) {
  var links = [];
  if (!html) return links;

  var anchorRegex = /<a\s+[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  var match;
  while ((match = anchorRegex.exec(html)) !== null && links.length < MAX_LINKS) {
    var href = match[1].trim();
    var text = match[2]
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!href || href.indexOf("mailto:") === 0 || href.indexOf("#") === 0) continue;
    links.push({ href: href, displayText: text || undefined });
  }
  return links;
}

/**
 * @param {GoogleAppsScript.Gmail.GmailAttachment[]} attachments
 */
function extractAttachments_(attachments) {
  return attachments.slice(0, MAX_ATTACHMENTS).map(function (attachment) {
    return {
      filename: attachment.getName(),
      mimeType: attachment.getContentType(),
      sizeBytes: attachment.getSize()
    };
  });
}

/**
 * Builds the full analyze-request payload (minus userId/isTrustedSender,
 * which the caller fills in) for the currently opened message.
 * @param {GoogleAppsScript.Gmail.GmailMessage} message
 */
function extractEmailForAnalysis(message) {
  var sender = extractSender_(message);
  var rawHeaders = "";
  try {
    // getRawContent() can be large; headers are always at the top, so we
    // only need the portion before the first blank line.
    var raw = message.getRawContent();
    var headerEnd = raw.search(/\r?\n\r?\n/);
    rawHeaders = headerEnd > -1 ? raw.slice(0, headerEnd) : raw.slice(0, 8000);
  } catch (err) {
    rawHeaders = "";
  }
  var authSignals = extractAuthSignals_(rawHeaders);

  var bodyText = "";
  try {
    bodyText = (message.getPlainBody() || "").slice(0, MAX_BODY_CHARS);
  } catch (err) {
    bodyText = "";
  }

  var links = [];
  try {
    links = extractLinks_(message.getBody());
  } catch (err) {
    links = [];
  }

  var attachments = [];
  try {
    attachments = extractAttachments_(message.getAttachments({ includeInlineImages: false }));
  } catch (err) {
    attachments = [];
  }

  return {
    sender: { email: sender.email, displayName: sender.displayName, replyTo: sender.replyTo },
    headers: {
      spf: authSignals.spf,
      dkim: authSignals.dkim,
      dmarc: authSignals.dmarc,
      returnPath: authSignals.returnPath
    },
    subject: (message.getSubject() || "").slice(0, 998),
    bodyText: bodyText,
    links: links,
    attachments: attachments
  };
}
