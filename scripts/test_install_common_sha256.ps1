# INSTALLER-INTEGRITY-HASH-FALLBACK-001 — portable Get-FileSha256 + integrity gates
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'install_common.ps1')

function Assert-True {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { throw "ASSERT FAILED: $Message" }
    Write-Host "OK: $Message"
}

function Assert-Equal {
    param($Actual, $Expected, [string]$Message)
    if ($Actual -ne $Expected) {
        throw "ASSERT FAILED: $Message`nExpected: $Expected`nActual:   $Actual"
    }
    Write-Host "OK: $Message"
}

function Assert-Throws {
    param([scriptblock]$Script, [string]$Message)
    $threw = $false
    try { & $Script } catch { $threw = $true }
    if (-not $threw) { throw "ASSERT FAILED: expected throw — $Message" }
    Write-Host "OK: $Message"
}

function New-SyntheticVsix {
    param(
        [string]$RootDir,
        [string]$Version,
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
    $vsixPath = Join-Path $RootDir ("synthetic-" + $Version + '-' + [Guid]::NewGuid().ToString('N').Substring(0, 8) + '.vsix')
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::CreateFromDirectory($layoutDir, $vsixPath)
    return $vsixPath
}

function Get-IndependentSha256 {
    param([string]$Path)
    $stream = $null
    $sha = $null
    try {
        $stream = [System.IO.File]::OpenRead((Resolve-Path -LiteralPath $Path).Path)
        $sha = [System.Security.Cryptography.SHA256]::Create()
        $bytes = $sha.ComputeHash($stream)
        return ([BitConverter]::ToString($bytes) -replace '-', '').ToLowerInvariant()
    } finally {
        if ($sha) { $sha.Dispose() }
        if ($stream) { $stream.Dispose() }
    }
}

$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("lorerelay-sha256-test-" + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null
$failed = 0

try {
    # 1 empty file known SHA-256
    $empty = Join-Path $tempRoot 'empty.bin'
    [System.IO.File]::WriteAllBytes($empty, [byte[]]@())
    Assert-Equal (Get-FileSha256 -Path $empty) 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' '1 empty file known SHA-256'

    # 2 ASCII abc known SHA-256
    $abc = Join-Path $tempRoot 'abc.txt'
    [System.IO.File]::WriteAllBytes($abc, [System.Text.Encoding]::ASCII.GetBytes('abc'))
    Assert-Equal (Get-FileSha256 -Path $abc) 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad' '2 ASCII abc known SHA-256'

    # 3 binary byte sequence known SHA-256 (0x00..0x0f)
    $bin = Join-Path $tempRoot 'bin16.bin'
    $seq = [byte[]](0..15)
    [System.IO.File]::WriteAllBytes($bin, $seq)
    $expectedBin = Get-IndependentSha256 -Path $bin
    Assert-Equal (Get-FileSha256 -Path $bin) $expectedBin '3 binary byte sequence known SHA-256'

    # 4 Unicode filename and directory
    $uniDir = Join-Path $tempRoot "日本語フォルダ"
    New-Item -ItemType Directory -Path $uniDir -Force | Out-Null
    $uniFile = Join-Path $uniDir 'ファイル-σ-テスト.bin'
    [System.IO.File]::WriteAllBytes($uniFile, [System.Text.Encoding]::UTF8.GetBytes('unicode-path'))
    $h4 = Get-FileSha256 -Path $uniFile
    Assert-True ($h4 -match '^[0-9a-f]{64}$') '4 Unicode path produces 64 hex hash'
    Assert-Equal $h4 (Get-IndependentSha256 -Path $uniFile) '4 Unicode path matches independent .NET hash'

    # 5 Japanese text content
    $ja = Join-Path $tempRoot 'ja-content.txt'
    $jaText = "LoreRelay 日本語テキスト 検証"
    [System.IO.File]::WriteAllText($ja, $jaText, [System.Text.UTF8Encoding]::new($false))
    Assert-Equal (Get-FileSha256 -Path $ja) (Get-IndependentSha256 -Path $ja) '5 Japanese text content hash matches independent'

    # 6 repeated hashing deterministic
    $h6a = Get-FileSha256 -Path $abc
    $h6b = Get-FileSha256 -Path $abc
    Assert-Equal $h6a $h6b '6 repeated hashing is deterministic'

    # 7 one-byte mutation changes hash
    $mut = Join-Path $tempRoot 'mut.bin'
    [System.IO.File]::WriteAllBytes($mut, [System.Text.Encoding]::ASCII.GetBytes('abc'))
    $before = Get-FileSha256 -Path $mut
    [System.IO.File]::WriteAllBytes($mut, [System.Text.Encoding]::ASCII.GetBytes('abd'))
    $after = Get-FileSha256 -Path $mut
    Assert-True ($before -ne $after) '7 one-byte mutation changes the hash'

    # 8 lowercase
    $h8 = Get-FileSha256 -Path $abc
    Assert-equal $h8 $h8.ToLowerInvariant() '8 output is lowercase'
    Assert-True ($h8 -cmatch '^[0-9a-f]+$') '8 output has no uppercase A-F'

    # 9 exactly 64 hex
    Assert-True ($h8.Length -eq 64) '9 output length is 64'
    Assert-True ($h8 -match '^[0-9a-f]{64}$') '9 output is exactly 64 hex characters'

    # 10 missing file fails nonzero
    Assert-Throws { Get-FileSha256 -Path (Join-Path $tempRoot 'no-such-file.bin') } '10 missing file fails nonzero'

    # 11 unreadable/non-file path fails safely
    $dirOnly = Join-Path $tempRoot 'dir-only'
    New-Item -ItemType Directory -Path $dirOnly -Force | Out-Null
    Assert-Throws { Get-FileSha256 -Path $dirOnly } '11 directory path fails safely'
    Assert-Throws { Get-FileSha256 -Path '' } '11 empty path fails safely'

    # 12 Test-VsixPackageIntegrity returns actual VSIX hash
    $vsixOk = New-SyntheticVsix -RootDir $tempRoot -Version '1.84.5'
    $report = Test-VsixPackageIntegrity -VsixPath $vsixOk -ExpectedVersion '1.84.5' -ExpectedExtensionId 'miya.lorerelay'
    $vsixHash = Get-FileSha256 -Path $vsixOk
    Assert-Equal $report.Sha256 $vsixHash '12 Test-VsixPackageIntegrity returns the actual VSIX hash'
    Assert-Equal $report.PackageVersion '1.84.5' '12 report package version'
    Assert-Equal $report.ExtensionId 'miya.lorerelay' '12 report extension id'

    # 13 version mismatch fails
    Assert-Throws {
        Test-VsixPackageIntegrity -VsixPath $vsixOk -ExpectedVersion '9.9.9' -ExpectedExtensionId 'miya.lorerelay'
    } '13 VSIX embedded version mismatch still fails'

    # 14 extension-ID mismatch fails
    Assert-Throws {
        Test-VsixPackageIntegrity -VsixPath $vsixOk -ExpectedVersion '1.84.5' -ExpectedExtensionId 'other.publisher'
    } '14 VSIX extension-ID mismatch still fails'

    # 15 canonical and isolated-copy hashes match before CLI use
    # Simulate the pre-CLI portion of Invoke-VsixCliInstallIsolated without calling code.exe
    $originalHashBefore = Get-FileSha256 -Path $vsixOk
    $tempVsixPath = Join-Path $tempRoot ("isolated-copy-" + [Guid]::NewGuid().ToString('N') + '.vsix')
    Copy-Item -LiteralPath $vsixOk -Destination $tempVsixPath -Force
    $tempHashBefore = Get-FileSha256 -Path $tempVsixPath
    Assert-Equal $originalHashBefore $tempHashBefore '15 canonical and isolated-copy hashes match before CLI use'

    # 16 matching Skill files pass
    $skillSrcDir = Join-Path $tempRoot 'skill-src'
    $skillDstDir = Join-Path $tempRoot 'skill-dst'
    New-Item -ItemType Directory -Path $skillSrcDir, $skillDstDir -Force | Out-Null
    $skillBody = "# Skill`nportable hash test"
    $srcMd = Join-Path $skillSrcDir 'SKILL.md'
    $dstMd = Join-Path $skillDstDir 'SKILL.md'
    Set-Content -LiteralPath $srcMd -Value $skillBody -Encoding UTF8 -NoNewline
    Copy-Item -LiteralPath $srcMd -Destination $dstMd -Force
    $skillHash = Assert-InstalledSkillMatchesSource -SourceSkillMd $srcMd -InstalledSkillMd $dstMd -TargetDir $skillDstDir
    Assert-True ($skillHash -match '^[0-9a-f]{64}$') '16 matching Skill files pass'

    # 17 mismatching Skill files fail
    Set-Content -LiteralPath $dstMd -Value "# Skill`nMUTATED" -Encoding UTF8 -NoNewline
    Assert-Throws {
        Assert-InstalledSkillMatchesSource -SourceSkillMd $srcMd -InstalledSkillMd $dstMd -TargetDir $skillDstDir
    } '17 mismatching Skill files fail'

    # Bonus: helper must not invoke the cmdlet-based file hasher (source inspection)
    $commonSrc = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'install_common.ps1') -Raw
    $fnMatch = [regex]::Match($commonSrc, 'function Get-FileSha256\s*\{[\s\S]*?\nfunction ')
    Assert-True $fnMatch.Success 'Get-FileSha256 function body located'
    # Strip line comments, then require no cmdlet invocation of the utility hasher.
    $bodyNoComments = [regex]::Replace($fnMatch.Value, '(?m)^\s*#.*$', '')
    Assert-True ($bodyNoComments -notmatch '(?<![\w-])Get-FileHash(?![\w-])') 'Get-FileSha256 body does not call Get-FileHash'

    Write-Host ''
    Write-Host 'test_install_common_sha256: all passed'
    exit 0
} catch {
    Write-Host "FAIL: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ScriptStackTrace) { Write-Host $_.ScriptStackTrace }
    exit 1
} finally {
    if (Test-Path $tempRoot) {
        Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}
