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

    # --- INSTALLER-RELEASE-001: multi-target fallback result aggregation regression ---
    # Reproduces the real installer log: primary CLI unavailable/fails, all N direct-folder
    # fallback targets individually succeed, and the aggregated result must still report
    # overall success (not "Argument types do not match" from wrapping a
    # System.Collections.Generic.List[object] with the @() array subexpression operator).

    # A. Primary unavailable + fallback succeeds once => overall success.
    $singleTargetReport = Invoke-PrimaryInstallWithFallback -PrimaryAvailable $false -PrimaryLabel 'Antigravity CLI' -PrimaryAction {
        throw 'unused'
    } -FallbackLabel 'Antigravity direct-folder fallback' -FallbackAction {
        $results = New-Object 'System.Collections.Generic.List[object]'
        [void]$results.Add([pscustomobject]@{ InstalledDir = 'C:\fake-single'; PackageVersion = '1.78.0' })
        return $results.ToArray()
    }
    Assert-True $singleTargetReport.FallbackSucceeded 'A: primary unavailable + one fallback target succeeds overall'
    Assert-Equal (@($singleTargetReport.Result).Count) 1 'A: single fallback result is preserved'

    # B. Primary fails + 3 fallback targets all succeed => overall success, all 3 preserved.
    $threeTargetReport = Invoke-PrimaryInstallWithFallback -PrimaryAvailable $true -PrimaryLabel 'Antigravity CLI' -PrimaryAction {
        throw 'synthetic CLI failure'
    } -FallbackLabel 'Antigravity direct-folder fallback' -FallbackAction {
        $fallbackDirs = @('C:\fakeA', 'C:\fakeB', 'C:\fakeC')
        $results = New-Object 'System.Collections.Generic.List[object]'
        foreach ($extDir in $fallbackDirs) {
            $result = [pscustomobject]@{ InstalledDir = $extDir; PackageVersion = '1.78.0'; BackedUpCount = 0 }
            [void]$results.Add($result)
        }
        return $results.ToArray()
    }
    Assert-True (-not $threeTargetReport.PrimarySucceeded) 'B: primary failure is reported as not successful'
    Assert-True $threeTargetReport.FallbackSucceeded 'B: three fallback target successes report overall success'
    Assert-Equal (@($threeTargetReport.Result).Count) 3 'B: all three fallback results are preserved in aggregation'
    Assert-True ($threeTargetReport.PrimaryError -like '*synthetic CLI failure*') 'B: primary CLI error is retained as a warning alongside fallback success'

    # C. Primary fails + fallback itself throws => overall failure containing both errors.
    $bothFailReport = $null
    $bothFailThrew = $false
    try {
        $bothFailReport = Invoke-PrimaryInstallWithFallback -PrimaryAvailable $true -PrimaryLabel 'Antigravity CLI' -PrimaryAction {
            throw 'synthetic CLI failure'
        } -FallbackLabel 'Antigravity direct-folder fallback' -FallbackAction {
            throw 'synthetic fallback failure'
        }
    } catch {
        $bothFailThrew = $true
        $bothFailMessage = [string]$_
    }
    Assert-True $bothFailThrew 'C: primary failure + fallback throw is surfaced as an overall failure'
    Assert-True ($bothFailMessage -like '*synthetic CLI failure*') 'C: overall failure message contains the primary error'
    Assert-True ($bothFailMessage -like '*synthetic fallback failure*') 'C: overall failure message contains the fallback error'

    # D. The exact real-world aggregation pattern (List[object] built across a foreach loop,
    # returned via .ToArray()) must not throw "Argument types do not match" under this
    # Windows PowerShell build's array/collection semantics. Also pins the confirmed root
    # cause: wrapping the same List[object] with @() throws that exact exception here, so a
    # future regression back to @($list) is caught instead of silently reappearing.
    $probe = New-Object 'System.Collections.Generic.List[object]'
    foreach ($n in 1..3) {
        [void]$probe.Add([pscustomobject]@{ N = $n })
    }

    # Compared by exception type, not message text: the .NET message is rendered in the
    # host's active locale/codepage ("Argument types do not match" in English, a Japanese
    # translation on a ja-JP host), so a literal-string comparison is not portable.
    $legacyWrapThrew = $false
    $legacyWrapExceptionType = ''
    try {
        $legacyResult = @($probe)
        Write-Host "  (unexpected: @(List[object]) did not throw on this host, got count=$($legacyResult.Count))"
    } catch {
        $legacyWrapThrew = $true
        $legacyWrapExceptionType = $_.Exception.GetType().FullName
    }
    Assert-True ($legacyWrapThrew -and $legacyWrapExceptionType -eq 'System.ArgumentException') "D: confirmed root cause - @(List[object]) throws System.ArgumentException on this PS host (got type: $legacyWrapExceptionType)"

    $noThrowFailed = $false
    $noThrowMessage = ''
    try {
        $arr = $probe.ToArray()
        Assert-Equal $arr.Count 3 'D: List[object].ToArray() preserves all appended elements'
    } catch {
        $noThrowFailed = $true
        $noThrowMessage = $_.Exception.Message
    }
    Assert-True (-not $noThrowFailed) "D: fallback-style List[object] aggregation via .ToArray() does not throw ($noThrowMessage)"

    # --- INSTALLER-RELEASE-001: version-aware VSIX naming + extracted package identity ---
    # Version-agnostic: the exact number is validated by check_version_consistency.js; here we
    # only prove the VSIX naming/extraction round-trips whatever package.json currently declares,
    # so a later version bump does not falsely fail this installer test.
    $pkgJson = Get-Content -LiteralPath (Join-Path $repoRoot 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    $currentPackageVersion = ([string]$pkgJson.version).Trim()
    Assert-True ($currentPackageVersion -match '^\d+\.\d+\.\d+$') 'E/F: package.json exposes a valid release version identity'

    # F. VSIX artifact naming resolves to lorerelay-<version>.vsix for the current release.
    $releaseArtifactPath = New-LoreRelayVsixArtifactPath -Version $currentPackageVersion
    Assert-Equal (Split-Path $releaseArtifactPath -Leaf) "lorerelay-$currentPackageVersion.vsix" 'F: VSIX artifact naming resolves to lorerelay-<version>.vsix'

    # G. Extracted (synthetic) VSIX package round-trips the current package version.
    $releaseVsix = New-SyntheticVsix -RootDir $tempRoot -Version $currentPackageVersion
    $releaseReport = Test-VsixPackageIntegrity -VsixPath $releaseVsix -ExpectedVersion $currentPackageVersion -ExpectedExtensionId 'miya.lorerelay'
    Assert-Equal $releaseReport.PackageVersion $currentPackageVersion 'G: VSIX package.json reports the current package version'
    $releaseExtractDir = Join-Path $tempRoot ("release-extract-" + [Guid]::NewGuid().ToString('N'))
    Expand-ArchiveSafe -ZipPath $releaseVsix -DestDir $releaseExtractDir
    $extractedInfo = Get-ExtractedExtensionPackageInfo -ExtractRoot $releaseExtractDir -ExpectedVersion $currentPackageVersion -ExpectedExtensionId 'miya.lorerelay'
    Assert-Equal $extractedInfo.PackageVersion $currentPackageVersion 'G: extracted extension/package.json reports the current package version'

    Write-Host 'Antigravity installer tests passed.'
} finally {
    if (Test-Path $tempRoot) {
        Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}
