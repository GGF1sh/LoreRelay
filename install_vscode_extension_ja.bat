@echo off
setlocal EnableExtensions
set "SCRIPT_DIR=%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%scripts\install_vscode_extension.ps1" -Language "ja"
set "PS_EXIT_CODE=%ERRORLEVEL%"
if %PS_EXIT_CODE% NEQ 0 (
    echo.
    echo インストールに失敗しました。何かキーを押して終了してください...
    pause >nul
) else (
    echo.
    echo 何かキーを押して終了してください...
    pause >nul
)
exit /b %PS_EXIT_CODE%
