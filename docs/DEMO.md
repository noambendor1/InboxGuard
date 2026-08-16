# Demo guide

Five safe, self-contained sample emails you can send to your own inbox, plus a 3–5 minute demo flow. Nothing here is real malware — every "dangerous" link points at a private/non-routable address or a domain that doesn't resolve to anything, and InboxGuard never visits links anyway (see README §8). Don't click the demo links regardless.

All five scenarios assume you have the Gmail Add-on installed (see `docs/DEPLOYMENT.md`, Part C) and are sending emails **to yourself** from your own Gmail account (or any account — the point is just that they land in an inbox where you have the add-on installed).

## How to send a sample email

1. In Gmail, click **Compose**.
2. Address it **to yourself**.
3. Copy the subject and body below.
4. For scenarios that need a link where the **visible text differs from the actual URL** (#3 and #5), don't just paste a URL — use Gmail's **Insert link** tool (the chain-link icon in the compose toolbar) so you can set the display text and the destination URL independently.
5. Send, then open the email and click the InboxGuard icon in the right-hand sidebar.

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

## Scenario 3 — Simulated phishing → HIGH RISK

**Subject:** Urgent: Verify your account immediately

**Body:**
```
Your account has been suspended due to unusual activity.

To restore access, please verify your account immediately by confirming
your password below. You must act within 24 hours or your account will be
permanently closed.

Verify my account: [insert link below]
```

For the link: use **Insert link**, set the display text to `https://paypal.com/login`, and set the actual URL to `http://192.168.10.5/login/verify`.

Also set the **From/sender display name** to something like "PayPal Security" if your mail client lets you set a display name that doesn't match your actual address (many don't — if not, this specific finding just won't fire, which is fine; the link + content signals alone are enough to reach HIGH RISK). Expected verdict: **HIGH RISK** — look for "Link text does not match its destination," "A link points to a raw IP address," and the content combination finding.

---

## Scenario 4 — Trusted sender, benign email

1. First, send yourself **Scenario 1** again but from a second address you control (or just reuse Scenario 1).
2. Open it, click **Ignore — I trust this sender** in the InboxGuard sidebar.
3. Confirm you see "You marked this sender as trusted."
4. Reopen the email (or click **Analyze Again**) — you should now see the small note *"You previously marked this sender as trusted"* alongside the still-LOW-RISK verdict.

---

## Scenario 5 — Trusted sender whose email contains a malicious-looking signal

This demonstrates the most important product decision: **trust never overrides strong security evidence.**

1. Using the **same sender address** you just marked as trusted in Scenario 4, send yourself:

   **Subject:** Here's that file you asked for

   **Body:**
   ```
   Hey, sorry for the delay — here's the link to the shared file.
   ```
   Link (via Insert link): display text `Open shared file`, destination `http://192.168.10.5/login/verify` (the same IP-based link from Scenario 3).

2. Open it. Expected verdict: **HIGH RISK**, with the summary reading *"You previously trusted this sender, but this message contains strong security risks."* The trust note is shown, but small and secondary — the HIGH RISK verdict is what's visually dominant.

---

## Attachment scenario — a note on realism

InboxGuard's attachment detector flags disguised double-extension files like `invoice.pdf.exe`. In practice, **Gmail itself already blocks attaching most executable extensions** (`.exe`, `.js`, `.bat`, `.scr`, etc.) directly to outgoing mail — which is a good sign for Gmail users generally, but makes it hard to demo *this specific detector* by actually sending yourself such a file through Gmail's compose window.

Two ways to show it live anyway:

**A. Zipped attachment (works in real Gmail).** Attach any small file inside a `.zip` — InboxGuard's metadata-only design intentionally does not open archive contents, so this triggers the lower-severity "archive attachments can hide dangerous files" finding, which is itself worth showing (it's the conservative, honest behavior described in the README: we don't pretend to see inside a zip).

**B. Direct backend call (proves the stronger detector works).** Since the detector only looks at filename metadata, you can demonstrate it directly against your deployed backend with a signed `curl` request carrying `"filename": "invoice.pdf.exe"` — this is exactly what the Add-on would send if the file had arrived via a mail provider that doesn't block the attachment (many don't). This is also precisely what `backend/tests/analyzeEmail.test.ts` test #7 verifies automatically. Worth pointing out: *"Gmail already blocks the most obvious case client-side — InboxGuard's value is in the cases that get through, whether that's a more obscure extension or a different mail provider."*

---

## Suggested 3–5 minute demo flow

1. **Open Scenario 1** → LOW RISK. "Notice it never claims the email is *safe* — just that nothing suspicious was found, plus the disclaimer at the bottom."
2. **Open Scenario 3** → HIGH RISK. Walk through the WHY section findings, then WHAT SHOULD I DO. Point out the words LOW/SUSPICIOUS/HIGH are always visible text, not just a color.
3. **Mention Safe Browsing** briefly: "The Links category also runs every URL against Google Safe Browsing server-side — the Add-on never sees the API key, and if Safe Browsing is down, the analysis still completes using local heuristics."
4. **Show the two user actions**: click into "Block this sender" to show the confirmation step, then explain the "Ignore — I trust this sender" flow using Scenario 4.
5. **Run Scenario 5**: "Here's the one decision I'd highlight most — trusting Alice doesn't mean InboxGuard stops checking Alice's emails. If her account is compromised, we still catch it." Show the HIGH RISK verdict despite the trust note.
6. **Briefly show technical details**: expand the Technical Details section, mention the architecture diagram in the README, and that the whole thing is covered by 27 automated tests.
