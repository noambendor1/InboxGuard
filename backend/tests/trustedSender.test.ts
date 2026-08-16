import { afterEach, describe, expect, it, vi } from "vitest";
import { analyzeEmail } from "../src/analysis/analyzeEmail.js";
import { baseInput } from "./testHelpers.js";

const noSafeBrowsing = { safeBrowsingApiKey: undefined };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("trusted sender behavior", () => {
  it("14. recognizes a trusted sender on a benign email", async () => {
    const input = baseInput({ isTrustedSender: true });

    const result = await analyzeEmail(input, noSafeBrowsing);

    expect(result.meta.isTrustedSender).toBe(true);
    expect(result.trustedSenderNote).toBe("You previously marked this sender as trusted.");
    expect(result.riskLevel).toBe("LOW_RISK");
  });

  it("15. reduces a low-confidence identity warning for a trusted sender", async () => {
    const untrusted = await analyzeEmail(
      baseInput({
        sender: { email: "alice@example.com" },
        headers: { returnPath: "bounce@totally-different-domain.com" },
        isTrustedSender: false
      }),
      noSafeBrowsing
    );
    const trusted = await analyzeEmail(
      baseInput({
        sender: { email: "alice@example.com" },
        headers: { returnPath: "bounce@totally-different-domain.com" },
        isTrustedSender: true
      }),
      noSafeBrowsing
    );

    expect(untrusted.findings.some((f) => f.id === "sender.return-path-mismatch")).toBe(true);
    expect(trusted.findings.some((f) => f.id === "sender.return-path-mismatch")).toBe(false);
  });

  it("16. still shows HIGH_RISK for a trusted sender whose email contains a Safe Browsing malicious URL", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          matches: [{ threat: { url: "http://compromised-account-link.example" } }]
        })
      })
    );

    const input = baseInput({
      sender: { email: "alice@example.com" },
      isTrustedSender: true,
      links: [{ href: "http://compromised-account-link.example" }]
    });

    const result = await analyzeEmail(input, { safeBrowsingApiKey: "fake-key" });

    expect(result.riskLevel).toBe("HIGH_RISK");
    expect(result.findings.some((f) => f.id.startsWith("link.safe-browsing-match"))).toBe(true);
    expect(result.summary).toContain("previously trusted");
  });

  it("17. still shows risk for a trusted sender with a suspicious attachment", async () => {
    const input = baseInput({
      isTrustedSender: true,
      attachments: [{ filename: "invoice.pdf.exe" }]
    });

    const result = await analyzeEmail(input, noSafeBrowsing);
    const finding = result.findings.find((f) => f.id.startsWith("attachment.double-extension"));

    // Trust must not hide the finding from the user, even if the overall
    // score for this single signal does not by itself cross a risk-level boundary.
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe("critical");
  });

  it("18. keeps trust decisions isolated per request (the backend holds no shared/global trust state)", async () => {
    const sameSender = { email: "shared-contact@example.com" };

    const asUserA = await analyzeEmail(
      baseInput({ userId: "user-A", sender: sameSender, isTrustedSender: true }),
      noSafeBrowsing
    );
    const asUserB = await analyzeEmail(
      baseInput({ userId: "user-B", sender: sameSender, isTrustedSender: false }),
      noSafeBrowsing
    );

    expect(asUserA.meta.isTrustedSender).toBe(true);
    expect(asUserB.meta.isTrustedSender).toBe(false);
  });
});
