@echo off
chcp 65001 >nul
setlocal EnableExtensions
set "SCRIPT_DIR=%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%scripts\install_vscode_extension.ps1" -Language "zh-TW"
set "PS_EXIT_CODE=%ERRORLEVEL%"
if %PS_EXIT_CODE% neq 0 (
    echo.
    echo [錯誤] 安裝失敗。結束代碼: %PS_EXIT_CODE%
) else (
    echo.
    echo 安裝完成。請重新啟動 VSCode / Antigravity。
)
echo.
echo 按任意鍵結束...
pause >nul
exit /b %PS_EXIT_CODE%
