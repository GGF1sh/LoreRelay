# Package private scenario vault entries to individual ZIPs (local distribution only).
param(
    [Parameter(Mandatory = $true)]
    [string]$VaultDir,
    [string]$OutDir = ""
)

$ErrorActionPreference = "Stop"
$VaultDir = (Resolve-Path -LiteralPath $VaultDir).Path
if (-not $OutDir) {
    $OutDir = Join-Path $VaultDir "_dist"
}

$script = Join-Path $PSScriptRoot "package_scenario.py"
if (-not (Test-Path $script)) { throw "package_scenario.py not found" }
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

Get-ChildItem -Path $VaultDir -Directory |
    Where-Object { $_.Name -notin @('_shared', '_dist') -and -not $_.Name.StartsWith('_') } |
    ForEach-Object {
        $zip = Join-Path $OutDir ($_.Name + "-private.zip")
        python $script --dir $_.FullName --out $zip
        Write-Host "OK: $zip"
    }
