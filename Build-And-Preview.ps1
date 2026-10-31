# One-click production preview: npm run build, then vite preview, then open the browser.
# Windows PowerShell 5.1 compatible. No Administrator, no execution-policy change.
$ErrorActionPreference = 'Stop'
$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $ProjectDir
# The production build uses the GitHub Pages subpath, so the preview lives under it too.
$Url = 'http://127.0.0.1:4173/Ballpoint-Pen-Teardown/'

function Stop-WithError([string]$Message) {
    Write-Host ''
    Write-Host "ERROR: $Message" -ForegroundColor Red
    Read-Host 'Press Enter to close'
    exit 1
}

Write-Host 'Click Pen Teardown - build and preview' -ForegroundColor Cyan
Write-Host "Project: $ProjectDir"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Stop-WithError 'node.exe was not found. Install Node.js 20 or newer from https://nodejs.org/' }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { Stop-WithError 'npm was not found. Install Node.js 20 or newer from https://nodejs.org/' }

$busy = $false
try { $busy = [bool](Get-NetTCPConnection -LocalPort 4173 -State Listen -ErrorAction SilentlyContinue) } catch { $busy = $false }
if ($busy) { Stop-WithError 'Port 4173 is already in use. Close the other preview and run this launcher again.' }

if (-not (Test-Path -LiteralPath (Join-Path $ProjectDir 'node_modules'))) {
    Write-Host 'node_modules not found - running npm install (one time)...' -ForegroundColor Yellow
    & npm install
    if ($LASTEXITCODE -ne 0) { Stop-WithError 'npm install failed.' }
}

Write-Host 'Building...' -ForegroundColor Yellow
& npm run build
if ($LASTEXITCODE -ne 0) { Stop-WithError 'npm run build failed.' }

Write-Host 'Starting the preview server. Press Ctrl+C in this window to stop it.' -ForegroundColor Green
$opener = Start-Job -ScriptBlock {
    param($u)
    for ($i = 0; $i -lt 120; $i++) {
        try {
            $r = Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 2
            if ($r.StatusCode -eq 200) { Start-Process $u; return }
        } catch { }
        Start-Sleep -Milliseconds 500
    }
} -ArgumentList $Url
try {
    & npm run preview
} finally {
    Stop-Job $opener -ErrorAction SilentlyContinue
    Remove-Job $opener -Force -ErrorAction SilentlyContinue
}
