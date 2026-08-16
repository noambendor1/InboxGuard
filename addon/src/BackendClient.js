/**
 * BackendClient.js
 *
 * The only file that talks to the InboxGuard backend. Requires the
 * "script.external_request" OAuth scope declared in appsscript.json.
 */

var BACKEND_TIMEOUT_NOTE = "Backend request failed";

function getBackendUrl_() {
  var url = PropertiesService.getScriptProperties().getProperty("BACKEND_URL");
  if (!url) {
    throw new Error("InboxGuard is not configured: missing BACKEND_URL script property.");
  }
  return url.replace(/\/$/, "");
}

/**
 * Calls POST /analyze on the backend with a signed request.
 * @param {Object} payload full analyze-request body (without userId set yet)
 * @return {{ok: true, result: Object}|{ok: false, message: string}}
 */
function callAnalyzeEndpoint(payload) {
  var bodyString = JSON.stringify(payload);
  var signed;
  try {
    signed = signRequestBody_(bodyString);
  } catch (err) {
    return { ok: false, message: "InboxGuard is not configured correctly. Please contact the add-on administrator." };
  }

  var url;
  try {
    url = getBackendUrl_() + "/analyze";
  } catch (err) {
    return { ok: false, message: "InboxGuard is not configured correctly. Please contact the add-on administrator." };
  }

  var response;
  try {
    response = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      payload: bodyString,
      headers: {
        "X-InboxGuard-Timestamp": signed.timestamp,
        "X-InboxGuard-Signature": signed.signature
      },
      muteHttpExceptions: true
    });
  } catch (err) {
    return { ok: false, message: "Could not reach the InboxGuard analysis service. Please check your connection and try again." };
  }

  var statusCode = response.getResponseCode();
  if (statusCode < 200 || statusCode >= 300) {
    // Surface the backend's own (already-sanitized, non-sensitive) reason
    // when available, e.g. "Invalid signature." - this only ever appears
    // during misconfiguration, not during normal use, and never includes
    // secrets or stack traces.
    var reason = "";
    try {
      var errorBody = JSON.parse(response.getContentText());
      if (errorBody && errorBody.message) {
        reason = " (" + errorBody.message + ")";
      }
    } catch (err) {
      // response wasn't JSON; fall back to the generic message below
    }
    return {
      ok: false,
      message: "The analysis service returned an error. Please try again in a moment." + reason
    };
  }

  var parsed;
  try {
    parsed = JSON.parse(response.getContentText());
  } catch (err) {
    return { ok: false, message: "The analysis service returned an unexpected response. Please try again." };
  }

  if (!parsed || !parsed.riskLevel) {
    return { ok: false, message: "The analysis service returned an unexpected response. Please try again." };
  }

  return { ok: true, result: parsed };
}
