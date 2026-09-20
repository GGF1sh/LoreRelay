@echo off
chcp 65001 >nul
setlocal EnableExtensions
set "SCRIPT_DIR=%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%scripts\install_vscode_extension.ps1" -Language "en"
set "PS_EXIT_CODE=%ERRORLEVEL%"
if %PS_EXIT_CODE% neq 0 (
    echo [ERROR] Installation script failed with exit code %PS_EXIT_CODE%.
)
echo.
echo Press any key to exit...
pause >nul
exit /b %PS_EXIT_CODE%
