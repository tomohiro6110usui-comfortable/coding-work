param(
  [string]$Date = "2025-12-06",
  [string[]]$Codes = @("7203", "6758", "9984", "8306", "9432"),
  [int]$Port = 8788,
  [int]$MaxRounds = 6,
  [int]$PerCodeSleepSec = 16,
  [int]$BetweenRoundsSleepSec = 30
)

$pending = [System.Collections.Generic.List[string]]::new()
$Codes | ForEach-Object { [void]$pending.Add($_) }

$successSet = [System.Collections.Generic.HashSet[string]]::new()
$lastError = @{}

for ($round = 1; $round -le $MaxRounds -and $pending.Count -gt 0; $round++) {
  Write-Host ("ROUND={0} pending={1}" -f $round, ($pending -join ",")) -ForegroundColor Cyan
  $next = [System.Collections.Generic.List[string]]::new()

  foreach ($code in $pending) {
    $url = "http://localhost:$Port/api/jquants-price-check?code=$code&to=$Date"
    try {
      $res = Invoke-RestMethod -Uri $url -TimeoutSec 180
      if ($res.ok -and $res.rows -gt 0) {
        [void]$successSet.Add($code)
        $lastError.Remove($code) | Out-Null
        Write-Host ("OK code={0} rows={1} attempts={2}" -f $code, $res.rows, $res.attempts) -ForegroundColor Green
      } else {
        [void]$next.Add($code)
        $lastError[$code] = "rows=0"
        Write-Host ("NG code={0} rows={1}" -f $code, $res.rows) -ForegroundColor Yellow
      }
    } catch {
      $body = ""
      if ($_.Exception.Response) {
        $reader = New-Object IO.StreamReader($_.Exception.Response.GetResponseStream())
        $body = $reader.ReadToEnd()
      } else {
        $body = $_.Exception.Message
      }
      [void]$next.Add($code)
      $lastError[$code] = $body
      Write-Host ("ERR code={0} {1}" -f $code, $body) -ForegroundColor Red
    }

    Start-Sleep -Seconds $PerCodeSleepSec
  }

  $pending = $next
  if ($pending.Count -gt 0 -and $round -lt $MaxRounds) {
    Write-Host "WAIT before next round..." -ForegroundColor DarkYellow
    Start-Sleep -Seconds $BetweenRoundsSleepSec
  }
}

$success = @($successSet)
$failed = @($pending)

Write-Host ""
Write-Host ("SUCCESS_CODES={0}" -f ($success -join ",")) -ForegroundColor Green
Write-Host ("FAILED_CODES={0}" -f ($failed -join ",")) -ForegroundColor Red

if ($failed.Count -gt 0) {
  Write-Host "FAILED_DETAILS:" -ForegroundColor Red
  foreach ($code in $failed) {
    $detail = if ($lastError.ContainsKey($code)) { $lastError[$code] } else { "" }
    Write-Host ("- {0}: {1}" -f $code, $detail) -ForegroundColor Red
  }
  exit 1
}

exit 0
