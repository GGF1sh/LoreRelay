[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'install_common.ps1')

function Assert-True {
    param(
        [Parameter(Mandatory = $true)][bool]$Condition,
        [Parameter(Mandatory = $true)][string]$Message
    )
    if (-not $Condition) { throw "ASSERT FAILED: $Message" }
    Write-Host "OK: $Message"
}

function New-SyntheticSkillSource {
    param(
        [Parameter(Mandatory = $true)][string]$RootDir,
        [Parameter(Mandatory = $true)][string]$SkillBody
    )
    $srcDir = Join-Path $RootDir ("skill-src-" + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $srcDir -Force | Out-Null
    Set-Content -LiteralPath (Join-Path $srcDir 'SKILL.md') -Value $SkillBody -Encoding UTF8 -NoNewline
    $scriptsDir = Join-Path $srcDir 'scripts'
    New-Item -ItemType Directory -Path $scriptsDir -Force | Out-Null
    Set-Content -LiteralPath (Join-Path $scriptsDir 'comfyui_generate.py') -Value 'print("synthetic")' -Encoding UTF8 -NoNewline
    return $srcDir
}

$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("lorerelay-skill-install-test-" + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null

try {
    $sourceDir = New-SyntheticSkillSource -RootDir $tempRoot -SkillBody "# Repo-owned SKILL contract v1`nauthoritative body"
    $sourceSkillMd = Join-Path $sourceDir 'SKILL.md'

    # A. Successful atomic copy + matching hash => installer verification succeeds.
    $targetA = Join-Path $tempRoot 'target-a\text-adventure-gm'
    Install-SkillFolderAtomic -SourceDir $sourceDir -TargetDir $targetA
    $installedA = Join-Path $targetA 'SKILL.md'
    Assert-True (Test-Path -LiteralPath $installedA) 'A: atomic install places SKILL.md in the target'
    $hashA = Assert-InstalledSkillMatchesSource -SourceSkillMd $sourceSkillMd -InstalledSkillMd $installedA -TargetDir $targetA
    Assert-True ($hashA -eq (Get-FileSha256 -Path $sourceSkillMd)) 'A: matching install returns the verified source hash'

    # B. Installed SKILL.md missing after copy => verification fails nonzero.
    Remove-Item -LiteralPath $installedA -Force
    $bThrew = $false
    $bMessage = ''
    try {
        Assert-InstalledSkillMatchesSource -SourceSkillMd $sourceSkillMd -InstalledSkillMd $installedA -TargetDir $targetA | Out-Null
    } catch { $bThrew = $true; $bMessage = [string]$_.Exception.Message }
    Assert-True $bThrew 'B: missing installed SKILL.md fails verification'
    Assert-True ($bMessage -like '*missing*') 'B: failure message reports the missing installed SKILL.md'

    # C. Installed SKILL.md corrupted/mismatched => verification fails and reports both hashes + target.
    $targetC = Join-Path $tempRoot 'target-c\text-adventure-gm'
    Install-SkillFolderAtomic -SourceDir $sourceDir -TargetDir $targetC
    $installedC = Join-Path $targetC 'SKILL.md'
    Set-Content -LiteralPath $installedC -Value '# stale drifted skill body' -Encoding UTF8 -NoNewline
    $cThrew = $false
    $cMessage = ''
    try {
        Assert-InstalledSkillMatchesSource -SourceSkillMd $sourceSkillMd -InstalledSkillMd $installedC -TargetDir $targetC | Out-Null
    } catch { $cThrew = $true; $cMessage = [string]$_.Exception.Message }
    Assert-True $cThrew 'C: corrupted/mismatched installed SKILL.md fails verification'
    $srcHash = Get-FileSha256 -Path $sourceSkillMd
    $instHash = Get-FileSha256 -Path $installedC
    Assert-True ($cMessage -like "*$srcHash*") 'C: mismatch message reports the source hash'
    Assert-True ($cMessage -like "*$instHash*") 'C: mismatch message reports the installed hash'
    Assert-True ($cMessage -like "*$targetC*") 'C: mismatch message reports the target path'

    # D. Multiple successful targets => every target is hash-verified independently.
    $dTargets = @(
        (Join-Path $tempRoot 'target-d1\text-adventure-gm'),
        (Join-Path $tempRoot 'target-d2\text-adventure-gm'),
        (Join-Path $tempRoot 'target-d3\text-adventure-gm')
    )
    $dVerified = 0
    foreach ($t in $dTargets) {
        Install-SkillFolderAtomic -SourceDir $sourceDir -TargetDir $t
        $installed = Join-Path $t 'SKILL.md'
        $h = Assert-InstalledSkillMatchesSource -SourceSkillMd $sourceSkillMd -InstalledSkillMd $installed -TargetDir $t
        if ($h -eq $srcHash) { $dVerified++ }
    }
    Assert-True ($dVerified -eq 3) 'D: every one of multiple installed targets is hash-verified'

    # E. One target matches and one mismatches => overall failure (any mismatch throws).
    $eGood = Join-Path $tempRoot 'target-e-good\text-adventure-gm'
    $eBad = Join-Path $tempRoot 'target-e-bad\text-adventure-gm'
    Install-SkillFolderAtomic -SourceDir $sourceDir -TargetDir $eGood
    Install-SkillFolderAtomic -SourceDir $sourceDir -TargetDir $eBad
    Set-Content -LiteralPath (Join-Path $eBad 'SKILL.md') -Value '# only this target is stale' -Encoding UTF8 -NoNewline
    $eOverallFailed = $false
    foreach ($t in @($eGood, $eBad)) {
        try {
            Assert-InstalledSkillMatchesSource -SourceSkillMd $sourceSkillMd -InstalledSkillMd (Join-Path $t 'SKILL.md') -TargetDir $t | Out-Null
        } catch { $eOverallFailed = $true }
    }
    Assert-True $eOverallFailed 'E: a single mismatched target forces overall verification failure'

    Write-Host 'Antigravity skill installer gate tests passed.'
} finally {
    if (Test-Path $tempRoot) {
        Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}
