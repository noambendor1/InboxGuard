import type { AnalyzeInput } from "../src/types/models.js";

export function baseInput(overrides: Partial<AnalyzeInput> = {}): AnalyzeInput {
  return {
    userId: "user-123",
    sender: { email: "person@example.com", displayName: "A Person" },
    headers: { spf: "pass", dkim: "pass", dmarc: "pass" },
    subject: "Hello",
    bodyText: "Just a normal message.",
    links: [],
    attachments: [],
    isTrustedSender: false,
    ...overrides
  };
}
