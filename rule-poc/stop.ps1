# stop.ps1
# dev.ps1 が保存した PID をまとめて kill します
$ErrorActionPreference = "SilentlyContinue"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$pidsFile = Join-Path $root ".dev.pids.json"

if (!(Test-Path $pidsFile)) {
  Write-Host "[stop] .dev.pids.json not found. (Nothing to stop?)"
  exit 0
}

$obj = Get-Content $pidsFile -Raw | ConvertFrom-Json
$pids = @($obj.pids)

Write-Host ("[stop] killing PIDs: {0}" -f ($pids -join ", "))

foreach ($pid in $pids) {
  try {
    Stop-Process -Id ([int]$pid) -Force
  } catch {}
}

try { Remove-Item $pidsFile -Force } catch {}

Write-Host "[stop] done. (DEV processes stopped)"
