param([string]$InputFile = '', [switch]$NoLaunch, [string]$SaveRoot = '')
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object Text.UTF8Encoding($false)
$launcherRoot = Split-Path -Parent $PSScriptRoot
if (-not $SaveRoot) { $SaveRoot = Join-Path $launcherRoot 'Adventures' }

function ConvertFrom-BrowserJson([string]$Text) {
    if ([Text.Encoding]::UTF8.GetByteCount($Text) -gt 262144) { throw 'JSON is too large (maximum 256 KiB).' }
    $clean = $Text.TrimStart([char]0xFEFF).Trim()
    if ($clean -match '(?is)^```(?:json)?\s*\r?\n([\s\S]*?)\r?\n```$') { $clean = $Matches[1] }
    try { $data = ConvertFrom-Json -InputObject $clean }
    catch { throw 'Paste one JSON object or one JSON code block, without surrounding explanations.' }
    if (-not $data -or $data -is [Array] -or $data -isnot [PSCustomObject]) { throw 'JSON must be an object.' }
    if ($data.format -ne 'lorerelay-browser-start/1') { throw 'format: expected lorerelay-browser-start/1.' }
    # Full setting/schema validation is owned by the extension before gameplay writes.
    return $clean
}

function Resolve-VscodeExecutable {
    $candidates = @()
    $codeCommand = Get-Command code.cmd -ErrorAction SilentlyContinue
    if ($codeCommand) { $candidates += Join-Path (Split-Path (Split-Path $codeCommand.Source -Parent) -Parent) 'Code.exe' }
    if ($env:LOCALAPPDATA) { $candidates += Join-Path $env:LOCALAPPDATA 'Programs\Microsoft VS Code\Code.exe' }
    if ($env:ProgramFiles) { $candidates += Join-Path $env:ProgramFiles 'Microsoft VS Code\Code.exe' }
    foreach ($candidate in $candidates) { if (Test-Path -LiteralPath $candidate -PathType Leaf) { return $candidate } }
    throw 'VS Code was not found. Install VS Code and LoreRelay first, or add VS Code to PATH.'
}

function Start-BrowserAdventure([string]$Text) {
    $json = ConvertFrom-BrowserJson $Text
    $executable = $null
    if (-not $NoLaunch) { $executable = Resolve-VscodeExecutable }
    $root = [IO.Path]::GetFullPath($SaveRoot)
    $folderName = (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [Guid]::NewGuid().ToString('N')
    $workspacePath = Join-Path $root $folderName
    [void][IO.Directory]::CreateDirectory($workspacePath)
    $utf8 = New-Object Text.UTF8Encoding($false)
    [IO.File]::WriteAllText((Join-Path $workspacePath 'browser-setup.json'), $json, $utf8)
    [IO.File]::WriteAllText((Join-Path $workspacePath 'lorerelay-start.json'), '{"format":"lorerelay-launch/1","status":"pending"}', $utf8)
    if (-not $NoLaunch) {
        # Invoke Code.exe directly; never interpolate JSON into a shell command.
        Start-Process -FilePath $executable -ArgumentList @('--new-window', ('"' + $workspacePath + '"')) -WindowStyle Normal | Out-Null
    }
    Write-Output $workspacePath
}

if ($MyInvocation.InvocationName -eq '.') { return }

if ($InputFile) {
    try {
        if ((Get-Item -LiteralPath $InputFile).Length -gt 262144) { throw 'JSON is too large (maximum 256 KiB).' }
        Start-BrowserAdventure ([IO.File]::ReadAllText([IO.Path]::GetFullPath($InputFile), [Text.Encoding]::UTF8))
        exit 0
    } catch { Write-Error $_; exit 1 }
}
if ($NoLaunch) { throw 'NoLaunch requires InputFile.' }

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[Windows.Forms.Application]::EnableVisualStyles()
$form = New-Object Windows.Forms.Form
$form.Text = 'LoreRelay - AI JSONから冒険を開始'
$form.Size = New-Object Drawing.Size(760, 600)
$form.MinimumSize = $form.Size
$form.StartPosition = 'CenterScreen'
$label = New-Object Windows.Forms.Label
$label.Text = 'AIの出力JSONを貼り付けるか、保存したJSONファイルを選んでください。新しい冒険として保存します。'
$label.SetBounds(20, 18, 710, 40)
$textBox = New-Object Windows.Forms.TextBox
$textBox.Multiline = $true
$textBox.MaxLength = 262144
$textBox.ScrollBars = 'Both'
$textBox.WordWrap = $false
$textBox.Font = New-Object Drawing.Font('Consolas', 10)
$textBox.SetBounds(20, 65, 700, 380)
$textBox.Anchor = 'Top,Bottom,Left,Right'
$fileButton = New-Object Windows.Forms.Button
$fileButton.Text = 'JSONファイルを選ぶ'
$fileButton.SetBounds(20, 465, 170, 35)
$fileButton.Anchor = 'Bottom,Left'
$promptButton = New-Object Windows.Forms.Button
$promptButton.Text = 'AIに貼る説明をコピー'
$promptButton.SetBounds(200, 465, 190, 35)
$promptButton.Anchor = 'Bottom,Left'
$startButton = New-Object Windows.Forms.Button
$startButton.Text = '冒険を開始'
$startButton.SetBounds(560, 465, 160, 35)
$startButton.Anchor = 'Bottom,Right'
$statusLabel = New-Object Windows.Forms.Label
$statusLabel.Text = '保存先: ' + $SaveRoot
$statusLabel.SetBounds(20, 510, 700, 40)
$statusLabel.Anchor = 'Bottom,Left,Right'
$fileButton.Add_Click({
    $picker = New-Object Windows.Forms.OpenFileDialog
    $picker.Filter = 'JSON (*.json)|*.json|All files (*.*)|*.*'
    if ($picker.ShowDialog() -eq 'OK') {
        try {
            if ((Get-Item -LiteralPath $picker.FileName).Length -gt 262144) { throw 'JSON is too large (maximum 256 KiB).' }
            $textBox.Text = [IO.File]::ReadAllText($picker.FileName, [Text.Encoding]::UTF8)
            $statusLabel.Text = $picker.FileName
        } catch { [void][Windows.Forms.MessageBox]::Show($_.Exception.Message, 'LoreRelay') }
    }
    $picker.Dispose()
})
$promptButton.Add_Click({
    try {
        $promptPath = Join-Path $launcherRoot 'resources\browser-start\AIに貼る説明.txt'
        [Windows.Forms.Clipboard]::SetText([IO.File]::ReadAllText($promptPath, [Text.Encoding]::UTF8))
        $statusLabel.Text = 'コピーしました。ブラウザのAIへ貼り付けて、私の希望を書き換えて送信してください。'
    } catch { [void][Windows.Forms.MessageBox]::Show($_.Exception.Message, 'LoreRelay') }
})
$startButton.Add_Click({
    $startButton.Enabled = $false
    try {
        $saved = Start-BrowserAdventure $textBox.Text
        $statusLabel.Text = '保存しました: ' + $saved
        [void][Windows.Forms.MessageBox]::Show('VS CodeでLoreRelayを開きます。信頼確認が表示された場合は、内容を確認して続けてください。', 'LoreRelay')
        $form.Close()
    } catch {
        [void][Windows.Forms.MessageBox]::Show($_.Exception.Message, 'LoreRelay')
        $startButton.Enabled = $true
    }
})
$form.Controls.AddRange(@($label, $textBox, $fileButton, $promptButton, $startButton, $statusLabel))
[void]$form.ShowDialog()
$form.Dispose()
