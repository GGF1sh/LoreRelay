@echo off
setlocal enabledelayedexpansion

echo ===================================================
echo   Antigravity GM Skill Installer (for LoreRelay)
echo ===================================================
echo.

set "SCRIPT_DIR=%~dp0"
set "SKILL_DEST=%USERPROFILE%\.gemini\config\skills\text-adventure-gm"
set "SKILL_SRC="

if exist "%SCRIPT_DIR%skills\text-adventure-gm\SKILL.md" (
    set "SKILL_SRC=%SCRIPT_DIR%skills\text-adventure-gm"
)

if not defined SKILL_SRC (
    if exist "%SCRIPT_DIR%..\TextAdventureGMSkill\SKILL.md" (
        set "SKILL_SRC=%SCRIPT_DIR%..\TextAdventureGMSkill"
    )
)

if not defined SKILL_SRC (
    echo [エラー] GMスキルが見つかりません。
    echo   次のいずれかを用意してください:
    echo   - %SCRIPT_DIR%skills\text-adventure-gm\
    echo   - %SCRIPT_DIR%..\TextAdventureGMSkill\
    goto :done
)

echo コピー元: %SKILL_SRC%
echo コピー先: %SKILL_DEST%

if not exist "%SKILL_DEST%" mkdir "%SKILL_DEST%"
if not exist "%SKILL_DEST%\scripts" mkdir "%SKILL_DEST%\scripts"

copy /Y "%SKILL_SRC%\SKILL.md" "%SKILL_DEST%\" >nul
if errorlevel 1 (
    echo [エラー] SKILL.md のコピーに失敗しました。
    goto :done
)

for %%f in ("%SKILL_SRC%\scripts\*.py") do copy /Y "%%f" "%SKILL_DEST%\scripts\" >nul
for %%f in ("%SKILL_SRC%\scripts\*.json") do copy /Y "%%f" "%SKILL_DEST%\scripts\" >nul

echo [成功] GMスキルのインストールが完了しました。Antigravity を再起動してください。

:done
echo.
pause