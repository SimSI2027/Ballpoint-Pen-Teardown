@echo off
rem Runs Build-And-Preview.ps1 for this process only (execution policy is not changed permanently).
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Build-And-Preview.ps1"
if errorlevel 1 pause
