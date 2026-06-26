@echo off
setlocal EnableExtensions

set "SCRIPT_DIR=%~dp0"

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%scripts\update_lorerelay.ps1" -ProjectDir "%SCRIPT_DIR%scripts"
set "PS_EXIT_CODE=%ERRORLEVEL%"

if %PS_EXIT_CODE% NEQ 0 (
    echo.
    echo Update failed. Press any key to exit...
    pause >nul
) else (
    echo.
    echo Press any key to exit...
    pause >nul
)

exit /b %PS_EXIT_CODE%