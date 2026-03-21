param(
  [string]$Date = "2025-12-05",
  [int]$Port = 8788,
  [string]$CodesFile = "c:\work\rule-poc\scripts\warmup-codes-20251205.json"
)

if (-not (Test-Path $CodesFile)) {
  Write-Error "Codes file not found: $CodesFile"
  exit 1
}

$codesRaw = Get-Content $CodesFile | ConvertFrom-Json
[string[]]$codes = @($codesRaw | ForEach-Object { [string]$_ })

function Invoke-Pullback([hashtable]$payload) {
  $body = $payload | ConvertTo-Json -Depth 8
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  $res = Invoke-RestMethod -Method Post -Uri "http://localhost:$Port/api/pullback-chances" -ContentType "application/json" -Body $body -TimeoutSec 120
  $sw.Stop()
  return @{ elapsedMs = [math]::Round($sw.Elapsed.TotalMilliseconds, 1); res = $res }
}

$strict = Invoke-Pullback @{
  date = $Date
  refresh = $false
  codes = $codes
}

$loose = Invoke-Pullback @{
  date = $Date
  refresh = $false
  codes = $codes
  shortMinRatioHighLow = 1.35
  shortMaxRatioNowHigh = 0.86
  midMinRatioHighLow = 1.8
  midMaxRatioNowHigh = 0.86
}

Write-Host ("strict elapsedMs={0} short={1} mid={2} failed={3} cache={4}" -f `
  $strict.elapsedMs, `
  $strict.res.shortTerm.Count, `
  $strict.res.midTerm.Count, `
  $strict.res.debug.failedCount, `
  $strict.res.debug.cacheHitCount) -ForegroundColor Cyan

Write-Host ("loose  elapsedMs={0} short={1} mid={2} failed={3} cache={4}" -f `
  $loose.elapsedMs, `
  $loose.res.shortTerm.Count, `
  $loose.res.midTerm.Count, `
  $loose.res.debug.failedCount, `
  $loose.res.debug.cacheHitCount) -ForegroundColor Green

$strictNear = @($strict.res.debug.nearMissTop | Select-Object -First 10)
$looseNear = @($loose.res.debug.nearMissTop | Select-Object -First 10)

Write-Host "strict nearMissTop (first 10):"
$strictNear | ConvertTo-Json -Depth 6

Write-Host "loose nearMissTop (first 10):"
$looseNear | ConvertTo-Json -Depth 6
