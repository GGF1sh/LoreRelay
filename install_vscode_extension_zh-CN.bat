@echo off
chcp 65001 >nul
setlocal EnableExtensions
set "SCRIPT_DIR=%~dp0"

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%scripts\install_vscode_extension.ps1" -Language "zh-CN"
set "PS_EXIT_CODE=%ERRORLEVEL%"

if %PS_EXIT_CODE% neq 0 (
    echo.
    echo [ERROR] install_vscode_extension.ps1 failed. Exit code: %PS_EXIT_CODE%
) else (
    echo.
    echo Installation complete. Please restart VSCode / Antigravity.
)

echo.
echo Press any key to exit...
pause >nul
exit /b %PS_EXIT_CODE%
