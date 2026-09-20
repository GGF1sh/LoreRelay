$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
node (Join-Path $ScriptDir 'capture_ui_showcase_worldview.js')
if ($LASTEXITCODE -ne 0) {
    throw "Capture failed with exit code $LASTEXITCODE"
}
