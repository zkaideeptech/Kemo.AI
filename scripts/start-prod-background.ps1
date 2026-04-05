$log = 'C:\Users\Administrator\Desktop\Toni\kemo\.prod-server.log'
$err = 'C:\Users\Administrator\Desktop\Toni\kemo\.prod-server.err.log'

if (Test-Path Env:PATH) {
  $resolvedPath = if ($env:Path) { $env:Path } else { $env:PATH }
  Remove-Item Env:PATH -ErrorAction SilentlyContinue
  $env:Path = $resolvedPath
}

if (Test-Path $log) {
  Remove-Item $log -Force -ErrorAction SilentlyContinue
}

if (Test-Path $err) {
  Remove-Item $err -Force -ErrorAction SilentlyContinue
}

$proc = Start-Process `
  -FilePath 'C:\Users\Administrator\Tools\node-v24.14.0-win-x64\node.exe' `
  -ArgumentList @(
    'C:\Users\Administrator\Desktop\Toni\kemo\node_modules\next\dist\bin\next',
    'start',
    '-p',
    '4000'
  ) `
  -WorkingDirectory 'C:\Users\Administrator\Desktop\Toni\kemo' `
  -RedirectStandardOutput $log `
  -RedirectStandardError $err `
  -PassThru

$proc.Id
