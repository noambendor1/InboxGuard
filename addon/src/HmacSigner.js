/**
 * HmacSigner.js
 *
 * Signs outgoing requests to the InboxGuard backend so the backend can
 * verify they really came from this Apps Script project. This is a
 * pragmatic take-home/demo authentication mechanism - see
 * docs/ARCHITECTURE_AND_DECISIONS.md for how this should be strengthened
 * in a production system.
 *
 * The shared secret lives only in Script Properties (never in source, never
 * logged) and must match the backend's INBOXGUARD_SHARED_SECRET env var.
 */

function getSharedSecret_() {
  var secret = PropertiesService.getScriptProperties().getProperty("INBOXGUARD_SHARED_SECRET");
  if (!secret) {
    throw new Error("InboxGuard is not configured: missing shared secret script property.");
  }
  return secret;
}

/**
 * @param {string} bodyString exact JSON string that will be sent as the request body
 * @return {{timestamp: string, signature: string}}
 */
function signRequestBody_(bodyString) {
  var secret = getSharedSecret_();
  var timestamp = String(Math.floor(Date.now() / 1000));
  var signedPayload = timestamp + "." + bodyString;

  var rawSignature = Utilities.computeHmacSha256Signature(signedPayload, secret);
  var signatureHex = rawSignature
    .map(function (byte) {
      var v = (byte < 0 ? byte + 256 : byte).toString(16);
      return v.length === 1 ? "0" + v : v;
    })
    .join("");

  return { timestamp: timestamp, signature: signatureHex };
}
