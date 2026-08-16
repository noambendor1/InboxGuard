import type { SafeBrowsingLookupResult } from "../types/models.js";

const SAFE_BROWSING_ENDPOINT = "https://safebrowsing.googleapis.com/v4/threatMatches:find";
const REQUEST_TIMEOUT_MS = 3000;

interface SafeBrowsingApiResponse {
  matches?: Array<{ threat?: { url?: string } }>;
}

/**
 * Looks up a batch of URLs against Google Safe Browsing's known-threat lists.
 *
 * This is a *reputation* check only: it tells us whether Google has already
 * seen and confirmed a URL as malicious. It intentionally never fetches the
 * URLs themselves - only their string form is sent to Google's API, exactly
 * the same way the official Safe Browsing Lookup API is designed to be used.
 *
 * Failure handling: any error, timeout, non-2xx response, or quota issue
 * results in `{ available: false, maliciousUrls: new Set() }` so that the
 * caller can continue the analysis using local heuristics alone. A raw
 * Google API error is never propagated to the caller or logged verbatim.
 */
export async function lookupUrlsWithSafeBrowsing(
  urls: string[],
  apiKey: string | undefined
): Promise<SafeBrowsingLookupResult> {
  if (!apiKey || urls.length === 0) {
    return { available: !!apiKey, maliciousUrls: new Set() };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${SAFE_BROWSING_ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client: {
          clientId: "inboxguard",
          clientVersion: "1.0.0"
        },
        threatInfo: {
          threatTypes: [
            "MALWARE",
            "SOCIAL_ENGINEERING",
            "UNWANTED_SOFTWARE",
            "POTENTIALLY_HARMFUL_APPLICATION"
          ],
          platformTypes: ["ANY_PLATFORM"],
          threatEntryTypes: ["URL"],
          threatEntries: urls.slice(0, 500).map((url) => ({ url }))
        }
      })
    });

    if (!response.ok) {
      return { available: false, maliciousUrls: new Set() };
    }

    const data = (await response.json()) as SafeBrowsingApiResponse;
    const maliciousUrls = new Set(
      (data.matches ?? [])
        .map((match) => match.threat?.url)
        .filter((url): url is string => typeof url === "string")
    );

    return { available: true, maliciousUrls };
  } catch {
    return { available: false, maliciousUrls: new Set() };
  } finally {
    clearTimeout(timeout);
  }
}
