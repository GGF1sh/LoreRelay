param(
    [string]$ProjectDir = $PSScriptRoot
)

# Force console output encoding to UTF-8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# Get system language
$culture = [System.Globalization.CultureInfo]::CurrentUICulture.Name
$lang = "en"
if ($culture -match "^ja") { $lang = "ja" }
elseif ($culture -match "^zh-CN" -or $culture -match "^zh-Hans") { $lang = "zh-CN" }
elseif ($culture -match "^zh-TW" -or $culture -match "^zh-Hant") { $lang = "zh-TW" }

# Load localization resource
$jsonPath = Join-Path $ProjectDir "..\locales\installer.json"
$loc = @{}
if (Test-Path $jsonPath) {
    try {
        $utf8 = [System.Text.Encoding]::UTF8
        $jsonContent = [System.IO.File]::ReadAllText($jsonPath, $utf8)
        $parsed = $jsonContent | ConvertFrom-Json
        if ($parsed.$lang) {
            $loc = $parsed.$lang
        } else {
            $loc = $parsed.en
        }
    } catch {
        Write-Warning "Failed to parse locales/installer.json."
    }
}

# Helper for messages
function Get-Loc([string]$key, [string]$default) {
    if ($loc.$key) { return $loc.$key }
    return $default
}

Write-Host "=================================================" -ForegroundColor Cyan
Write-Host (Get-Loc "vscode_title" "  LoreRelay VSCode Extension Installer") -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host ""

Write-Host (Get-Loc "vscode_installing" "Installing VSCode extension (LoreRelay)...")

# Find .vsix file
$vsixFiles = Get-ChildItem -Path (Join-Path $ProjectDir "..") -Filter "lorerelay-*.vsix" | Sort-Object LastWriteTime -Descending
if ($vsixFiles.Count -eq 0) {
    Write-Host (Get-Loc "vscode_err_no_vsix" "[Error] .vsix file not found. Please package the extension first.") -ForegroundColor Red
    exit 1
}

$vsixFile = $vsixFiles[0].FullName
Write-Host ((Get-Loc "vscode_installing_file" "Installing: {0}") -f $vsixFiles[0].Name)

# Check if code command is available
$codeCmd = Get-Command "code" -ErrorAction SilentlyContinue
if (-not $codeCmd) {
    # Try common paths
    $localAppData = [Environment]::GetFolderPath("LocalApplicationData")
    $defaultCodePath = Join-Path $localAppData "Programs\Microsoft VS Code\bin\code.cmd"
    if (Test-Path $defaultCodePath) {
        $codeCmd = $defaultCodePath
    } else {
        Write-Host (Get-Loc "vscode_err_no_code" "[Error] VSCode 'code' command not found. Ensure VSCode is installed and added to PATH.") -ForegroundColor Red
        exit 1
    }
}

# Install
try {
    $process = Start-Process -FilePath $codeCmd -ArgumentList "--install-extension", "`"$vsixFile`"", "--force" -Wait -NoNewWindow -PassThru
    if ($process.ExitCode -ne 0) {
        Write-Host (Get-Loc "vscode_err_failed" "[Error] Extension installation failed.") -ForegroundColor Red
        exit $process.ExitCode
    }
    Write-Host ""
    Write-Host (Get-Loc "vscode_success" "Installation completed successfully!") -ForegroundColor Green
} catch {
    Write-Host (Get-Loc "vscode_err_failed" "[Error] Extension installation failed.") -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

exit 0
