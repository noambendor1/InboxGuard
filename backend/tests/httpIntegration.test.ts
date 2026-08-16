import crypto from "node:crypto";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

const SECRET = "test-shared-secret";

function sign(body: string, timestamp: number): string {
  return crypto.createHmac("sha256", SECRET).update(`${timestamp}.${body}`).digest("hex");
}

describe("HTTP layer: health + HMAC authentication", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = createApp({
      port: 0,
      sharedSecret: SECRET,
      safeBrowsingApiKey: undefined,
      maxRequestAgeSeconds: 300
    });
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve());
    });
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(() => {
    server.close();
  });

  it("GET /health responds 200 without authentication", async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { status: string };
    expect(json.status).toBe("ok");
  });

  it("rejects /analyze with missing signature headers", async () => {
    const res = await fetch(`${baseUrl}/analyze`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({})
    });
    expect(res.status).toBe(401);
  });

  it("rejects /analyze with an invalid signature", async () => {
    const body = JSON.stringify({ userId: "u1" });
    const timestamp = Math.floor(Date.now() / 1000);
    const res = await fetch(`${baseUrl}/analyze`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-inboxguard-timestamp": String(timestamp),
        "x-inboxguard-signature": "0".repeat(64)
      },
      body
    });
    expect(res.status).toBe(401);
  });

  it("rejects /analyze with a stale timestamp", async () => {
    const body = JSON.stringify({ userId: "u1" });
    const staleTimestamp = Math.floor(Date.now() / 1000) - 600;
    const signature = sign(body, staleTimestamp);
    const res = await fetch(`${baseUrl}/analyze`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-inboxguard-timestamp": String(staleTimestamp),
        "x-inboxguard-signature": signature
      },
      body
    });
    expect(res.status).toBe(401);
  });

  it("accepts a correctly signed, valid /analyze request and returns an analysis", async () => {
    const payload = {
      userId: "u1",
      sender: { email: "person@example.com", displayName: "A Person" },
      headers: { spf: "pass", dkim: "pass", dmarc: "pass" },
      subject: "Hello",
      bodyText: "Just a normal message.",
      links: [],
      attachments: [],
      isTrustedSender: false
    };
    const body = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = sign(body, timestamp);

    const res = await fetch(`${baseUrl}/analyze`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-inboxguard-timestamp": String(timestamp),
        "x-inboxguard-signature": signature
      },
      body
    });

    expect(res.status).toBe(200);
    const json = (await res.json()) as { riskLevel: string };
    expect(json.riskLevel).toBe("LOW_RISK");
  });

  it("rejects a correctly signed request whose body was validated but malformed (wrong shape)", async () => {
    const body = JSON.stringify({ userId: "u1" });
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = sign(body, timestamp);

    const res = await fetch(`${baseUrl}/analyze`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-inboxguard-timestamp": String(timestamp),
        "x-inboxguard-signature": signature
      },
      body
    });

    expect(res.status).toBe(400);
  });
});
