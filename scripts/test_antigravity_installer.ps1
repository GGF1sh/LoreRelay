[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'install_common.ps1')

function Assert-True {
    param(
        [Parameter(Mandatory = $true)][bool]$Condition,
        [Parameter(Mandatory = $true)][string]$Message
    )

    if (-not $Condition) {
        throw "ASSERT FAILED: $Message"
    }
    Write-Host "OK: $Message"
}

function Assert-Equal {
    param(
        [Parameter(Mandatory = $true)]$Actual,
        [Parameter(Mandatory = $true)]$Expected,
        [Parameter(Mandatory = $true)][string]$Message
    )

    if ($Actual -ne $Expected) {
        throw "ASSERT FAILED: $Message`nExpected: $Expected`nActual:   $Actual"
    }
    Write-Host "OK: $Message"
}

function New-SyntheticVsix {
    param(
        [Parameter(Mandatory = $true)][string]$RootDir,
        [Parameter(Mandatory = $true)][string]$Version,
        [string]$Publisher = 'Miya',
        [string]$Name = 'lorerelay'
    )

    $layoutDir = Join-Path $RootDir ("vsix-layout-" + [Guid]::NewGuid().ToString('N'))
    $extensionDir = Join-Path $layoutDir 'extension'
    New-Item -ItemType Directory -Path $extensionDir -Force | Out-Null

    Set-Content -LiteralPath (Join-Path $layoutDir '[Content_Types].xml') -Value '<Types />' -Encoding UTF8
    Set-Content -LiteralPath (Join-Path $layoutDir 'extension.vsixmanifest') -Value '<PackageManifest />' -Encoding UTF8
    $packageJson = @{
        name = $Name
        publisher = $Publisher
        version = $Version
        engines = @{ vscode = '^1.93.0' }
    } | ConvertTo-Json -Depth 5
    Set-Content -LiteralPath (Join-Path $extensionDir 'package.json') -Value $packageJson -Encoding UTF8
    Set-Content -LiteralPath (Join-Path $extensionDir 'README.md') -Value 'synthetic' -Encoding UTF8

    $vsixPath = Join-Path $RootDir ("synthetic-" + $Version + '.vsix')
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::CreateFromDirectory($layoutDir, $vsixPath)
    return $vsixPath
}

function Read-InstalledPackageVersion {
    param([Parameter(Mandatory = $true)][string]$InstallDir)

    $pkgPath = Join-Path $InstallDir 'package.json'
    $pkg = Get-Content -LiteralPath $pkgPath -Raw -Encoding UTF8 | ConvertFrom-Json
    return [string]$pkg.version
}

$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("lorerelay-installer-test-" + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null

try {
    $repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
    $artifactPath = New-LoreRelayVsixArtifactPath -Version '1.77.15'
    Assert-True ($artifactPath -like '*.vsix') 'artifact helper returns a VSIX path'
    Assert-True (-not $artifactPath.StartsWith($repoRoot, [System.StringComparison]::OrdinalIgnoreCase)) 'artifact helper keeps generated VSIX outside the repo root'

    $ignoreLines = Get-Content -LiteralPath (Join-Path $repoRoot '.vscodeignore')
    Assert-True ($ignoreLines -contains '.claude/**') '.vscodeignore excludes .claude artifacts'
    Assert-True ($ignoreLines -contains '.codex/**') '.vscodeignore excludes .codex artifacts'
    Assert-True ($ignoreLines -contains '*.vsix') '.vscodeignore excludes nested VSIX artifacts'

    $validVsix = New-SyntheticVsix -RootDir $tempRoot -Version '1.77.15'
    $report = Test-VsixPackageIntegrity -VsixPath $validVsix -ExpectedVersion '1.77.15' -ExpectedExtensionId 'miya.lorerelay'
    Assert-Equal $report.PackageVersion '1.77.15' 'valid VSIX passes preflight'
    Assert-True ($report.SizeBytes -gt 0) 'valid VSIX reports non-zero size'

    $corruptVsix = Join-Path $tempRoot 'corrupt.vsix'
    $bytes = [System.IO.File]::ReadAllBytes($validVsix)
    [System.IO.File]::WriteAllBytes($corruptVsix, $bytes[0..([Math]::Min(127, $bytes.Length - 1))])
    $corruptFailed = $false
    try {
        Test-VsixPackageIntegrity -VsixPath $corruptVsix -ExpectedVersion '1.77.15' -ExpectedExtensionId 'miya.lorerelay' | Out-Null
    } catch {
        $corruptFailed = $true
    }
    Assert-True $corruptFailed 'truncated VSIX fails preflight before install mutation'

    $cliScript = Join-Path $tempRoot 'fake-antigravity.cmd'
    @'
@echo off
>> "%~2" echo .mutated
echo Extension 'miya.lorerelay' was successfully installed.
exit /b 0
'@ | Set-Content -LiteralPath $cliScript -Encoding ASCII
    $cliReport = Invoke-VsixCliInstallIsolated -CliPath $cliScript -VsixPath $validVsix
    Assert-Equal $cliReport.OriginalHashBefore $cliReport.OriginalHashAfter 'canonical VSIX remains unchanged across isolated CLI attempt'
    Assert-True ($cliReport.TempCopyHashBefore -ne $cliReport.TempCopyHashAfter) 'isolated CLI copy can change without mutating canonical VSIX'

    $extensionsDir = Join-Path $tempRoot 'extensions'
    $oldDir = Join-Path $extensionsDir 'miya.lorerelay-1.70.0'
    New-Item -ItemType Directory -Path $oldDir -Force | Out-Null
    Set-Content -LiteralPath (Join-Path $oldDir 'package.json') -Value (@{
        name = 'lorerelay'
        publisher = 'Miya'
        version = '1.70.0'
    } | ConvertTo-Json -Depth 3) -Encoding UTF8
    Set-Content -LiteralPath (Join-Path $oldDir 'marker.txt') -Value 'keep-me' -Encoding UTF8

    $invalidInstallFailed = $false
    try {
        Install-VsixToDirDirectAtomic -VsixPath $corruptVsix -TargetExtensionsDir $extensionsDir -ExtensionId 'miya.lorerelay' -Version '1.77.15' | Out-Null
    } catch {
        $invalidInstallFailed = $true
    }
    Assert-True $invalidInstallFailed 'invalid archive aborts direct install'
    Assert-True (Test-Path $oldDir) 'existing installed version survives invalid archive failure unchanged'
    Assert-True (Test-Path (Join-Path $oldDir 'marker.txt')) 'existing install contents survive invalid archive failure unchanged'

    $installResult = Install-VsixToDirDirectAtomic -VsixPath $validVsix -TargetExtensionsDir $extensionsDir -ExtensionId 'miya.lorerelay' -Version '1.77.15'
    Assert-True (Test-Path $installResult.InstalledDir) 'atomic replacement succeeds for a valid synthetic VSIX'
    Assert-Equal (Read-InstalledPackageVersion -InstallDir $installResult.InstalledDir) '1.77.15' 'installed package.json version matches synthetic VSIX'
    Assert-True (-not (Test-Path $oldDir)) 'old version directory is removed only after successful replacement'

    $rollbackDir = Join-Path $tempRoot 'extensions-rollback'
    $rollbackOldDir = Join-Path $rollbackDir 'miya.lorerelay-1.70.0'
    New-Item -ItemType Directory -Path $rollbackOldDir -Force | Out-Null
    Set-Content -LiteralPath (Join-Path $rollbackOldDir 'package.json') -Value (@{
        name = 'lorerelay'
        publisher = 'Miya'
        version = '1.70.0'
    } | ConvertTo-Json -Depth 3) -Encoding UTF8
    $rollbackFailed = $false
    try {
        Install-VsixToDirDirectAtomic -VsixPath $validVsix -TargetExtensionsDir $rollbackDir -ExtensionId 'miya.lorerelay' -Version '1.77.15' -PreCommitHook { throw 'simulated replacement failure' } | Out-Null
    } catch {
        $rollbackFailed = $true
    }
    Assert-True $rollbackFailed 'simulated replacement failure is surfaced'
    Assert-True (Test-Path $rollbackOldDir) 'rollback restores the old version on replacement failure'
    Assert-Equal (Read-InstalledPackageVersion -InstallDir $rollbackOldDir) '1.70.0' 'rollback keeps the previous installed version intact'

    $cliCalls = 0
    $fallbackCalls = 0
    $cliPreferred = Invoke-PrimaryInstallWithFallback -PrimaryAvailable $true -PrimaryLabel 'CLI' -PrimaryAction {
        $script:cliCalls++
        return 'cli-ok'
    } -FallbackLabel 'Fallback' -FallbackAction {
        $script:fallbackCalls++
        return 'fallback-ok'
    }
    Assert-True $cliPreferred.PrimarySucceeded 'CLI success is reported as successful'
    Assert-True (-not $cliPreferred.FallbackRan) 'CLI success does not invoke direct-folder fallback'
    Assert-Equal $cliCalls 1 'CLI success attempts the primary path once'
    Assert-Equal $fallbackCalls 0 'CLI success skips the fallback path entirely'

    $cliCalls = 0
    $fallbackCalls = 0
    $fallbackPreferred = Invoke-PrimaryInstallWithFallback -PrimaryAvailable $true -PrimaryLabel 'CLI' -PrimaryAction {
        $script:cliCalls++
        throw 'synthetic CLI failure'
    } -FallbackLabel 'Fallback' -FallbackAction {
        $script:fallbackCalls++
        return 'fallback-ok'
    }
    Assert-True (-not $fallbackPreferred.PrimarySucceeded) 'CLI failure is reported as not successful'
    Assert-True $fallbackPreferred.FallbackSucceeded 'CLI failure triggers fallback success'
    Assert-True $fallbackPreferred.FallbackRan 'CLI failure runs direct-folder fallback'
    Assert-Equal $cliCalls 1 'CLI failure still attempts the primary path once'
    Assert-Equal $fallbackCalls 1 'CLI failure invokes fallback once'

    Write-Host 'Antigravity installer tests passed.'
} finally {
    if (Test-Path $tempRoot) {
        Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}
