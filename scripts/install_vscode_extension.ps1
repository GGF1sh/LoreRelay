param(
    [string]$Language = "en"
)

$ProjectDir = (Resolve-Path "$PSScriptRoot\..").Path
Push-Location $ProjectDir

Write-Host ""
Write-Host "Building LoreRelay VSCode Extension... This may take a moment." -ForegroundColor Cyan

# Compile and package, ignoring repository errors
npm run compile
npx @vscode/vsce package --no-dependencies --baseContentUrl "https://github.com/dummy" --baseImagesUrl "https://github.com/dummy"

$vsixFiles = Get-ChildItem -Filter "*.vsix" | Sort-Object LastWriteTime -Descending
if ($vsixFiles.Count -gt 0) {
    $latestVsix = $vsixFiles[0].Name
    Write-Host ""
    Write-Host "Installing extension to Antigravity IDE (VSCode)..." -ForegroundColor Cyan
    code --install-extension $latestVsix --force
    if ($?) {
        Write-Host ""
        Write-Host "Installation complete! Please reload the window or restart the editor." -ForegroundColor Green
    } else {
        Write-Host ""
        Write-Host "Failed to install the extension." -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host ""
    Write-Host "Failed to build the extension." -ForegroundColor Red
    exit 1
}

Pop-Location