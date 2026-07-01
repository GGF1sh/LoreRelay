param(
    [string]$Language = "en"
)

. (Join-Path $PSScriptRoot 'install_common.ps1')

$ErrorActionPreference = "Stop"

$ProjectDir = (Resolve-Path "$PSScriptRoot\..").Path
Push-Location $ProjectDir

function Install-VsixToDirDirect {
    param(
        [Parameter(Mandatory = $true)][string]$VsixPath,
        [Parameter(Mandatory = $true)][string]$TargetExtensionsDir,
        [Parameter(Mandatory = $true)][string]$ExtensionId,
        [Parameter(Mandatory = $true)][string]$Version
    )

    $targetDirName = "$ExtensionId-$Version"
    $destDir = Join-Path $TargetExtensionsDir $targetDirName

    if (Test-Path $TargetExtensionsDir) {
        Get-ChildItem -Path $TargetExtensionsDir -Filter "$ExtensionId-*" -Directory -ErrorAction SilentlyContinue | ForEach-Object {
            Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
        }
    }

    $tmpDir = Join-Path ([System.IO.Path]::GetTempPath()) ("vsix-extract-" + [Guid]::NewGuid().ToString('N'))
    try {
        Expand-ArchiveSafe -ZipPath $VsixPath -DestDir $tmpDir
        $extractedExtensionDir = Join-Path $tmpDir "extension"
        if (-not (Test-Path $extractedExtensionDir)) {
            throw "Invalid VSIX structure: 'extension' directory not found inside zip."
        }
        if (-not (Test-Path $TargetExtensionsDir)) {
            New-Item -ItemType Directory -Path $TargetExtensionsDir -Force | Out-Null
        }
        Copy-Item -LiteralPath $extractedExtensionDir -Destination $destDir -Recurse -Force
    } finally {
        if (Test-Path $tmpDir) {
            Remove-Item -LiteralPath $tmpDir -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}

function Install-VsixViaCli {
    param(
        [Parameter(Mandatory = $true)][string]$CliPath,
        [Parameter(Mandatory = $true)][string]$VsixPath,
        [Parameter(Mandatory = $true)][string]$Label
    )

    Write-Host "  -> $Label ($CliPath)" -ForegroundColor DarkGray
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $installed = & $CliPath --list-extensions --show-versions 2>&1
        if ($installed -match '^miya\.lorerelay@') {
            & $CliPath --uninstall-extension miya.lorerelay 2>&1 | Out-Null
        }
        $output = & $CliPath --install-extension $VsixPath --force 2>&1
        $output | ForEach-Object { Write-Host $_ }
        if ($LASTEXITCODE -ne 0) {
            throw "$Label CLI install failed with exit code $LASTEXITCODE"
        }
        if ($output -match 'successfully installed') {
            return
        }
        if ($output -match 'already installed') {
            return
        }
        throw "$Label CLI install did not report success"
    } finally {
        $ErrorActionPreference = $prevEap
    }
}

try {
    $PackageVersion = (node -p "require('./package.json').version").Trim()
    Write-Host ""
    Write-Host "Building LoreRelay v$PackageVersion from $ProjectDir" -ForegroundColor Cyan
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

    $anyInstall = $false
    $errors = New-Object 'System.Collections.Generic.List[string]'

    # 1. Antigravity IDE (CLI — most reliable on Windows)
    $agCmd = Resolve-AntigravityIdeCommand
    if ($agCmd) {
        Write-Host ""
        Write-Host "Installing to Antigravity IDE..." -ForegroundColor Cyan
        try {
            Install-VsixViaCli -CliPath $agCmd -VsixPath $VsixPath -Label 'Antigravity IDE'
            Write-Host "Antigravity IDE: OK" -ForegroundColor Green
            $anyInstall = $true
        } catch {
            $errors.Add("Antigravity CLI: $_")
            Write-Warning $_
        }
    } else {
        Write-Host ""
        Write-Host "Antigravity IDE CLI not found — will try direct folder copy." -ForegroundColor Yellow
    }

    # 2. Antigravity extension folders (fallback / dual-layout)
    foreach ($extDir in Get-AntigravityExtensionsDirs) {
        Write-Host ""
        Write-Host "Installing to Antigravity extensions folder: $extDir" -ForegroundColor Cyan
        try {
            Install-VsixToDirDirect -VsixPath $VsixPath -TargetExtensionsDir $extDir -ExtensionId "miya.lorerelay" -Version $PackageVersion
            Write-Host "Folder copy: OK ($extDir)" -ForegroundColor Green
            $anyInstall = $true
        } catch {
            $errors.Add("Antigravity folder $extDir : $_")
            Write-Warning $_
        }
    }

    # 3. Standard VS Code
    $codeCmd = Resolve-CodeCommand
    if ($codeCmd) {
        Write-Host ""
        Write-Host "Installing to standard VS Code..." -ForegroundColor Cyan
        try {
            Install-VsixViaCli -CliPath $codeCmd -VsixPath $VsixPath -Label 'VS Code'
            Write-Host "VS Code: OK" -ForegroundColor Green
            $anyInstall = $true
        } catch {
            $errors.Add("VS Code: $_")
            Write-Warning $_
        }
    } else {
        Write-Host ""
        Write-Host "VS Code CLI ('code') not found — skipped." -ForegroundColor Yellow
    }

    if (-not $anyInstall) {
        throw "No IDE target succeeded. Errors:`n$($errors -join "`n")"
    }

    Write-Host ""
    Write-Host "Done. Reload Antigravity IDE and/or VS Code (Developer: Reload Window)." -ForegroundColor Green
    if ($errors.Count -gt 0) {
        Write-Host "Some targets failed (others may have succeeded):" -ForegroundColor Yellow
        $errors | ForEach-Object { Write-Host "  - $_" -ForegroundColor Yellow }
    }
} catch {
    Write-Host ""
    Write-Host $_ -ForegroundColor Red
    exit 1
} finally {
    Pop-Location
}