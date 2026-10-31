@echo off
rem Runs Launch-Demo.ps1 for this process only (execution policy is not changed permanently).
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Launch-Demo.ps1"
if errorlevel 1 pause
