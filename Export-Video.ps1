# One-click video export: renders the deterministic film and encodes MP4 + contact sheet into output/.
# Windows PowerShell 5.1 compatible. No Administrator, no execution-policy change.
$ErrorActionPreference = 'Stop'
$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $ProjectDir

function Stop-WithError([string]$Message) {
    Write-Host ''
    Write-Host "ERROR: $Message" -ForegroundColor Red
    Read-Host 'Press Enter to close'
    exit 1
}

Write-Host 'Click Pen Teardown - video export' -ForegroundColor Cyan
Write-Host "Project: $ProjectDir"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Stop-WithError 'node.exe was not found. Install Node.js 20 or newer from https://nodejs.org/' }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { Stop-WithError 'npm was not found. Install Node.js 20 or newer from https://nodejs.org/' }
# FFmpeg (system or Playwright) is verified by the export script itself, which prints one install instruction if neither can encode H.264.

if (-not (Test-Path -LiteralPath (Join-Path $ProjectDir 'node_modules'))) {
    Write-Host 'node_modules not found - running npm install (one time)...' -ForegroundColor Yellow
    & npm install
    if ($LASTEXITCODE -ne 0) { Stop-WithError 'npm install failed.' }
}

Write-Host 'Rendering frames and encoding (this takes several minutes)...' -ForegroundColor Yellow
& npm run video
if ($LASTEXITCODE -ne 0) { Stop-WithError 'Video export failed. See the messages above.' }

Write-Host ''
Write-Host 'Finished. Files are in the output folder.' -ForegroundColor Green
$outDir = Join-Path $ProjectDir 'output'
if (Test-Path -LiteralPath $outDir) { Start-Process explorer.exe $outDir }
Read-Host 'Press Enter to close'
