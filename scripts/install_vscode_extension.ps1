param(
    [string]$ProjectDir = $PSScriptRoot
)

# Force console output encoding to UTF-8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# Determine language code
$culture = [System.Globalization.CultureInfo]::CurrentUICulture.Name
$lang = "en"
if ($culture -like "ja*") { $lang = "ja" }
elseif ($culture -eq "zh-CN" -or $culture -like "zh-Hans*") { $lang = "zh-CN" }
elseif ($culture -eq "zh-TW" -or $culture -like "zh-Hant*" -or $culture -eq "zh-HK" -or $culture -eq "zh-MO") { $lang = "zh-TW" }

# Path to installer locales
$jsonPath = Join-Path $ProjectDir "locales\installer.json"
$msg = $null

if (Test-Path $jsonPath) {
    try {
        $jsonContent = [System.IO.File]::ReadAllText($jsonPath, [System.Text.Encoding]::UTF8)
        $locales = ConvertFrom-Json $jsonContent
        $msg = $locales.$lang
    } catch {
        # Ignore and fallback
    }
}

# Fallback to English if json loading fails or key is missing
if ($null -eq $msg) {
    $msg = @{
        vscode_title = "  LoreRelay VSCode Extension Installer"
        vscode_installing = "Installing VSCode extension (LoreRelay)..."
        vscode_installing_file = "Installing: {0}"
        vscode_err_no_vsix = "[Error] .vsix file not found in current directory."
        vscode_err_failed = "[Error] Failed to install VSCode extension. Please make sure the 'code' command is in your PATH."
        vscode_success = "[Success] VSCode extension installed successfully! Please restart VSCode."
    }
}

Write-Host "==================================================="
Write-Host $msg.vscode_title
Write-Host "==================================================="
Write-Host ""
Write-Host $msg.vscode_installing

# Find .vsix
$vsixFiles = Get-ChildItem -Path $ProjectDir -Filter "*.vsix"
if ($vsixFiles.Count -eq 0) {
    Write-Host $msg.vscode_err_no_vsix -ForegroundColor Red
    exit 1
}

# Use the latest vsix file if multiple exist (sort descending by name or write date)
$vsixFileObj = $vsixFiles | Sort-Object LastWriteTime -Descending | Select-Object -First 1
$vsixFile = $vsixFileObj.FullName
Write-Host ($msg.vscode_installing_file -f $vsixFileObj.Name)

# Execute code --install-extension
& code --install-extension "$vsixFile" --force
if ($LASTEXITCODE -ne 0) {
    Write-Host $msg.vscode_err_failed -ForegroundColor Red
    exit 1
}

Write-Host $msg.vscode_success -ForegroundColor Green
