$ErrorActionPreference = 'Stop'
$testRoot = Join-Path ([IO.Path]::GetTempPath()) ('lr-launcher-' + [Guid]::NewGuid().ToString('N'))
. "$PSScriptRoot/start_browser_adventure.ps1" -NoLaunch -SaveRoot (Join-Path $testRoot '冒険 フォルダ')
function Assert-True($value, [string]$message) { if (-not $value) { throw $message } }
$example = [IO.File]::ReadAllText((Join-Path (Split-Path $PSScriptRoot -Parent) 'resources/browser-start/example.json'))
$saved = Start-BrowserAdventure $example
Assert-True (Test-Path -LiteralPath (Join-Path $saved 'browser-setup.json')) 'input preserved'
Assert-True (([IO.File]::ReadAllText((Join-Path $saved 'lorerelay-start.json')) | ConvertFrom-Json).status -eq 'pending') 'pending marker'
$second = Start-BrowserAdventure ('```json' + "`n" + $example + "`n" + '```')
Assert-True ($saved -ne $second) 'unique directory'
$savedInput = [IO.File]::ReadAllText((Join-Path $saved 'browser-setup.json'))
Assert-True ($savedInput -eq $example.Trim()) 'UTF-8 Japanese roundtrip'
$invalidRejected = $false
try { Start-BrowserAdventure ('Explanation' + $example) } catch { $invalidRejected = $true }
Assert-True $invalidRejected 'surrounding prose rejected'
$tooLarge = $false
try { Start-BrowserAdventure ('x' * 262145) } catch { $tooLarge = $true }
Assert-True $tooLarge 'oversized input rejected'
$badFormat = $false
try { Start-BrowserAdventure '{"format":"other"}' } catch { $badFormat = $true }
Assert-True $badFormat 'unsupported version rejected'
$oldLocal = $env:LOCALAPPDATA; $oldPrograms = $env:ProgramFiles
try {
    $env:LOCALAPPDATA = $testRoot; $env:ProgramFiles = $testRoot
    function Get-Command { return $null }
    $missingRejected = $false
    try { Resolve-VscodeExecutable } catch { $missingRejected = $true }
    Assert-True $missingRejected 'missing VS Code reported'
} finally { $env:LOCALAPPDATA = $oldLocal; $env:ProgramFiles = $oldPrograms }
$NoLaunch = $false
function Resolve-VscodeExecutable { return 'C:\Program Files\Microsoft VS Code\Code.exe' }
function Start-Process { param($FilePath, $ArgumentList, $WindowStyle); $script:launch = @($FilePath, $ArgumentList, $WindowStyle) }
$third = Start-BrowserAdventure $example
Assert-True ($launch[0] -eq 'C:\Program Files\Microsoft VS Code\Code.exe') 'direct executable'
Assert-True ($launch[1][0] -eq '--new-window') 'new window'
Assert-True ($launch[1][1] -eq ('"' + $third + '"')) 'quoted Japanese path'
Write-Output "PASS Windows launcher: UTF-8, file/paste parser, unique folders, invalid input, missing VS Code and direct quoted launch ($testRoot)"
