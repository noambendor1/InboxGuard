# Deployment guide (beginner-friendly)

This assumes you have never used Google Cloud, Apps Script, or `clasp` before. Follow the sections in order: **Part A** deploys the backend, **Part B** creates your Safe Browsing key, **Part C** installs the Gmail Add-on, **Part D** covers sharing it with other people. Each step says exactly what to click or type, what to copy, and what success looks like.

**Before you start**, make sure these are installed (all free): [Git](https://git-scm.com/downloads), [Node.js 20+](https://nodejs.org) (`node --version` to check), and the [Google Cloud CLI](https://cloud.google.com/sdk/docs/install) (`gcloud --version` to check — installed in Part A2 below if you don't have it). After installing anything, **close and reopen your terminal** before continuing — a terminal opened before an install won't see the new command yet.

Prefer a single script over following these steps by hand? [`scripts/setup-windows.ps1`](../scripts/setup-windows.ps1) automates everything below except the two Google sign-ins and creating/billing the Cloud project.

---

## Part A — Deploy the backend to Cloud Run

### A1. Create a Google Cloud project (skip if you already have one)

1. Go to <https://console.cloud.google.com/projectcreate>.
2. Enter a project name, e.g. `inboxguard-demo`. Note the **Project ID** shown under it (it may differ from the name, e.g. `inboxguard-demo-123456`) — you'll need it below.
3. Click **Create**. Wait for the notification that the project was created, then select it from the project dropdown at the top of the page.
4. You'll need billing enabled on this project (Cloud Run has a generous free tier, so a small demo like this should cost nothing or close to it). If prompted, go to **Billing** in the left menu and link or create a billing account.

### A2. Install the Google Cloud CLI (`gcloud`), if you don't have it

1. Go to <https://cloud.google.com/sdk/docs/install> and follow the installer for your OS (Windows: download and run the `.exe` installer).
2. After installing, open a **new** terminal window (so it picks up the updated PATH) and run:
   ```bash
   gcloud --version
   ```
   Success looks like: a version number printed, no "command not found" error.

### A3. Log in and select your project

```bash
gcloud auth login
```
This opens a browser window — sign in with the Google account tied to your project. Then:

```bash
gcloud config set project YOUR_PROJECT_ID
```
Replace `YOUR_PROJECT_ID` with the Project ID from step A1.

### A4. Enable the required Google Cloud APIs (one-time)

```bash
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
```
This can take a minute. Success looks like: the command returns to the prompt with no error (it may print "Operation finished successfully").

### A5. Pick a shared secret

This is the password the Gmail Add-on and the backend use to authenticate with each other (HMAC signing). Generate a random one:

```bash
# macOS/Linux:
openssl rand -hex 32
# Windows PowerShell:
-join ((48..57)+(97..102) | Get-Random -Count 64 | ForEach-Object {[char]$_})
```
Copy the output somewhere safe — you'll paste it in two places (Cloud Run env var, and an Apps Script Script Property).

### A6. Deploy

From the `backend/` directory:

```bash
cd backend
gcloud run deploy inboxguard-backend \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars INBOXGUARD_SHARED_SECRET="PASTE_YOUR_SECRET_HERE",SAFE_BROWSING_API_KEY="",MAX_REQUEST_AGE_SECONDS=300
```

- The first time you run this, `gcloud` may ask to enable Artifact Registry or confirm a region — type `y` / press Enter to accept.
- This builds your Dockerfile in the cloud (Cloud Build) and deploys it — it can take a few minutes the first time.
- `--allow-unauthenticated` is required here because InboxGuard uses its own HMAC signing (see the README's "Security & privacy" section) instead of Cloud Run's IAM auth for this demo.
- Leave `SAFE_BROWSING_API_KEY` empty for now — you'll update it in Part B once you have a real key. The app works fine without it (Safe Browsing lookups just report "unavailable" and local heuristics still run).

**Success looks like:** the command ends by printing a **Service URL**, something like:
```
Service URL: https://inboxguard-backend-abc123xyz-uc.a.run.app
```
Copy this URL — you'll need it for the Gmail Add-on's `BACKEND_URL` property.

### A7. Verify it's alive

```bash
curl https://YOUR_SERVICE_URL/health
```
Success looks like: `{"status":"ok"}`.

---

## Part B — Create your Google Safe Browsing API key

### B1. Enable the Safe Browsing API

1. Go to <https://console.cloud.google.com/apis/library/safebrowsing.googleapis.com> (make sure the same project is selected at the top).
2. Click **Enable**. Success looks like: the button changes to show the API is enabled, and you're taken to an API overview page.

### B2. Create an API key

1. Go to <https://console.cloud.google.com/apis/credentials>.
2. Click **+ Create Credentials** → **API key**.
3. A dialog shows your new key. Click **Copy** to copy it, then click **Edit API key** (or find it in the list and click on it) to restrict it.
4. Under **API restrictions**, choose **Restrict key**, then check only **Safe Browsing API** from the list. Click **Save**. This ensures the key can't be used for anything else if it ever leaked.

### B3. Add the key to your deployed backend

```bash
gcloud run services update inboxguard-backend \
  --region us-central1 \
  --update-env-vars SAFE_BROWSING_API_KEY="PASTE_YOUR_SAFE_BROWSING_KEY_HERE"
```

Success looks like: `gcloud` prints the updated service details ending with the Service URL again (unchanged).

---

## Part C — Install the Gmail Add-on

### C1. Install `clasp`

```bash
npm install -g @google/clasp@2.4.2
clasp --version
```
Success looks like: a version number printed. Pin the version to `2.4.2` specifically — newer `clasp` v3 releases have a known `Insufficient Permission` bug on `create` that has nothing to do with your Google account setup.

### C2. Turn on the Apps Script API for your account (one-time, per Google account)

1. Go to <https://script.google.com/home/usersettings>.
2. Toggle **Google Apps Script API** to **On**.

Without this step, `clasp login`/`clasp create` will fail with a permissions error — this is the #1 beginner gotcha.

### C3. Log in with clasp

```bash
clasp login
```
This opens a browser window — sign in with the Google account whose Gmail you want the add-on installed on. Success looks like: the terminal prints "Authorization successful" and a browser tab confirms you can close it.

### C4. Create the Apps Script project

```bash
cd addon
clasp create --type standalone --title "InboxGuard" --rootDir ./src
```

Success looks like: clasp prints a new **Script ID** and a link like `https://script.google.com/d/XXXXXXXXXX/edit`.

> **Two known quirks:** (1) clasp sometimes writes `.clasp.json` inside `addon/src/` instead of `addon/` - if so, move it up a level (`mv src/.clasp.json .` from the `addon/` folder) before continuing, otherwise `clasp push` looks for source files in a non-existent `src/src/` folder. (2) If clasp also writes a fresh, empty `appsscript.json` or `Code.js` into `addon/src/` that overwrites the ones already in this repo, that's expected too — the next step re-pushes our real source files over whatever clasp just generated.

### C5. Push the real source code

```bash
clasp push --force
```
Success looks like: clasp lists every file it uploaded (`appsscript.json`, `Code.js`, `EmailExtractor.js`, etc.) with no errors.

### C6. Configure Script Properties (the Add-on's two settings)

1. Open the project in the browser: `clasp open` (or use the URL from step C4).
2. In the Apps Script editor, click the **gear icon (Project Settings)** in the left sidebar.
3. Scroll down to **Script Properties** → click **Add script property**.
4. Add these two properties:
   | Property | Value |
   |---|---|
   | `BACKEND_URL` | The Cloud Run Service URL from step A6, e.g. `https://inboxguard-backend-abc123xyz-uc.a.run.app` |
   | `INBOXGUARD_SHARED_SECRET` | The **exact same** secret you used in step A5/A6 |
5. Click **Save script properties**.

**Success looks like:** both properties are listed on the page after saving.

### C7. Install a test deployment for your own Gmail account

1. Back in the Apps Script editor, click **Deploy** (top right) → **Test deployments**.
2. In the dialog that appears, click **Install** (this installs the add-on for your own account only — nothing is published publicly).
3. Click **Done**.

### C8. Open Gmail and grant permission

1. Go to <https://mail.google.com> and refresh the page.
2. Open any email. Look at the **vertical icon rail on the far right edge of the Gmail window** — the same strip where the Calendar, Tasks, and Keep icons live. InboxGuard's icon looks like this (a blue shield):

   <img src="https://www.gstatic.com/images/icons/material/system/2x/security_googblue_48dp.png" alt="InboxGuard icon: a blue shield" width="40" />

   It will be the last icon at the bottom of that rail (Gmail adds custom Add-ons after the built-in ones). Click it — a panel opens on the right side of the screen with the InboxGuard header.
3. The first time, Google shows a consent screen listing what InboxGuard can access (the current email, Gmail filter settings, and permission to connect to your backend). Since this is your own unpublished test add-on, you may see a **"Google hasn't verified this app"** warning — this is expected for a personal test deployment. Click **Advanced**, then **Go to InboxGuard (unsafe)**, then **Allow**. ("Unsafe" here just means Google hasn't run its formal verification review on this specific unpublished project — not that anything is actually wrong.)

**Success looks like:** the InboxGuard sidebar shows a risk verdict for the currently open email within a few seconds.

### If something doesn't show up

- **Icon doesn't appear in Gmail:** hard-refresh Gmail (Ctrl/Cmd+Shift+R), and double check step C7 was completed.
- **"We couldn't analyze this email" / connection error:** double-check `BACKEND_URL` in Script Properties has no trailing slash and is the exact Cloud Run URL from `gcloud run deploy`. Test it directly: `curl https://YOUR_SERVICE_URL/health`.
- **Signature/auth errors:** the two `INBOXGUARD_SHARED_SECRET` values (Cloud Run env var and Script Property) must match **exactly**, character for character.

---

## Part D — Letting someone else use *this* installation (without them deploying anything)

Everything above sets up InboxGuard for your own Gmail account. If someone else wants to try it too, there are two different paths depending on how many people and how permanently.

### D1. Share your existing installation with a specific person (fast, no cost to them)

This lets a specific person install and use the exact copy you already deployed — your backend, your Cloud Run billing, your Apps Script project — without them creating anything of their own.

1. **Add them as a Test user.** Go to <https://console.cloud.google.com/apis/credentials/consent?project=YOUR_PROJECT_ID>, confirm **Publishing status** is **Testing**, scroll to **Test users** → **+ ADD USERS**, and enter their Gmail address. (Up to 100 people at a time.)
2. **Share the Apps Script project with them.** Open the project (`clasp open`), click **Share** (top right), add the same email address with **Viewer** access, and send them the link.
3. **They open the link**, go to **Deploy** → **Test deployments** → **Install**, and approve the same "Google hasn't verified this app" consent screen you saw in step C8.
4. They open Gmail — InboxGuard now runs for them too, using your backend and your configuration. They never see your shared secret or Safe Browsing key; Script Properties aren't exposed to other users.

**Two things worth knowing:**
- A test user's authorization **expires 7 days** after they grant it, so add them close to when they'll actually use it rather than far in advance.
- This only works for OAuth scopes classified as "sensitive" (which is what InboxGuard uses) up to the 100-test-user cap. It does not scale beyond that without verification (see D2).

### D2. Publish to the Google Workspace Marketplace (a real public directory)

This is the option that makes an add-on discoverable/installable by anyone, the way a real product would be distributed — but it comes with a real cost in time, not money.

Because InboxGuard requests a sensitive OAuth scope (`gmail.settings.basic`, for the block-sender filter), Google requires an **OAuth verification review** before the app can be used by more than the 100 test users above. As of this writing, that review typically takes **2-6 weeks**, and also expects a hosted privacy policy and a verified domain. This is a genuine, deliberate security measure Google applies to any app requesting access to Gmail data or settings - not something specific to this project, and not something a script or workaround can shortcut.

For a take-home/demo project on a short timeline, D1 (or simply cloning the repo and deploying a personal copy, per the Quick Start) is the practical choice. Marketplace publication is listed here as the correct answer to "how would this become a real, publicly-installable product" - worth understanding, not worth pursuing for this purpose.

Sources: [Manage App Audience](https://support.google.com/cloud/answer/15549945), [When is verification not needed](https://support.google.com/cloud/answer/13464323), [Configure OAuth for Workspace Marketplace](https://developers.google.com/workspace/marketplace/configure-oauth-consent-screen).

---

## Redeploying after code changes

Backend:
```bash
cd backend
npm test && npm run build
gcloud run deploy inboxguard-backend --source . --region us-central1
```

Add-on:
```bash
cd addon
clasp push --force
```
Apps Script changes take effect immediately on the next add-on open — no separate "redeploy" step needed for a test deployment.
