# Creates local .lnk shortcuts in the project root. Windows PowerShell 5.1 compatible.
# No Administrator needed; writes only inside this project; does not change execution policy.
$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot
if (-not $Root) { $Root = Split-Path -Parent $MyInvocation.MyCommand.Path }

$items = @(
    @{ Name = 'Launch Ballpoint Pen Demo'; Script = 'tools\windows\Launch-Demo.ps1' },
    @{ Name = 'Build and Preview Demo';    Script = 'tools\windows\Build-And-Preview.ps1' },
    @{ Name = 'Export Demo Video';         Script = 'tools\windows\Export-Video.ps1' }
)

foreach ($i in $items) {
    $p = Join-Path $Root $i.Script
    if (-not (Test-Path -LiteralPath $p -PathType Leaf)) {
        Write-Host "ERROR: required script not found: $p" -ForegroundColor Red
        exit 1
    }
}

try {
    $shell = New-Object -ComObject WScript.Shell
    $psExe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    foreach ($i in $items) {
        $lnk = Join-Path $Root ($i.Name + '.lnk')
        if (Test-Path -LiteralPath $lnk) { Remove-Item -LiteralPath $lnk -Force }
        $target = Join-Path $Root $i.Script
        $s = $shell.CreateShortcut($lnk)
        $s.TargetPath = $psExe
        $s.Arguments = '-NoProfile -ExecutionPolicy Bypass -File "' + $target + '"'
        $s.WorkingDirectory = $Root
        $s.WindowStyle = 1
        $s.Description = $i.Name
        $s.Save()
        if (-not (Test-Path -LiteralPath $lnk)) { throw "shortcut was not created: $lnk" }
        Write-Host "Created: $lnk"
    }
} catch {
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
Write-Host 'All shortcuts created successfully. They are local to this machine and are not stored in Git.' -ForegroundColor Green
