@echo off
setlocal

:: Determine the directory of this batch file
set "SCRIPT_DIR=%~dp0"

:: Run the PowerShell installer script
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%scripts\install_antigravity_skill.ps1" -ProjectDir "%SCRIPT_DIR%scripts"
set "PS_EXIT_CODE=%ERRORLEVEL%"

:: Pause only if there was an error
if %PS_EXIT_CODE% NEQ 0 (
    echo.
    echo Installation failed. Press any key to exit...
    pause >nul
) else (
    echo.
    echo Press any key to exit...
    pause >nul
)

exit /b %PS_EXIT_CODE%