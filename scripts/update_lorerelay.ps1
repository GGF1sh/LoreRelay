param(
    [string]$ProjectDir = $PSScriptRoot,
    [switch]$Force
)

. (Join-Path $PSScriptRoot 'install_common.ps1')

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$ErrorActionPreference = 'Stop'

$jsonPath = Join-Path $ProjectDir '..\locales\installer.json'
$loc = @{}
if (Test-Path $jsonPath) {
    try {
        $jsonContent = [System.IO.File]::ReadAllText($jsonPath, [System.Text.Encoding]::UTF8)
        $parsed = $jsonContent | ConvertFrom-Json
        $culture = [System.Globalization.CultureInfo]::CurrentUICulture.Name
        $lang = 'en'
        if ($culture -match '^ja') { $lang = 'ja' }
        elseif ($culture -match '^zh-CN' -or $culture -match '^zh-Hans') { $lang = 'zh-CN' }
        elseif ($culture -match '^zh-TW' -or $culture -match '^zh-Hant') { $lang = 'zh-TW' }
        if ($parsed.$lang) { $loc = $parsed.$lang } else { $loc = $parsed.en }
    } catch { }
}

function Get-Loc([string]$key, [string]$default) {
    if ($loc.$key) { return $loc.$key }
    return $default
}

function Get-LocalExtensionVersion {
    $pkgPath = Join-Path $ProjectDir '..\package.json'
    if (-not (Test-Path $pkgPath)) { return $null }
    try {
        $pkg = Get-Content $pkgPath -Raw -Encoding UTF8 | ConvertFrom-Json
        return [string]$pkg.version
    } catch {
        return $null
    }
}

function Compare-DottedVersion {
    param([string]$Current, [string]$Latest)
    $c = ($Current -replace '^v', '') -split '\.' | ForEach-Object { [int]$_ }
    $l = ($Latest -replace '^v', '') -split '\.' | ForEach-Object { [int]$_ }
    for ($i = 0; $i -lt 3; $i++) {
        $cv = if ($i -lt $c.Count) { $c[$i] } else { 0 }
        $lv = if ($i -lt $l.Count) { $l[$i] } else { 0 }
        if ($lv -gt $cv) { return 1 }
        if ($lv -lt $cv) { return -1 }
    }
    return 0
}

Write-Host '=================================================' -ForegroundColor Cyan
Write-Host (Get-Loc 'update_title' '  LoreRelay Updater') -ForegroundColor Cyan
Write-Host '=================================================' -ForegroundColor Cyan
Write-Host ''

$currentVersion = Get-LocalExtensionVersion
if ($currentVersion) {
    Write-Host ((Get-Loc 'update_current' 'Current version: v{0}') -f $currentVersion)
}

Write-Host (Get-Loc 'update_checking' 'Checking GitHub for the latest release...')
try {
    $headers = @{ 'User-Agent' = 'LoreRelay-Updater/1.0' }
    $release = Invoke-RestMethod -Uri 'https://api.github.com/repos/GGF1sh/LoreRelay/releases/latest' -Headers $headers -TimeoutSec 15
} catch {
    Write-Host (Get-Loc 'update_err_api' '[Error] Failed to fetch release information from GitHub.') -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

$latestTag = [string]$release.tag_name
Write-Host ((Get-Loc 'update_latest' 'Latest release: {0}') -f $latestTag)

if ($currentVersion -and -not $Force) {
    if ((Compare-DottedVersion $currentVersion $latestTag) -le 0) {
        Write-Host (Get-Loc 'update_up_to_date' 'Already up to date.') -ForegroundColor Green
        exit 0
    }
}

$vsixAsset = $release.assets | Where-Object { Test-LoreRelayVsixName $_.name } | Select-Object -First 1
$zipAsset = $release.assets | Where-Object { Test-SkillZipName $_.name } | Select-Object -First 1

if (-not $vsixAsset -and -not $zipAsset) {
    Write-Host (Get-Loc 'update_err_assets' '[Error] Release has no matching .vsix or skill .zip assets.') -ForegroundColor Red
    exit 1
}

if (-not $Force) {
    $prompt = (Get-Loc 'update_confirm' 'Update to {0}? [Y/N]') -f $latestTag
    $answer = Read-Host $prompt
    if ($answer -notmatch '^[Yy]') {
        Write-Host (Get-Loc 'update_cancelled' 'Update cancelled.')
        exit 0
    }
}

$tempDir = Join-Path ([System.IO.Path]::GetTempPath()) ('lorerelay-update-{0}' -f [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

try {
    if ($vsixAsset) {
        if (-not (Test-AllowedGitHubUrl $vsixAsset.browser_download_url)) {
            throw 'Blocked untrusted VSIX download URL'
        }
        Write-Host ((Get-Loc 'update_download_vsix' 'Downloading: {0}') -f $vsixAsset.name)
        $vsixPath = Join-Path $tempDir $vsixAsset.name
        Invoke-WebRequest -Uri $vsixAsset.browser_download_url -OutFile $vsixPath -Headers $headers -TimeoutSec 60
        Write-Host (Get-Loc 'update_install_vsix' 'Installing VSCode extension...')
        Install-VsixFile -VsixPath $vsixPath
    }

    if ($zipAsset) {
        if (-not (Test-AllowedGitHubUrl $zipAsset.browser_download_url)) {
            throw 'Blocked untrusted skill zip download URL'
        }
        Write-Host ((Get-Loc 'update_download_skill' 'Downloading: {0}') -f $zipAsset.name)
        $zipPath = Join-Path $tempDir $zipAsset.name
        $extractDir = Join-Path $tempDir 'skill_extract'
        Invoke-WebRequest -Uri $zipAsset.browser_download_url -OutFile $zipPath -Headers $headers -TimeoutSec 60
        New-Item -ItemType Directory -Path $extractDir -Force | Out-Null
        Expand-ArchiveSafe -ZipPath $zipPath -DestDir $extractDir

        $skillRoot = Find-SkillRoot -RootDir $extractDir
        if (-not $skillRoot) {
            throw 'SKILL.md not found inside downloaded zip'
        }

        $targetSkillDir = Join-Path ([Environment]::GetFolderPath('UserProfile')) '.gemini\config\skills\text-adventure-gm'
        Write-Host (Get-Loc 'update_install_skill' 'Installing Antigravity GM skill...')
        Install-SkillFolderAtomic -SourceDir $skillRoot -TargetDir $targetSkillDir
    }

    Write-Host ''
    Write-Host (Get-Loc 'update_success' 'Update completed successfully! Please reload VSCode / Antigravity.') -ForegroundColor Green
} catch {
    Write-Host (Get-Loc 'update_err_failed' '[Error] Update failed.') -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
} finally {
    if (Test-Path $tempDir) { Remove-Item -LiteralPath $tempDir -Recurse -Force -ErrorAction SilentlyContinue }
}

exit 0