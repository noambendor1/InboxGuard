<#
.SYNOPSIS
  Automated setup for InboxGuard on Windows.

.DESCRIPTION
  Checks for git, Node.js, and the Google Cloud CLI, installs anything
  missing via winget (Windows' built-in package manager), then deploys
  the backend to Cloud Run and pushes the Gmail Add-on via clasp.

  Two things this script deliberately does NOT automate:
    - Logging into your Google account (gcloud auth login / clasp login
      each open a real browser window for you to sign in yourself).
    - Creating a Google Cloud project and attaching a billing account -
      Google requires that to be done by a human in the Cloud Console.

  Run this from the repository root:
      .\scripts\setup-windows.ps1

.NOTES
  Requires Windows 10 (1709+) or Windows 11 for winget. If winget isn't
  available, the script tells you exactly what to install manually and
  where from, then stops.
#>

$ErrorActionPreference = "Stop"

function Write-Step($text) {
    Write-Host ""
    Write-Host "==> $text" -ForegroundColor Cyan
}

function Write-Ok($text) {
    Write-Host "    OK: $text" -ForegroundColor Green
}

function Write-Warn($text) {
    Write-Host "    $text" -ForegroundColor Yellow
}

function Test-CommandExists($name) {
    return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

function Update-SessionPath {
    # Re-reads PATH from the registry so a tool installed by winget during
    # this run becomes usable immediately, without closing the terminal.
    $machinePath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
    $userPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = "$machinePath;$userPath"
}

function Install-Prerequisite($displayName, $command, $wingetId) {
    if (Test-CommandExists $command) {
        Write-Ok "$displayName already installed"
        return
    }

    if (-not (Test-CommandExists "winget")) {
        Write-Warn "$displayName is missing, and winget (Windows Package Manager) isn't available on this machine."
        Write-Warn "Install $displayName manually, then re-run this script."
        exit 1
    }

    Write-Warn "$displayName not found. Installing via winget..."
    winget install --id $wingetId -e --source winget --accept-package-agreements --accept-source-agreements
    Update-SessionPath

    if (-not (Test-CommandExists $command)) {
        Write-Warn "$displayName was installed but isn't on PATH yet in this session."
        Write-Warn "Close this terminal, open a new one, and re-run this script."
        exit 1
    }
    Write-Ok "$displayName installed"
}

# --- 1. Prerequisites ---------------------------------------------------

Write-Step "Checking prerequisites"
Install-Prerequisite "Git" "git" "Git.Git"
Install-Prerequisite "Node.js" "node" "OpenJS.NodeJS.LTS"
Install-Prerequisite "Google Cloud CLI" "gcloud" "Google.CloudSDK"

# --- 2. Google Cloud login + project -------------------------------------

Write-Step "Google Cloud login"
Write-Host "A browser window will open. Sign in with the Google account you want to use for deployment."
gcloud auth login

Write-Step "Google Cloud project"
$existingProjects = (gcloud projects list --format="value(projectId)" 2>$null)
if ($existingProjects) {
    Write-Host "Existing projects on this account:"
    Write-Host $existingProjects
}
$projectId = Read-Host "Enter the Google Cloud Project ID to use (create one first at https://console.cloud.google.com/projectcreate if you don't have one, with billing enabled)"
gcloud config set project $projectId

$billingEnabled = (gcloud billing projects describe $projectId --format="value(billingEnabled)" 2>$null)
if ($billingEnabled -ne "True") {
    Write-Warn "Billing does not appear to be enabled on project '$projectId'."
    Write-Warn "Enable it at: https://console.cloud.google.com/billing/linkedaccount?project=$projectId"
    Write-Warn "Then re-run this script."
    exit 1
}
Write-Ok "Billing is enabled on '$projectId'"

# --- 3. Enable required APIs ---------------------------------------------

Write-Step "Enabling required Google Cloud APIs"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
Write-Ok "APIs enabled"

# --- 4. Deploy the backend -------------------------------------------------

Write-Step "Generating a shared secret and deploying the backend to Cloud Run"
$hexChars = [char[]]"0123456789abcdef"
$sharedSecret = -join (1..64 | ForEach-Object { Get-Random -InputObject $hexChars })

Push-Location "$PSScriptRoot\..\backend"
try {
    gcloud run deploy inboxguard-backend `
        --source . `
        --region us-central1 `
        --allow-unauthenticated `
        --quiet `
        --set-env-vars "INBOXGUARD_SHARED_SECRET=$sharedSecret,SAFE_BROWSING_API_KEY=,MAX_REQUEST_AGE_SECONDS=300"
} finally {
    Pop-Location
}

$serviceUrl = (gcloud run services describe inboxguard-backend --region us-central1 --format "value(status.url)").Trim()
Write-Ok "Backend deployed at $serviceUrl"

$healthCheck = try { (Invoke-WebRequest -Uri "$serviceUrl/health" -UseBasicParsing).StatusCode } catch { $null }
if ($healthCheck -eq 200) {
    Write-Ok "/health responded 200"
} else {
    Write-Warn "/health did not respond as expected - check the Cloud Run logs if the Add-on can't reach the backend later."
}

# --- 5. Install and configure the Gmail Add-on ----------------------------

Write-Step "Installing clasp (Google's Apps Script CLI)"
if (-not (Test-CommandExists "clasp")) {
    npm install -g @google/clasp@2.4.2
    Update-SessionPath
} else {
    Write-Ok "clasp already installed"
}

Write-Step "Google login for the Gmail Add-on"
Write-Host "A browser window will open. Sign in with the Gmail account you want InboxGuard installed on."
clasp login

Write-Step "Creating and pushing the Apps Script project"
Push-Location "$PSScriptRoot\..\addon"
try {
    if (-not (Test-Path ".clasp.json")) {
        clasp create --type standalone --title "InboxGuard" --rootDir ./src
        # clasp sometimes writes .clasp.json inside rootDir instead of here.
        if (Test-Path "src\.clasp.json") {
            Move-Item "src\.clasp.json" ".clasp.json" -Force
        }
    } else {
        Write-Ok "Apps Script project already exists (.clasp.json found)"
    }
    clasp push --force
} finally {
    Pop-Location
}
Write-Ok "Add-on code pushed"

# --- 6. Final manual steps (cannot be automated) ---------------------------

Write-Step "Almost done - two manual steps remain"
Write-Host ""
Write-Host "1. Run 'clasp open' (from the addon/ folder) to open the Apps Script editor," -ForegroundColor Yellow
Write-Host "   then: Project Settings -> Script Properties -> Add script property, twice:" -ForegroundColor Yellow
Write-Host ""
Write-Host "     BACKEND_URL              = $serviceUrl" -ForegroundColor White
Write-Host "     INBOXGUARD_SHARED_SECRET = $sharedSecret" -ForegroundColor White
Write-Host ""
Write-Host "2. In the same editor: Deploy -> Test deployments -> Install -> Done." -ForegroundColor Yellow
Write-Host ""
Write-Host "Then open Gmail, open any email, and click the InboxGuard icon (blue shield)" -ForegroundColor Yellow
Write-Host "in the right-hand icon rail, next to Calendar/Tasks/Keep." -ForegroundColor Yellow
Write-Host ""
Write-Host "(These two steps require clicking inside the Apps Script editor UI - there is" -ForegroundColor DarkGray
Write-Host "no API for managing Script Properties or installing a test deployment.)" -ForegroundColor DarkGray
