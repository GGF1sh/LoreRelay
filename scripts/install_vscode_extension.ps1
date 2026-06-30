param(
    [string]$Language = "en"
)

$ErrorActionPreference = "Stop"

$ProjectDir = (Resolve-Path "$PSScriptRoot\..").Path
Push-Location $ProjectDir

try {
    Write-Host ""
    Write-Host "Building LoreRelay VSCode Extension... This may take a moment." -ForegroundColor Cyan

    $PackageVersion = (node -p "require('./package.json').version").Trim()
    $VsixName = "lorerelay-$PackageVersion.vsix"
    $VsixPath = Join-Path $ProjectDir $VsixName

    if (Test-Path $VsixPath) {
        Remove-Item -LiteralPath $VsixPath -Force
    }

    npm run compile
    if ($LASTEXITCODE -ne 0) {
        throw "npm run compile failed with exit code $LASTEXITCODE"
    }

    npx @vscode/vsce package --baseContentUrl "https://github.com/dummy" --baseImagesUrl "https://github.com/dummy" --out $VsixPath
    if ($LASTEXITCODE -ne 0) {
        throw "vsce package failed with exit code $LASTEXITCODE"
    }

    if (-not (Test-Path $VsixPath)) {
        throw "Expected VSIX was not created: $VsixPath"
    }

    Write-Host ""
    Write-Host "Installing extension to Antigravity IDE (VSCode)..." -ForegroundColor Cyan

    $Installed = & code --list-extensions --show-versions
    if ($Installed -match '^miya\.lorerelay@') {
        code --uninstall-extension miya.lorerelay
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to uninstall old LoreRelay extension."
        }
    }

    code --install-extension $VsixPath --force
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to install the extension."
    }

    Write-Host ""
    Write-Host "Installation complete! Installed $VsixName. Please reload the window or restart the editor." -ForegroundColor Green
} catch {
    Write-Host ""
    Write-Host $_ -ForegroundColor Red
    exit 1
} finally {
    Pop-Location
}
