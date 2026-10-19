@echo off
setlocal EnableExtensions DisableDelayedExpansion
powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File "%~dp0scripts\start_browser_adventure.ps1" -InputFile "%~1"
if errorlevel 1 pause
