@echo off
rem Runs Export-Video.ps1 for this process only (execution policy is not changed permanently).
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Export-Video.ps1"
if errorlevel 1 pause
