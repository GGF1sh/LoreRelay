@echo off
chcp 65001 >nul
setlocal EnableExtensions
set "SCRIPT_DIR=%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%scripts\install_vscode_extension.ps1" -Language "ja"
set "PS_EXIT_CODE=%ERRORLEVEL%"
if %PS_EXIT_CODE% neq 0 (
    echo.
    echo [エラー] インストールに失敗しました。終了コード: %PS_EXIT_CODE%
) else (
    echo.
    echo インストールが完了しました。VSCode / Antigravity を再起動してください。
)
echo.
echo 何かキーを押すと終了します...
pause >nul
exit /b %PS_EXIT_CODE%
