# Demo guide

Five safe, self-contained sample emails you can send to your own inbox, plus a 3–5 minute demo flow. Nothing here is real malware — every "dangerous" link points at a private/non-routable address or a domain that doesn't resolve to anything, and InboxGuard never visits links anyway (see README, "Security & privacy"). Don't click the demo links regardless.

All five scenarios assume you have the Gmail Add-on installed (see `docs/DEPLOYMENT.md`, Part C) and are sending emails **to yourself** from your own Gmail account (or any account — the point is just that they land in an inbox where you have the add-on installed).

## How to send a sample email

1. In Gmail, click **Compose**.
2. Address it **to yourself**.
3. Copy the subject and body below.
4. For scenarios that need a link where the **visible text differs from the actual URL** (#3 and #5), don't just paste a URL — use Gmail's **Insert link** tool (the chain-link icon in the compose toolbar) so you can set the display text and the destination URL independently.
5. Send, then open the email and click the InboxGuard icon — the vertical icon rail on the far-right edge of Gmail, same strip as Calendar/Tasks/Keep, shown as a blue shield: <img src="https://www.gstatic.com/images/icons/material/system/2x/security_googblue_48dp.png" alt="InboxGuard icon" width="24" />

---

## Scenario 1 — Normal email → LOW RISK

**Subject:** Notes from today's sync

**Body:**
```
Hi team,

Quick recap from today's sync: we're on track for the Q3 release. I'll send
the updated timeline by Friday. Let me know if you have questions.

Thanks,
Jordan
```

No links, no attachments. Expected verdict: **LOW RISK** — "No strong suspicious signals were detected."

---

## Scenario 2 — Suspicious (but not extreme) → SUSPICIOUS

**Subject:** Action required: update your billing information

**Body:**
```
Hello,

We noticed an issue processing your last payment. Please confirm your
account details soon to avoid any interruption to your service.

Support Team
```

No links or attachments — just mild urgency + a vague account/payment reference, without the stronger combination of signals a real phishing email has. Expected verdict: **SUSPICIOUS** (a few weak signals, not enough for HIGH RISK).

---

## Scenario 3 — Simulated phishing → SUSPICIOUS

**Subject:** Final Notice - Immediate Payment Required

**Body:**
```
FINAL NOTICE:

This is a payment overdue notice. Your account has been suspended and
this matter is now proceeding to legal action, with no option to cancel
or delay.

To avoid further action, verify your account immediately and complete
payment using the official link below:
```

For the link: use **Insert link**, set the display text to `account-billing.com`, and set the actual URL to `http://203.0.113.7/verify-payment`. (`203.0.113.7` is an address permanently reserved for documentation examples — it isn't a real, reachable site, so there's no risk even if it's clicked by accident.)

**Verified result:** InboxGuard correctly returns **SUSPICIOUS**, leading with "This link is displayed as 'account-billing.com' but actually points to '203.0.113.7'," followed by "One of the links points directly to a numeric address instead of a normal website name," and the content combination finding for the urgency/payment/threat language.

To push this specific example over the line into HIGH RISK, add either a genuine sender mismatch (a display name claiming a real brand while the address doesn't match — see `backend/src/analysis/detectors/senderIdentity.ts`) or a confirmed Safe Browsing match (README, "How the detection works") - a link that looks clean structurally but is already known-bad is exactly the case that override exists for.

---

## Scenario 4 — Trusted sender, benign email

1. First, send yourself **Scenario 1** again but from a second address you control (or just reuse Scenario 1).
2. Open it, click **Ignore — I trust this sender** in the InboxGuard sidebar.
3. Confirm you see "You marked this sender as trusted."
4. Reopen the email (or click **Analyze Again**) — you should now see the small note *"You previously marked this sender as trusted"* alongside the still-LOW-RISK verdict.

---

## Scenario 5 — Trusted sender whose email contains a malicious-looking signal

This demonstrates the most important product decision: **trust never overrides strong security evidence.**

1. Using the **same sender address** you just marked as trusted in Scenario 4, send yourself the exact same email as **Scenario 3** (same subject, body, and link).

2. Open it. Expected verdict: **SUSPICIOUS**, same findings as Scenario 3 (the link-text mismatch, the raw IP address, the content combination) — plus a small note: *"You previously marked this sender as trusted."* The point being demonstrated: trusting a sender did **not** make the link-based findings disappear. They're identical to Scenario 3's, appearing on an email from a sender you explicitly said you trust.

**To make this land as HIGH RISK instead of SUSPICIOUS** (a more dramatic demo moment), a real Google-confirmed malicious link or a genuine sender-domain mismatch is needed — neither of which this guide can safely simulate live (the demo link deliberately points nowhere real, and a self-sent Gmail message can't spoof its own From domain). The honest way to show the full HIGH RISK override live is a direct signed API call: see `backend/tests/trustedSender.test.ts` test #16, which does exactly this against a mocked Safe Browsing response and asserts `HIGH_RISK` - or run the same request shape against your deployed backend with `isTrustedSender: true` and a `links` entry your Safe Browsing key has flagged (once Part B is set up).

---

## Attachment scenario — a note on realism

InboxGuard's attachment detector flags disguised double-extension files like `invoice.pdf.exe`. In practice, **Gmail itself already blocks attaching most executable extensions** (`.exe`, `.js`, `.bat`, `.scr`, etc.) directly to outgoing mail — which is a good sign for Gmail users generally, but makes it hard to demo *this specific detector* by actually sending yourself such a file through Gmail's compose window.

Two ways to show it live anyway:

**A. Zipped attachment (works in real Gmail).** Attach any small file inside a `.zip` — InboxGuard's metadata-only design intentionally does not open archive contents, so this triggers the lower-severity "archive attachments can hide dangerous files" finding, which is itself worth showing (it's the conservative, honest behavior described in the README: we don't pretend to see inside a zip).

**B. Direct backend call (proves the stronger detector works).** Since the detector only looks at filename metadata, you can demonstrate it directly against your deployed backend with a signed `curl` request carrying `"filename": "invoice.pdf.exe"` — this is exactly what the Add-on would send if the file had arrived via a mail provider that doesn't block the attachment (many don't). This is also precisely what `backend/tests/analyzeEmail.test.ts` test #7 verifies automatically. Worth pointing out: *"Gmail already blocks the most obvious case client-side — InboxGuard's value is in the cases that get through, whether that's a more obscure extension or a different mail provider."*

---

## Suggested 3–5 minute demo flow

1. **Open Scenario 1** → LOW RISK. "Notice it never claims the email is *safe* — just that nothing suspicious was found, plus the disclaimer at the bottom."
2. **Open Scenario 3** → SUSPICIOUS. Walk through the WHY section findings, then WHAT SHOULD I DO. Point out the words LOW/SUSPICIOUS/HIGH are always visible text, not just a color.
3. **Mention Safe Browsing** briefly: "The Links category also runs every URL against Google Safe Browsing server-side — the Add-on never sees the API key, and if Safe Browsing is down, the analysis still completes using local heuristics. If this exact link were already confirmed malicious by Google, it would jump straight to HIGH RISK regardless of the score."
4. **Show the two user actions**: click into "Block this sender" to show the confirmation step, then explain the "Ignore — I trust this sender" flow using Scenario 4.
5. **Run Scenario 5**: "Here's the one decision I'd highlight most — trusting a sender doesn't mean InboxGuard stops checking their emails." Show that the same findings from Scenario 3 still appear, now alongside the trust note, which stays visually secondary to the verdict.
6. **Briefly show technical details**: expand the Technical Details section, mention the architecture diagram in the README, and that the whole thing is covered by 27 automated tests.
