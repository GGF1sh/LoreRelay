@echo off
setlocal enabledelayedexpansion

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install_antigravity_skill.ps1" -ProjectDir "%~dp0."

echo.
pause