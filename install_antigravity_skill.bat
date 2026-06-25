@echo off
setlocal enabledelayedexpansion

echo ===================================================
echo   Antigravity GM Skill Installer (for LoreRelay)
echo ===================================================
echo.

echo Antigravity 用の GM スキルをインストールしています...

set "SKILL_SRC=.\skills\text-adventure-gm"
set "SKILL_DEST=%USERPROFILE%\.gemini\config\skills\text-adventure-gm"

if not exist "%SKILL_SRC%" (
    echo [エラー] スキルフォルダ (%SKILL_SRC%) が見つかりません。インストーラの構成を確認してください。
) else (
    echo コピー先: %SKILL_DEST%
    :: 既存のフォルダがあれば上書きするために /E /I /Y を使用
    xcopy "%SKILL_SRC%" "%SKILL_DEST%" /E /I /Y >nul
    if !errorlevel! neq 0 (
        echo [エラー] スキルのコピーに失敗しました。
    ) else (
        echo [成功] GMスキルのインストールが完了しました！Antigravity (Gemini IDE) を再起動してください。
    )
)

echo.
pause
