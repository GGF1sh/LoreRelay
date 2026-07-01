@echo off
setlocal EnableExtensions
set "SCRIPT_DIR=%~dp0"

echo [LoreRelay] Installing to Antigravity IDE only...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%scripts\install_vscode_extension.ps1" -Target "antigravity"
set "PS_EXIT_CODE=%ERRORLEVEL%"

echo.
echo Press any key to exit...
pause >nul
exit /b %PS_EXIT_CODE%
