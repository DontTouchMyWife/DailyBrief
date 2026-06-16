#Requires -Version 5.1
<#
.SYNOPSIS
  Create GitHub repo, push this project, configure Actions secrets, trigger first run.

.PREREQUISITE
  gh auth login

.EXAMPLE
  pwsh scripts/setup-github.ps1
  pwsh scripts/setup-github.ps1 -RepoName DailyBrief -Visibility public
#>
param(
  [string]$RepoName = "DailyBrief",
  [ValidateSet("public", "private")]
  [string]$Visibility = "public",
  [string]$EnvFile = "C:\Users\zhewe\daily-brief\.env.local"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

function Read-EnvFile([string]$Path) {
  $map = @{}
  if (-not (Test-Path $Path)) { return $map }
  Get-Content $Path | ForEach-Object {
    if ($_ -match '^\s*#' -or $_ -notmatch '=') { return }
    $k, $v = $_ -split '=', 2
    $map[$k.Trim()] = $v.Trim()
  }
  return $map
}

Write-Host "=== DailyBrief GitHub setup ===" -ForegroundColor Cyan

gh auth status | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Host "请先运行: gh auth login" -ForegroundColor Red
  exit 1
}

$User = (gh api user -q .login)
Write-Host "GitHub user: $User"

$envMap = Read-EnvFile $EnvFile
if ($envMap.Count -eq 0) {
  Write-Host "未找到 $EnvFile，请确认本地 .env.local 存在" -ForegroundColor Red
  exit 1
}

# --- git init / commit ---
if (-not (Test-Path ".git")) {
  git init
  git branch -M main
}
git add -A
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
  git commit -m "DailyBrief: GitHub Actions + email deploy (custom sources)"
}

# --- create repo if needed ---
$remote = git remote get-url origin 2>$null
if (-not $remote) {
  gh repo create $RepoName --$Visibility --source=. --remote=origin --push
} else {
  Write-Host "Remote exists: $remote"
  git push -u origin main
}

$Repo = "$User/$RepoName"
Write-Host "Repository: https://github.com/$Repo"

# --- secrets ---
function Set-GhSecret([string]$Name, [string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) {
    Write-Host "  skip secret $Name (empty)"
    return
  }
  $Value | gh secret set $Name --repo $Repo
  Write-Host "  secret $Name OK"
}

Set-GhSecret "DEEPSEEK_API_KEY" $envMap["DEEPSEEK_API_KEY"]
Set-GhSecret "SMTP_USER" $envMap["SMTP_USER"]
Set-GhSecret "SMTP_PASS" $envMap["SMTP_PASS"]
Set-GhSecret "NOTIFY_EMAIL_TO" $envMap["NOTIFY_EMAIL_TO"]
Set-GhSecret "SMTP_HOST" ($(if ($envMap["SMTP_HOST"]) { $envMap["SMTP_HOST"] } else { "smtp.qq.com" }))
Set-GhSecret "SMTP_PORT" ($(if ($envMap["SMTP_PORT"]) { $envMap["SMTP_PORT"] } else { "465" }))
Set-GhSecret "SMTP_SECURE" ($(if ($envMap["SMTP_SECURE"]) { $envMap["SMTP_SECURE"] } else { "true" }))

# --- variables ---
function Set-GhVar([string]$Name, [string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) { return }
  gh variable set $Name --body $Value --repo $Repo
  Write-Host "  variable $Name = $Value"
}

Set-GhVar "LLM_BACKEND" ($(if ($envMap["LLM_BACKEND"]) { $envMap["LLM_BACKEND"] } else { "deepseek" }))
Set-GhVar "REPORT_TZ" ($(if ($envMap["REPORT_TZ"]) { $envMap["REPORT_TZ"] } else { "Asia/Shanghai" }))
Set-GhVar "REPORT_HOUR" "9"
Set-GhVar "REPORT_DAYS" "*"
Set-GhVar "NOTIFY_EMAIL_ATTACH" ($(if ($envMap["NOTIFY_EMAIL_ATTACH"]) { $envMap["NOTIFY_EMAIL_ATTACH"] } else { "true" }))

# --- workflow permissions hint ---
Write-Host ""
Write-Host "请在 GitHub 网页确认:" -ForegroundColor Yellow
Write-Host "  Settings -> Actions -> General -> Workflow permissions -> Read and write"
Write-Host "  Settings -> Actions -> General -> Allow all actions"
Write-Host ""

# --- trigger workflow ---
Write-Host "Triggering first workflow run..."
gh workflow run daily.yml --repo $Repo
Start-Sleep -Seconds 3
gh run list --repo $Repo --limit 3

Write-Host ""
Write-Host "Done!" -ForegroundColor Green
Write-Host "Actions: https://github.com/$Repo/actions"
Write-Host "Pages (after first success): https://$User.github.io/$RepoName/"
