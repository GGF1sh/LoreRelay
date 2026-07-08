param(
    [string]$Language = "en",
    [ValidateSet("both", "vscode", "antigravity")]
    [string]$Target = "both"
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

    # Direct-folder fallback must validate and stage the archive before it touches an existing install.
    return Install-VsixToDirDirectAtomic -VsixPath $VsixPath -TargetExtensionsDir $TargetExtensionsDir -ExtensionId $ExtensionId -Version $Version
}

function Install-VsixViaCli {
    param(
        [Parameter(Mandatory = $true)][string]$CliPath,
        [Parameter(Mandatory = $true)][string]$VsixPath,
        [Parameter(Mandatory = $true)][string]$Label
    )

    Write-Host "  -> $Label ($CliPath)" -ForegroundColor DarkGray
    $cliReport = $null
    $previousEap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $cliReport = Invoke-VsixCliInstallIsolated -CliPath $CliPath -VsixPath $VsixPath
        Write-Host "    canonical sha256 (before): $($cliReport.OriginalHashBefore)" -ForegroundColor DarkGray
        Write-Host "    isolated copy sha256 (before): $($cliReport.TempCopyHashBefore)" -ForegroundColor DarkGray
        foreach ($line in $cliReport.Output) {
            Write-Host $line
        }
        Write-Host "    canonical sha256 (after):  $($cliReport.OriginalHashAfter)" -ForegroundColor DarkGray
        if ($cliReport.TempCopyHashAfter) {
            Write-Host "    isolated copy sha256 (after):  $($cliReport.TempCopyHashAfter)" -ForegroundColor DarkGray
        }
        if ($cliReport.ExitCode -ne 0) {
            throw "$Label CLI install failed with exit code $($cliReport.ExitCode)"
        }
        $joinedOutput = ($cliReport.Output -join "`n")
        if ($joinedOutput -match 'successfully installed') {
            return $cliReport
        }
        if ($joinedOutput -match 'already installed') {
            return $cliReport
        }
        throw "$Label CLI install did not report success"
    } finally {
        $ErrorActionPreference = $previousEap
        if ($cliReport -and $cliReport.TempCopyPath -and (Test-Path $cliReport.TempCopyPath)) {
            Remove-Item -LiteralPath $cliReport.TempCopyPath -Force -ErrorAction SilentlyContinue
        }
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
    $vsixReport = Test-VsixPackageIntegrity -VsixPath $VsixPath -ExpectedVersion $PackageVersion -ExpectedExtensionId 'miya.lorerelay'
    Write-Host "Validated VSIX: $VsixPath" -ForegroundColor Green
    Write-Host "  size bytes: $($vsixReport.SizeBytes)" -ForegroundColor DarkGray
    Write-Host "  sha256: $($vsixReport.Sha256)" -ForegroundColor DarkGray

    $anyInstall = $false
    $errors = New-Object 'System.Collections.Generic.List[string]'

    # 1. Antigravity IDE (CLI — most reliable on Windows)
    if ($Target -in @('both', 'antigravity')) {
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
    }

    # 3. Standard VS Code
    if ($Target -in @('both', 'vscode')) {
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
    }

    if (-not $anyInstall) {
        throw "No IDE target succeeded. Errors:`n$($errors -join "`n")"
    }

    Write-Host ""
    Write-Host "Done. Reload the target editor (Developer: Reload Window)." -ForegroundColor Green
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
