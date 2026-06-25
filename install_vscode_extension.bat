@echo off
setlocal enabledelayedexpansion

echo ===================================================
echo   LoreRelay VSCode Extension Installer
echo ===================================================
echo.

echo VSCode 拡張機能 (LoreRelay) をインストールしています...
:: フォルダ内の .vsix ファイルを探してインストール
for %%f in (*.vsix) do (
    set "VSIX_FILE=%%f"
)

if "!VSIX_FILE!"=="" (
    echo [エラー] .vsix ファイルが見つかりません。
) else (
    echo インストール中: !VSIX_FILE!
    call code --install-extension "!VSIX_FILE!" --force
    if !errorlevel! neq 0 (
        echo [エラー] VSCode拡張のインストールに失敗しました。'code' コマンドにパスが通っているか確認してください。
    ) else (
        echo [成功] VSCode拡張機能のインストールが完了しました！VSCodeを再起動してください。
    )
)

echo.
pause
