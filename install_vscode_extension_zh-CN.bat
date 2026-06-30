@echo off
chcp 65001 >nul
setlocal EnableExtensions
set "SCRIPT_DIR=%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%scripts\install_vscode_extension.ps1" -Language "zh-CN"
set "PS_EXIT_CODE=%ERRORLEVEL%"
if %PS_EXIT_CODE% neq 0 (
    echo.
    echo [错误] 安装失败。退出代码: %PS_EXIT_CODE%
) else (
    echo.
    echo 安装完成。请重新启动 VSCode / Antigravity。
)
echo.
echo 按任意键退出...
pause >nul
exit /b %PS_EXIT_CODE%
