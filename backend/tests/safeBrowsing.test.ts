import { afterEach, describe, expect, it, vi } from "vitest";
import { analyzeEmail } from "../src/analysis/analyzeEmail.js";
import { lookupUrlsWithSafeBrowsing } from "../src/safebrowsing/safeBrowsingClient.js";
import { baseInput } from "./testHelpers.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Google Safe Browsing integration", () => {
  it("11. treats a positive Safe Browsing match as a strong malicious-link finding and forces HIGH_RISK", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          matches: [{ threat: { url: "http://known-bad.example/phish" } }]
        })
      })
    );

    const input = baseInput({ links: [{ href: "http://known-bad.example/phish" }] });
    const result = await analyzeEmail(input, { safeBrowsingApiKey: "fake-key" });

    expect(result.findings.some((f) => f.id.startsWith("link.safe-browsing-match"))).toBe(true);
    expect(result.riskLevel).toBe("HIGH_RISK");
  });

  it("12. produces no Safe Browsing warning on a clean/no-match response, but still runs local heuristics", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({})
      })
    );

    const input = baseInput({ links: [{ href: "http://example.com/login" }] });
    const result = await analyzeEmail(input, { safeBrowsingApiKey: "fake-key" });

    expect(result.findings.some((f) => f.id.startsWith("link.safe-browsing-match"))).toBe(false);
    // local heuristic (insecure http) still ran
    expect(result.findings.some((f) => f.id.startsWith("link.http"))).toBe(true);
  });

  it("13. still succeeds when Safe Browsing is unavailable (timeout/error/quota)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));

    const input = baseInput({ links: [{ href: "https://example.com" }] });
    const result = await analyzeEmail(input, { safeBrowsingApiKey: "fake-key" });

    expect(result.riskLevel).toBeDefined();
    expect(result.meta.safeBrowsingAvailable).toBe(false);
    expect(result.technicalNote).toBeDefined();
  });

  it("returns available:false without calling fetch when no API key is configured", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const lookup = await lookupUrlsWithSafeBrowsing(["https://example.com"], undefined);

    expect(lookup.available).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
