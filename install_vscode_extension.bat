@echo off
setlocal enabledelayedexpansion

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install_vscode_extension.ps1" -ProjectDir "%~dp0."

echo.
pause
