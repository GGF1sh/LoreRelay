@echo off
setlocal EnableExtensions
set "SCRIPT_DIR=%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%scripts\install_vscode_extension.ps1" -Language "zh-TW"
set "PS_EXIT_CODE=%ERRORLEVEL%"
if %PS_EXIT_CODE% NEQ 0 (
    echo.
    echo 安裝失敗。按任意鍵退出...
    pause >nul
) else (
    echo.
    echo 按任意鍵退出...
    pause >nul
)
exit /b %PS_EXIT_CODE%
