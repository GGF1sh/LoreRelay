@echo off
setlocal
cd /d "%~dp0"
call npm run test:console
exit /b %ERRORLEVEL%
