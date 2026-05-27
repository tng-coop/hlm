@echo off
echo Starting installation... please wait.
powershell.exe -ExecutionPolicy Bypass -NoProfile -WindowStyle Normal -File "%~dp0install.ps1"
pause
