$ErrorActionPreference = 'Stop'
$TargetDir = "C:\AI\artifacts\LoreRelay\showcase\current"

Write-Host "Removing previous generated showcase directories..."
if (Test-Path $TargetDir) {
    Remove-Item -Recurse -Force $TargetDir
}

Write-Host "Generating UI Showcase Scenarios..."
node .\scripts\create_ui_showcase_scenarios.js $TargetDir

Write-Host "Showcase suite generation complete."
Write-Host "=============================================="
Write-Host "Entry point:"
Write-Host "  $TargetDir\OPEN_SHOWCASE.bat"
Write-Host "Workspace directories:"
Write-Host "  $TargetDir\01-populated-world"
Write-Host "  $TargetDir\02-empty-states"
Write-Host "  $TargetDir\03-layout-stress"
Write-Host "  $TargetDir\04-vehicle-repair-smoke-v1"
Write-Host "=============================================="
