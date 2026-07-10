# Shared helpers for LoreRelay installer / updater scripts

function Test-LoreRelayVsixName([string]$Name) {
    return $Name -match '^lorerelay-v?[\d.]+\.vsix$'
}

function Test-SkillZipName([string]$Name) {
    return $Name -match '^text-adventure-gm[-v\d.]*\.zip$'
}

function Get-LoreRelayVsixArtifactsDir {
    $dir = Join-Path ([System.IO.Path]::GetTempPath()) 'lorerelay-vsix-artifacts'
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
    return [System.IO.Path]::GetFullPath($dir)
}

function New-LoreRelayVsixArtifactPath {
    param([Parameter(Mandatory = $true)][string]$Version)

    return Join-Path (Get-LoreRelayVsixArtifactsDir) ("lorerelay-{0}.vsix" -f $Version)
}

function Get-FileSha256 {
    param([Parameter(Mandatory = $true)][string]$Path)

    if (-not (Test-Path $Path)) {
        throw "File not found for SHA-256: $Path"
    }

    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Get-ExtensionIdentityFromPackage {
    param([Parameter(Mandatory = $true)]$PackageJson)

    if (-not $PackageJson.name -or -not $PackageJson.publisher) {
        throw 'extension/package.json is missing name or publisher'
    }

    return ("{0}.{1}" -f [string]$PackageJson.publisher, [string]$PackageJson.name).ToLowerInvariant()
}

function Read-ZipEntryTextUtf8 {
    param(
        [Parameter(Mandatory = $true)]$ZipArchive,
        [Parameter(Mandatory = $true)][string]$EntryName
    )

    $entry = $ZipArchive.GetEntry($EntryName)
    if (-not $entry) {
        $entry = $ZipArchive.GetEntry(($EntryName -replace '/', '\'))
    }
    if (-not $entry) {
        $entry = $ZipArchive.GetEntry(($EntryName -replace '\\', '/'))
    }
    if (-not $entry) {
        throw "Missing ZIP entry: $EntryName"
    }

    $stream = $entry.Open()
    try {
        $reader = New-Object System.IO.StreamReader($stream, [System.Text.UTF8Encoding]::new($false), $true)
        try {
            return $reader.ReadToEnd()
        } finally {
            $reader.Dispose()
        }
    } finally {
        $stream.Dispose()
    }
}

function Test-VsixPackageIntegrity {
    param(
        [Parameter(Mandatory = $true)][string]$VsixPath,
        [string]$ExpectedVersion,
        [string]$ExpectedExtensionId
    )

    if (-not (Test-Path $VsixPath)) {
        throw "VSIX not found: $VsixPath"
    }

    $item = Get-Item -LiteralPath $VsixPath
    if ($item.Length -le 0) {
        throw "VSIX is empty: $VsixPath"
    }

    Add-Type -AssemblyName System.IO.Compression.FileSystem
    try {
        $zip = [System.IO.Compression.ZipFile]::OpenRead($VsixPath)
    } catch {
        throw "VSIX archive validation failed: $($_.Exception.Message)"
    }

    try {
        $requiredEntries = @(
            '[Content_Types].xml',
            'extension.vsixmanifest',
            'extension/package.json'
        )
        foreach ($required in $requiredEntries) {
            if ((-not $zip.GetEntry($required)) -and (-not $zip.GetEntry(($required -replace '/', '\')))) {
                throw "VSIX archive is missing required entry: $required"
            }
        }

        try {
            $packageJson = Read-ZipEntryTextUtf8 -ZipArchive $zip -EntryName 'extension/package.json' | ConvertFrom-Json
        } catch {
            throw "Failed to parse extension/package.json from VSIX: $($_.Exception.Message)"
        }

        $packageVersion = [string]$packageJson.version
        if (-not $packageVersion) {
            throw 'extension/package.json is missing version'
        }

        $extensionId = Get-ExtensionIdentityFromPackage -PackageJson $packageJson
        if ($ExpectedVersion -and $packageVersion -ne $ExpectedVersion) {
            throw "VSIX version mismatch: expected $ExpectedVersion but found $packageVersion"
        }
        if ($ExpectedExtensionId -and $extensionId -ne $ExpectedExtensionId.ToLowerInvariant()) {
            throw "VSIX extension ID mismatch: expected $ExpectedExtensionId but found $extensionId"
        }

        return [pscustomobject]@{
            Path = $item.FullName
            SizeBytes = $item.Length
            Sha256 = Get-FileSha256 -Path $item.FullName
            PackageVersion = $packageVersion
            ExtensionId = $extensionId
        }
    } finally {
        $zip.Dispose()
    }
}

function Get-ExtractedExtensionPackageInfo {
    param(
        [Parameter(Mandatory = $true)][string]$ExtractRoot,
        [string]$ExpectedVersion,
        [string]$ExpectedExtensionId
    )

    $extensionDir = Join-Path $ExtractRoot 'extension'
    if (-not (Test-Path $extensionDir)) {
        throw "Invalid VSIX structure: 'extension' directory not found inside archive."
    }

    $packageJsonPath = Join-Path $extensionDir 'package.json'
    if (-not (Test-Path $packageJsonPath)) {
        throw "Invalid VSIX structure: 'extension/package.json' not found inside archive."
    }

    try {
        $packageJson = Get-Content -LiteralPath $packageJsonPath -Raw -Encoding UTF8 | ConvertFrom-Json
    } catch {
        throw "Failed to parse extracted extension/package.json: $($_.Exception.Message)"
    }

    $packageVersion = [string]$packageJson.version
    if (-not $packageVersion) {
        throw 'Extracted extension/package.json is missing version'
    }

    $extensionId = Get-ExtensionIdentityFromPackage -PackageJson $packageJson
    if ($ExpectedVersion -and $packageVersion -ne $ExpectedVersion) {
        throw "Extracted VSIX version mismatch: expected $ExpectedVersion but found $packageVersion"
    }
    if ($ExpectedExtensionId -and $extensionId -ne $ExpectedExtensionId.ToLowerInvariant()) {
        throw "Extracted VSIX extension ID mismatch: expected $ExpectedExtensionId but found $extensionId"
    }

    return [pscustomobject]@{
        ExtensionDir = $extensionDir
        PackageJsonPath = $packageJsonPath
        PackageVersion = $packageVersion
        ExtensionId = $extensionId
    }
}

function Install-SkillFolderAtomic {
    param(
        [Parameter(Mandatory = $true)][string]$SourceDir,
        [Parameter(Mandatory = $true)][string]$TargetDir
    )

    if (-not (Test-Path $SourceDir)) {
        throw "Source directory not found: $SourceDir"
    }

    $skillMd = Join-Path $SourceDir 'SKILL.md'
    if (-not (Test-Path $skillMd)) {
        throw "SKILL.md not found in source: $SourceDir"
    }

    $tmpDir = "$TargetDir.tmp"
    $backupDir = "$TargetDir.backup"

    if (Test-Path $tmpDir) { Remove-Item -LiteralPath $tmpDir -Recurse -Force }
    if (Test-Path $backupDir) { Remove-Item -LiteralPath $backupDir -Recurse -Force }

    Copy-Item -LiteralPath $SourceDir -Destination $tmpDir -Recurse -Force

    $hadExisting = Test-Path $TargetDir
    try {
        if ($hadExisting) {
            Rename-Item -LiteralPath $TargetDir -NewName (Split-Path $backupDir -Leaf)
        }
        Rename-Item -LiteralPath $tmpDir -NewName (Split-Path $TargetDir -Leaf)
    } catch {
        if ($hadExisting -and -not (Test-Path $TargetDir) -and (Test-Path $backupDir)) {
            Rename-Item -LiteralPath $backupDir -NewName (Split-Path $TargetDir -Leaf)
        }
        if (Test-Path $tmpDir) { Remove-Item -LiteralPath $tmpDir -Recurse -Force }
        throw
    }

    if (Test-Path $backupDir) { Remove-Item -LiteralPath $backupDir -Recurse -Force }
}

# Mandatory canonical install gate (MEDIA-M1.1 repair): after a Skill target is installed,
# the installed SKILL.md must be a byte-exact copy of the repo-owned source SKILL.md.
# A missing or mismatched installed SKILL.md must fail the installer nonzero so a stale
# Skill can never survive a green canonical install. Returns the verified SHA-256 on success.
function Assert-InstalledSkillMatchesSource {
    param(
        [Parameter(Mandatory = $true)][string]$SourceSkillMd,
        [Parameter(Mandatory = $true)][string]$InstalledSkillMd,
        [Parameter(Mandatory = $true)][string]$TargetDir
    )

    if (-not (Test-Path -LiteralPath $SourceSkillMd)) {
        throw "Source SKILL.md not found for verification: $SourceSkillMd"
    }
    if (-not (Test-Path -LiteralPath $InstalledSkillMd)) {
        throw "Installed SKILL.md is missing after install (target: $TargetDir). Expected file: $InstalledSkillMd"
    }

    $sourceHash = Get-FileSha256 -Path $SourceSkillMd
    $installedHash = Get-FileSha256 -Path $InstalledSkillMd
    if ($sourceHash -ne $installedHash) {
        throw ("Installed SKILL.md does not match repo-owned source. " +
            "source=$sourceHash installed=$installedHash target=$TargetDir")
    }

    return $installedHash
}

function Expand-ArchiveSafe {
    param(
        [Parameter(Mandatory = $true)][string]$ZipPath,
        [Parameter(Mandatory = $true)][string]$DestDir
    )

    if (-not (Test-Path $ZipPath)) {
        throw "Archive not found: $ZipPath"
    }

    try {
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        if (-not (Test-Path $DestDir)) {
            New-Item -ItemType Directory -Path $DestDir -Force | Out-Null
        }
        [System.IO.Compression.ZipFile]::ExtractToDirectory($ZipPath, $DestDir)
    } catch {
        throw "Archive extraction failed: $($_.Exception.Message)"
    }
}

function Invoke-VsixCliInstallIsolated {
    param(
        [Parameter(Mandatory = $true)][string]$CliPath,
        [Parameter(Mandatory = $true)][string]$VsixPath
    )

    if (-not (Test-Path $CliPath)) {
        throw "CLI not found: $CliPath"
    }

    $originalHashBefore = Get-FileSha256 -Path $VsixPath
    $tempVsixPath = Join-Path ([System.IO.Path]::GetTempPath()) ("lorerelay-cli-{0}.vsix" -f [Guid]::NewGuid().ToString('N'))
    Copy-Item -LiteralPath $VsixPath -Destination $tempVsixPath -Force
    $tempHashBefore = Get-FileSha256 -Path $tempVsixPath

    $output = @()
    $exitCode = 0
    $hadNativePref = Test-Path variable:PSNativeCommandUseErrorActionPreference
    if ($hadNativePref) {
        $previousNativePref = $PSNativeCommandUseErrorActionPreference
        $PSNativeCommandUseErrorActionPreference = $false
    }
    try {
        $output = & $CliPath --install-extension $tempVsixPath --force 2>&1
        $exitCode = $LASTEXITCODE
    } finally {
        if ($hadNativePref) {
            $PSNativeCommandUseErrorActionPreference = $previousNativePref
        }
        $originalHashAfter = Get-FileSha256 -Path $VsixPath
        $tempHashAfter = $null
        if (Test-Path $tempVsixPath) {
            $tempHashAfter = Get-FileSha256 -Path $tempVsixPath
        }
    }

    if ($originalHashBefore -ne $originalHashAfter) {
        throw "Canonical VSIX hash changed across CLI attempt: $originalHashBefore -> $originalHashAfter"
    }

    return [pscustomobject]@{
        ExitCode = $exitCode
        Output = @($output | ForEach-Object { [string]$_ })
        OriginalHashBefore = $originalHashBefore
        OriginalHashAfter = $originalHashAfter
        TempCopyPath = $tempVsixPath
        TempCopyHashBefore = $tempHashBefore
        TempCopyHashAfter = $tempHashAfter
    }
}

function New-PreparedVsixInstallContent {
    param(
        [Parameter(Mandatory = $true)][string]$VsixPath,
        [string]$ExpectedVersion,
        [string]$ExpectedExtensionId
    )

    $integrity = Test-VsixPackageIntegrity -VsixPath $VsixPath -ExpectedVersion $ExpectedVersion -ExpectedExtensionId $ExpectedExtensionId
    $extractDir = Join-Path ([System.IO.Path]::GetTempPath()) ("vsix-extract-" + [Guid]::NewGuid().ToString('N'))
    Expand-ArchiveSafe -ZipPath $VsixPath -DestDir $extractDir
    $packageInfo = Get-ExtractedExtensionPackageInfo -ExtractRoot $extractDir -ExpectedVersion $ExpectedVersion -ExpectedExtensionId $ExpectedExtensionId

    return [pscustomobject]@{
        ExtractRoot = $extractDir
        ExtensionDir = $packageInfo.ExtensionDir
        PackageJsonPath = $packageInfo.PackageJsonPath
        PackageVersion = $packageInfo.PackageVersion
        ExtensionId = $packageInfo.ExtensionId
        SizeBytes = $integrity.SizeBytes
        Sha256 = $integrity.Sha256
    }
}

function Remove-PreparedVsixInstallContent {
    param([Parameter(Mandatory = $true)]$PreparedContent)

    if ($PreparedContent.ExtractRoot -and (Test-Path $PreparedContent.ExtractRoot)) {
        Remove-Item -LiteralPath $PreparedContent.ExtractRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}

function Install-PreparedExtensionToDirAtomic {
    param(
        [Parameter(Mandatory = $true)]$PreparedContent,
        [Parameter(Mandatory = $true)][string]$TargetExtensionsDir,
        [Parameter(Mandatory = $true)][string]$ExtensionId,
        [Parameter(Mandatory = $true)][string]$Version,
        [scriptblock]$PreCommitHook
    )

    $stageRoot = $null
    $backupRoot = $null
    $promoted = $false
    $movedExisting = New-Object 'System.Collections.Generic.List[object]'
    $targetDirName = "$ExtensionId-$Version"
    $destDir = Join-Path $TargetExtensionsDir $targetDirName

    try {
        if (-not (Test-Path $TargetExtensionsDir)) {
            New-Item -ItemType Directory -Path $TargetExtensionsDir -Force | Out-Null
        }

        # Prepared content stays read-only and lets multiple fallback roots reuse one validated extraction.
        $stageRoot = Join-Path $TargetExtensionsDir (".{0}.staging-{1}" -f $targetDirName, [Guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Path $stageRoot -Force | Out-Null
        Get-ChildItem -LiteralPath $PreparedContent.ExtensionDir -Force | ForEach-Object {
            Copy-Item -LiteralPath $_.FullName -Destination $stageRoot -Recurse -Force
        }

        $backupRoot = Join-Path $TargetExtensionsDir (".{0}.backup-{1}" -f $ExtensionId, [Guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null

        $existingDirs = @()
        if (Test-Path $TargetExtensionsDir) {
            $existingDirs = Get-ChildItem -LiteralPath $TargetExtensionsDir -Directory -ErrorAction SilentlyContinue |
                Where-Object { $_.Name -like "$ExtensionId-*" }
        }

        foreach ($existing in $existingDirs) {
            $backupPath = Join-Path $backupRoot $existing.Name
            Move-Item -LiteralPath $existing.FullName -Destination $backupPath
            [void]$movedExisting.Add([pscustomobject]@{
                OriginalPath = $existing.FullName
                BackupPath = $backupPath
            })
        }

        if ($PreCommitHook) {
            & $PreCommitHook
        }

        Rename-Item -LiteralPath $stageRoot -NewName $targetDirName
        $promoted = $true

        if (Test-Path $backupRoot) {
            Remove-Item -LiteralPath $backupRoot -Recurse -Force
        }

        return [pscustomobject]@{
            InstalledDir = $destDir
            ExtensionId = $PreparedContent.ExtensionId
            PackageVersion = $PreparedContent.PackageVersion
            BackedUpCount = $movedExisting.Count
        }
    } catch {
        if ($promoted -and (Test-Path $destDir)) {
            Remove-Item -LiteralPath $destDir -Recurse -Force -ErrorAction SilentlyContinue
        }
        if ((-not $promoted) -and $stageRoot -and (Test-Path $stageRoot)) {
            Remove-Item -LiteralPath $stageRoot -Recurse -Force -ErrorAction SilentlyContinue
        }
        foreach ($moved in $movedExisting) {
            if ((Test-Path $moved.BackupPath) -and (-not (Test-Path $moved.OriginalPath))) {
                Move-Item -LiteralPath $moved.BackupPath -Destination $moved.OriginalPath
            }
        }
        if ($backupRoot -and (Test-Path $backupRoot)) {
            Remove-Item -LiteralPath $backupRoot -Recurse -Force -ErrorAction SilentlyContinue
        }
        throw
    }
}

function Install-VsixToDirDirectAtomic {
    param(
        [Parameter(Mandatory = $true)][string]$VsixPath,
        [Parameter(Mandatory = $true)][string]$TargetExtensionsDir,
        [Parameter(Mandatory = $true)][string]$ExtensionId,
        [Parameter(Mandatory = $true)][string]$Version,
        [scriptblock]$PreCommitHook
    )

    $prepared = $null
    try {
        $prepared = New-PreparedVsixInstallContent -VsixPath $VsixPath -ExpectedVersion $Version -ExpectedExtensionId $ExtensionId
        return Install-PreparedExtensionToDirAtomic -PreparedContent $prepared -TargetExtensionsDir $TargetExtensionsDir -ExtensionId $ExtensionId -Version $Version -PreCommitHook $PreCommitHook
    } finally {
        if ($prepared) {
            Remove-PreparedVsixInstallContent -PreparedContent $prepared
        }
    }
}

function Invoke-PrimaryInstallWithFallback {
    param(
        [bool]$PrimaryAvailable,
        [Parameter(Mandatory = $true)][string]$PrimaryLabel,
        [Parameter(Mandatory = $true)][scriptblock]$PrimaryAction,
        [Parameter(Mandatory = $true)][string]$FallbackLabel,
        [Parameter(Mandatory = $true)][scriptblock]$FallbackAction
    )

    $report = [ordered]@{
        PrimaryAvailable = $PrimaryAvailable
        PrimaryAttempted = $false
        PrimarySucceeded = $false
        FallbackAttempted = $false
        FallbackSucceeded = $false
        FallbackRan = $false
        PrimaryError = $null
        FallbackError = $null
        Result = $null
    }

    if ($PrimaryAvailable) {
        $report.PrimaryAttempted = $true
        try {
            $report.Result = & $PrimaryAction
            $report.PrimarySucceeded = $true
            return [pscustomobject]$report
        } catch {
            $report.PrimaryError = "$PrimaryLabel failed: $($_.Exception.Message)"
        }
    } else {
        $report.PrimaryError = "$PrimaryLabel unavailable"
    }

    $report.FallbackAttempted = $true
    $report.FallbackRan = $true
    try {
        $report.Result = & $FallbackAction
        $report.FallbackSucceeded = $true
        return [pscustomobject]$report
    } catch {
        $report.FallbackError = "$FallbackLabel failed: $($_.Exception.Message)"
        $messages = @()
        if ($report.PrimaryError) { $messages += $report.PrimaryError }
        if ($report.FallbackError) { $messages += $report.FallbackError }
        throw ($messages -join "`n")
    }
}

function Find-SkillRoot {
    param([Parameter(Mandatory = $true)][string]$RootDir)

    $skillMd = Join-Path $RootDir 'SKILL.md'
    if (Test-Path $skillMd) { return $RootDir }

    foreach ($child in Get-ChildItem -LiteralPath $RootDir -Directory -ErrorAction SilentlyContinue) {
        $found = Find-SkillRoot -RootDir $child.FullName
        if ($found) { return $found }
    }
    return $null
}

function Resolve-CodeCommand {
    $codeCmd = Get-Command 'code' -ErrorAction SilentlyContinue
    if ($codeCmd) { return $codeCmd.Source }

    $localAppData = [Environment]::GetFolderPath('LocalApplicationData')
    $defaultCodePath = Join-Path $localAppData 'Programs\Microsoft VS Code\bin\code.cmd'
    if (Test-Path $defaultCodePath) { return $defaultCodePath }
    return $null
}

function Resolve-AntigravityIdeCommand {
    $cli = Get-Command 'antigravity-ide' -ErrorAction SilentlyContinue
    if ($cli) { return $cli.Source }

    $localAppData = [Environment]::GetFolderPath('LocalApplicationData')
    $candidates = @(
        (Join-Path $localAppData 'Programs\Antigravity IDE\_\bin\antigravity-ide.cmd'),
        (Join-Path $localAppData 'Programs\Antigravity IDE\bin\antigravity-ide.cmd'),
        (Join-Path $localAppData 'Programs\antigravity\_\bin\antigravity-ide.cmd'),
        (Join-Path $localAppData 'Programs\antigravity\bin\antigravity-ide.cmd')
    )
    foreach ($path in $candidates) {
        if (Test-Path $path) { return $path }
    }
    return $null
}

function Get-AntigravityExtensionsDirs {
    $homeDir = [Environment]::GetFolderPath('UserProfile')
    $dirs = @(
        (Join-Path $homeDir '.antigravity\extensions'),
        (Join-Path $homeDir '.antigravity-ide\extensions'),
        (Join-Path $homeDir '.gemini\antigravity-ide\extensions')
    )
    $seen = New-Object 'System.Collections.Generic.HashSet[string]'
    $result = New-Object 'System.Collections.Generic.List[string]'
    foreach ($dir in $dirs) {
        $normalized = [System.IO.Path]::GetFullPath($dir)
        if ($seen.Add($normalized)) {
            [void]$result.Add($normalized)
        }
    }
    return $result
}

function Install-VsixFile {
    param([Parameter(Mandatory = $true)][string]$VsixPath)

    if (-not (Test-Path $VsixPath)) {
        throw "VSIX not found: $VsixPath"
    }

    $name = Split-Path $VsixPath -Leaf
    if (-not (Test-LoreRelayVsixName $name)) {
        throw "Unexpected VSIX file name: $name"
    }

    $codeCmd = Resolve-CodeCommand
    if (-not $codeCmd) {
        throw 'VSCode code command not found'
    }

    & $codeCmd --install-extension $VsixPath --force
    if ($LASTEXITCODE -ne 0) {
        throw "code --install-extension failed with exit code $LASTEXITCODE"
    }
}

function Test-AllowedGitHubUrl {
    param([Parameter(Mandatory = $true)][string]$Url)

    try {
        $uri = [Uri]$Url
    } catch {
        return $false
    }

    if ($uri.Scheme -ne 'https') { return $false }

    $host = $uri.Host.ToLowerInvariant()
    $allowed = @(
        'api.github.com',
        'github.com',
        'objects.githubusercontent.com',
        'codeload.github.com'
    )
    if ($allowed -contains $host) { return $true }
    if ($host.EndsWith('.githubusercontent.com')) { return $true }
    return $false
}
