# dev.ps1
# Front + Server をまとめて起動し、PIDを .dev.pids.json に保存します
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$pidsFile = Join-Path $root ".dev.pids.json"

function Start-Cmd {
  param(
    [Parameter(Mandatory=$true)][string]$Title,
    [Parameter(Mandatory=$true)][string]$CmdLine
  )

  Write-Host ("[start] {0} -> {1}" -f $Title, $CmdLine)

  # 新しいウィンドウで実行（閉じるまでログが見える）
  $p = Start-Process -PassThru -WindowStyle Normal -FilePath "cmd.exe" -ArgumentList "/k", $CmdLine
  return $p.Id
}

try {
  if (Test-Path $pidsFile) { Remove-Item $pidsFile -Force }

  # scripts名に完全依存（package.jsonとセットで運用）
  $serverPid = Start-Cmd -Title "SERVER" -CmdLine "cd /d `"$root`" && npm run dev:server"
  $frontPid  = Start-Cmd -Title "FRONT"  -CmdLine "cd /d `"$root`" && npm run dev"

  $obj = @{
    startedAt = (Get-Date).ToString("s")
    root      = $root
    pids      = @($serverPid, $frontPid)
    note      = "Stop with: npm run stop  (or powershell -ExecutionPolicy Bypass -File .\stop.ps1)"
  }

  ($obj | ConvertTo-Json -Depth 5) | Set-Content -Encoding UTF8 $pidsFile

  Write-Host ""
  Write-Host "----------------------------------------"
  Write-Host "OK: started (DEV)."
  Write-Host ("PIDs saved -> {0}" -f $pidsFile)
  Write-Host "Stop: (1) close each cmd window, or (2) npm run stop"
  Write-Host "----------------------------------------"
}
catch {
  Write-Host "[error] dev.ps1 failed:"
  Write-Host $_
  exit 1
}
