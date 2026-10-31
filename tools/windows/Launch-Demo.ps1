# One-click dev demo: starts the Vite dev server on 127.0.0.1:5173 and opens the browser.
# Windows PowerShell 5.1 compatible. Does not need Administrator; does not change execution policy.
$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = Split-Path -Parent (Split-Path -Parent $ScriptDir)   # tools/windows -> project root
Set-Location -LiteralPath $ProjectDir
$Url = 'http://127.0.0.1:5173/'

function Stop-WithError([string]$Message) {
    Write-Host ''
    Write-Host "ERROR: $Message" -ForegroundColor Red
    Read-Host 'Press Enter to close'
    exit 1
}

function Test-Url([string]$u) {
    try { $r = Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 2; return $r } catch { return $null }
}

Write-Host 'Click Pen Teardown - demo launcher' -ForegroundColor Cyan
Write-Host "Project: $ProjectDir"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Stop-WithError 'node.exe was not found. Install Node.js 20 or newer from https://nodejs.org/' }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { Stop-WithError 'npm was not found. Install Node.js 20 or newer from https://nodejs.org/' }

# Is something already on port 5173?
$busy = $false
try { $busy = [bool](Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue) } catch { $busy = $false }
if ($busy) {
    $resp = Test-Url $Url
    if ($resp -and $resp.Content -match 'Click Pen Teardown') {
        Write-Host 'The demo is already running on port 5173. Opening the browser.' -ForegroundColor Green
        Start-Process $Url
        exit 0
    }
    Stop-WithError 'Port 5173 is in use by something other than this project. Close that program and run this launcher again.'
}

if (-not (Test-Path -LiteralPath (Join-Path $ProjectDir 'node_modules'))) {
    Write-Host 'node_modules not found - running npm install (one time)...' -ForegroundColor Yellow
    & npm install
    if ($LASTEXITCODE -ne 0) { Stop-WithError 'npm install failed.' }
}

Write-Host 'Starting the dev server. Press Ctrl+C in this window to stop it.' -ForegroundColor Green
# Open the browser from a background job once the server answers, while the server runs in this window.
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
    & npm run dev
} finally {
    Stop-Job $opener -ErrorAction SilentlyContinue
    Remove-Job $opener -Force -ErrorAction SilentlyContinue
}
