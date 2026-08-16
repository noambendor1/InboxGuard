import { describe, expect, it, vi, beforeEach } from "vitest";
import { analyzeEmail } from "../src/analysis/analyzeEmail.js";
import { baseInput } from "./testHelpers.js";

const noSafeBrowsing = { safeBrowsingApiKey: undefined };

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("analyzeEmail - basic analysis", () => {
  it("1. rates a normal legitimate email as LOW_RISK", async () => {
    const input = baseInput({
      sender: { email: "notifications@github.com", displayName: "GitHub" },
      headers: { spf: "pass", dkim: "pass", dmarc: "pass" },
      subject: "Your weekly digest",
      bodyText: "Here's what happened in your repositories this week.",
      links: [{ href: "https://github.com/settings/notifications", displayText: "Manage settings" }]
    });

    const result = await analyzeEmail(input, noSafeBrowsing);

    expect(result.riskLevel).toBe("LOW_RISK");
  });

  it("2. rates an obvious phishing email as HIGH_RISK", async () => {
    const input = baseInput({
      sender: {
        email: "security@random-payments-example.com",
        displayName: "PayPal Security",
        replyTo: "reply@another-domain.net"
      },
      headers: { spf: "fail", dkim: "fail", dmarc: "fail" },
      subject: "Urgent: Verify your account immediately",
      bodyText:
        "Your account has been suspended. Please verify your account immediately by entering your password within 24 hours.",
      links: [{ href: "http://192.168.10.5/login/verify", displayText: "https://paypal.com/login" }]
    });

    const result = await analyzeEmail(input, noSafeBrowsing);

    expect(result.riskLevel).toBe("HIGH_RISK");
  });

  it("3. flags a From / Reply-To domain mismatch as a sender-identity finding", async () => {
    const input = baseInput({
      sender: { email: "alice@example.com", replyTo: "bob@other-domain.com" },
      bodyText: "Following up on our meeting."
    });

    const result = await analyzeEmail(input, noSafeBrowsing);

    expect(result.findings.some((f) => f.id === "sender.reply-to-mismatch")).toBe(true);
  });

  it("4. increases identity risk when authentication headers fail", async () => {
    const passing = await analyzeEmail(
      baseInput({ headers: { spf: "pass", dkim: "pass", dmarc: "pass" } }),
      noSafeBrowsing
    );
    const failing = await analyzeEmail(
      baseInput({ headers: { spf: "fail", dkim: "fail", dmarc: "fail" } }),
      noSafeBrowsing
    );

    expect(failing.internal.categoryBreakdown.sender).toBeGreaterThan(
      passing.internal.categoryBreakdown.sender
    );
    expect(failing.findings.some((f) => f.id === "sender.dmarc-fail")).toBe(true);
  });

  it("5. flags a punycode URL as a link finding", async () => {
    const input = baseInput({
      links: [{ href: "https://xn--pypal-4ve.com/account" }]
    });

    const result = await analyzeEmail(input, noSafeBrowsing);

    expect(result.findings.some((f) => f.id.startsWith("link.punycode"))).toBe(true);
  });

  it("6. flags a visible link text vs href domain mismatch strongly", async () => {
    const input = baseInput({
      links: [
        {
          href: "https://evil-domain.ru/abc",
          displayText: "https://www.bankofamerica.com/login"
        }
      ]
    });

    const result = await analyzeEmail(input, noSafeBrowsing);
    const finding = result.findings.find((f) => f.id.startsWith("link.text-mismatch"));

    expect(finding).toBeDefined();
    expect(finding?.severity).toBe("high");
  });

  it("7. flags invoice.pdf.exe as a suspicious attachment", async () => {
    const input = baseInput({
      attachments: [{ filename: "invoice.pdf.exe", mimeType: "application/x-msdownload" }]
    });

    const result = await analyzeEmail(input, noSafeBrowsing);

    expect(result.findings.some((f) => f.id.startsWith("attachment.double-extension"))).toBe(true);
  });

  it("8. succeeds without crashing on an empty email", async () => {
    const input = baseInput({
      sender: { email: "a@b.com" },
      headers: undefined,
      subject: undefined,
      bodyText: "",
      links: [],
      attachments: []
    });

    await expect(analyzeEmail(input, noSafeBrowsing)).resolves.toBeDefined();
    const result = await analyzeEmail(input, noSafeBrowsing);
    expect(result.riskLevel).toBeDefined();
  });

  it("9. succeeds without crashing on a malformed URL", async () => {
    const input = baseInput({
      links: [{ href: "ht!tp://not a valid url with spaces and %%%" }]
    });

    await expect(analyzeEmail(input, noSafeBrowsing)).resolves.toBeDefined();
  });

  it("10. does not classify a benign business email containing 'urgent' as HIGH_RISK", async () => {
    const input = baseInput({
      sender: { email: "jane@partnercompany.com", displayName: "Jane Doe" },
      headers: { spf: "pass", dkim: "pass", dmarc: "pass" },
      subject: "Urgent: Q3 numbers needed",
      bodyText: "Hi team, this is urgent - please send the Q3 numbers by end of day.",
      links: []
    });

    const result = await analyzeEmail(input, noSafeBrowsing);

    expect(result.riskLevel).not.toBe("HIGH_RISK");
  });
});

describe("scoring invariants", () => {
  it("never exceeds a total score of 100 and respects category maximums", async () => {
    const input = baseInput({
      sender: {
        email: "security@random-payments-example.com",
        displayName: "PayPal Security",
        replyTo: "reply@another-domain.net"
      },
      headers: { spf: "fail", dkim: "fail", dmarc: "fail" },
      subject: "Urgent: your account will be closed - verify your password now",
      bodyText:
        "Your account has been suspended. Verify your password immediately, wire transfer required, gift card payment, act now within 24 hours, legal action will follow, bitcoin accepted, social security number required.",
      links: [
        { href: "http://192.168.10.5/login/verify", displayText: "https://paypal.com/login" },
        { href: "https://xn--pypal-4ve.com/verify-account" },
        { href: "https://bit.ly/abcd1234" }
      ],
      attachments: [
        { filename: "invoice.pdf.exe", mimeType: "application/x-msdownload" },
        { filename: "archive.zip" }
      ]
    });

    const result = await analyzeEmail(input, noSafeBrowsing);

    expect(result.internal.score).toBeLessThanOrEqual(100);
    expect(result.internal.categoryBreakdown.sender).toBeLessThanOrEqual(30);
    expect(result.internal.categoryBreakdown.links).toBeLessThanOrEqual(30);
    expect(result.internal.categoryBreakdown.content).toBeLessThanOrEqual(20);
    expect(result.internal.categoryBreakdown.attachments).toBeLessThanOrEqual(20);
  });

  it("produces deterministic results for identical input", async () => {
    const input = baseInput({
      links: [{ href: "http://example.com/login", displayText: "example" }]
    });

    const first = await analyzeEmail(input, noSafeBrowsing);
    const second = await analyzeEmail(input, noSafeBrowsing);

    expect(first.internal.score).toBe(second.internal.score);
    expect(first.riskLevel).toBe(second.riskLevel);
  });
});
