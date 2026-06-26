# Shared helpers for LoreRelay installer / updater scripts

function Test-LoreRelayVsixName([string]$Name) {
    return $Name -match '^lorerelay-v?[\d.]+\.vsix$'
}

function Test-SkillZipName([string]$Name) {
    return $Name -match '^text-adventure-gm[-v\d.]*\.zip$'
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

function Expand-ArchiveSafe {
    param(
        [Parameter(Mandatory = $true)][string]$ZipPath,
        [Parameter(Mandatory = $true)][string]$DestDir
    )

    $scriptContent = @(
        'param([string]$Zip, [string]$Dest)',
        'Expand-Archive -LiteralPath $Zip -DestinationPath $Dest -Force'
    ) -join "`r`n"

    $scriptPath = Join-Path ([System.IO.Path]::GetTempPath()) ("lorerelay-unzip-{0}.ps1" -f [Guid]::NewGuid().ToString('N'))
    try {
        [System.IO.File]::WriteAllText($scriptPath, $scriptContent, [System.Text.UTF8Encoding]::new($false))
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptPath -Zip $ZipPath -Dest $DestDir
        if ($LASTEXITCODE -ne 0) {
            throw "Expand-Archive failed with exit code $LASTEXITCODE"
        }
    } finally {
        if (Test-Path $scriptPath) { Remove-Item -LiteralPath $scriptPath -Force -ErrorAction SilentlyContinue }
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