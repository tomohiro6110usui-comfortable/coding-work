param(
  [string]$Date = "2025-12-06",
  [int]$Port = 8788,
  [int]$MaxCodes = 3000,
  [switch]$Force
)

$ErrorActionPreference = "Stop"

function Normalize-ApiKey([string]$key) {
  if ($null -eq $key) { return "" }
  $k = $key.Trim()
  if ($k.StartsWith('"') -and $k.EndsWith('"') -and $k.Length -ge 2) {
    $k = $k.Substring(1, $k.Length - 2).Trim()
  }
  if ($k.StartsWith("'") -and $k.EndsWith("'") -and $k.Length -ge 2) {
    $k = $k.Substring(1, $k.Length - 2).Trim()
  }
  return $k
}

function Looks-Placeholder([string]$key) {
  $k = [string]$key
  if (-not $k) { return $true }
  if ($k.Length -lt 20) { return $true }
  return $k -match "placeholder|dummy|sample|api key|your[_ -]?api[_ -]?key|your key|your token"
}

function Get-WebErrorDetail($ErrorRecord) {
  if (-not $ErrorRecord.Exception.Response) {
    return [string]$ErrorRecord.Exception.Message
  }
  $resp = $ErrorRecord.Exception.Response
  $status = [int]$resp.StatusCode
  $reader = New-Object IO.StreamReader($resp.GetResponseStream())
  $body = $reader.ReadToEnd()
  if ($body.Length -gt 300) { $body = $body.Substring(0, 300) + "..." }
  return ("HTTP {0} {1}" -f $status, $body)
}

function Get-RetryAfterMs($ErrorRecord) {
  try {
    $resp = $ErrorRecord.Exception.Response
    if (-not $resp) { return $null }
    $h = $resp.Headers["Retry-After"]
    if (-not $h) { return $null }
    $sec = 0
    if ([int]::TryParse([string]$h, [ref]$sec)) {
      return [Math]::Max(0, $sec * 1000)
    }
  } catch {}
  return $null
}

function Invoke-JQuantsWithRetry([string]$url, [string]$apiKey, [int]$maxAttempts = 6) {
  for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
    try {
      return Invoke-RestMethod -Uri $url -Headers @{ "x-api-key" = $apiKey; "accept" = "application/json" } -TimeoutSec 180
    } catch {
      $detail = Get-WebErrorDetail $_
      $isRetryable = $detail -match "HTTP 429|HTTP 5\d\d"
      if ($isRetryable -and $attempt -lt $maxAttempts) {
        $retryAfterMs = Get-RetryAfterMs $_
        $backoffMs = [Math]::Min(30000, 2000 * [Math]::Pow(2, $attempt - 1))
        $waitMs = if ($retryAfterMs) { [int]$retryAfterMs } else { [int]$backoffMs }
        Start-Sleep -Milliseconds $waitMs
        continue
      }
      throw
    }
  }
}

$envKey = Normalize-ApiKey $env:JQUANTS_API_KEY
$fileKey = ""

$envFile = Join-Path (Get-Location) ".env"
if (Test-Path $envFile) {
  $line = Get-Content $envFile | Where-Object { $_ -like "JQUANTS_API_KEY=*" } | Select-Object -First 1
  if ($line) {
    $fileKey = Normalize-ApiKey ($line.Substring("JQUANTS_API_KEY=".Length))
  }
}

$apiKey = ""
if ($fileKey -and -not (Looks-Placeholder $fileKey)) { $apiKey = $fileKey }
elseif ($envKey -and -not (Looks-Placeholder $envKey)) { $apiKey = $envKey }

if (-not $apiKey) {
  Write-Error "No valid JQUANTS_API_KEY found. Check env var and .env (placeholder/invalid key)."
  exit 1
}

Write-Host "Fetching code universe from J-Quants bars(daily)..." -ForegroundColor Cyan
$rows = @()
$codes = @()
$effectiveDate = $Date
$baseDate = [datetime]::ParseExact($Date, "yyyy-MM-dd", $null)
$cachedCodesPath = ""

function Get-DayBarsPaged([string]$d, [string]$apiKey, [int]$targetNumericCodes = 3000) {
  $all = New-Object System.Collections.Generic.List[object]
  $numericSet = New-Object System.Collections.Generic.HashSet[string]
  $paginationKey = $null
  $guard = 0
  $baseSleepMs = 420
  do {
    $guard++
    if ($guard -gt 200) { break }

    $url = "https://api.jquants.com/v2/equities/bars/daily?date=$d"
    if ($paginationKey) {
      $url = "$url&pagination_key=$([uri]::EscapeDataString([string]$paginationKey))"
    }

    $res = Invoke-JQuantsWithRetry -url $url -apiKey $apiKey -maxAttempts 6
    if ($res.data) {
      foreach ($r in @($res.data)) {
        [void]$all.Add($r)
        $raw = if ($r.Code) { [string]$r.Code } elseif ($r.code) { [string]$r.code } else { "" }
        $c = $raw.Trim()
        if ($c.Length -eq 5 -and $c.EndsWith("0")) { $c = $c.Substring(0, 4) }
        if ($c -match '^[0-9]{4}$') {
          [void]$numericSet.Add($c)
        }
      }
    }
    if ($numericSet.Count -ge $targetNumericCodes) { break }
    $paginationKey = [string]$res.pagination_key
    if ([string]::IsNullOrWhiteSpace($paginationKey)) { $paginationKey = $null }
    $jitter = Get-Random -Minimum 0 -Maximum 220
    Start-Sleep -Milliseconds ($baseSleepMs + $jitter)
  } while ($paginationKey)

  return @($all)
}

 $lastFetchError = ""
$hasUsableCachedCodes = $false
for ($i = 0; $i -lt 10; $i++) {
  $d = $baseDate.AddDays(-$i).ToString("yyyy-MM-dd")
  $candidateFile = Join-Path $PSScriptRoot ("warmup-codes-{0}.json" -f ($d -replace "-", ""))
  if (-not (Test-Path $candidateFile)) { continue }
  try {
    $rawCodes = Get-Content $candidateFile | ConvertFrom-Json
    [string[]]$codesFromFile = @($rawCodes | ForEach-Object { [string]$_ } | Where-Object { $_ -and $_.Length -ge 4 })
    if ($codesFromFile.Count -ge $MaxCodes) {
      $rows = @()
      $codes = @($codesFromFile)
      $effectiveDate = $d
      $cachedCodesPath = $candidateFile
      $hasUsableCachedCodes = $true
      Write-Host ("Using cached codes file: {0}" -f $candidateFile) -ForegroundColor DarkGray
      break
    } elseif ($codesFromFile.Count -gt 0) {
      Write-Host ("Cached codes file has only {0} (< MaxCodes {1}); refetching from API." -f $codesFromFile.Count, $MaxCodes) -ForegroundColor Yellow
    }
  } catch {
    # Ignore cached-file parse errors and continue.
  }
}

if (-not $hasUsableCachedCodes) {
  for ($i = 0; $i -lt 10; $i++) {
    $d = $baseDate.AddDays(-$i).ToString("yyyy-MM-dd")
    $dayOfWeek = [datetime]::ParseExact($d, "yyyy-MM-dd", $null).DayOfWeek
    if ($dayOfWeek -eq [System.DayOfWeek]::Saturday -or $dayOfWeek -eq [System.DayOfWeek]::Sunday) {
      continue
    }
    try {
      $rows = @(Get-DayBarsPaged -d $d -apiKey $apiKey -targetNumericCodes $MaxCodes)
      if ($rows.Count -gt 0) {
        $effectiveDate = $d
        break
      }
    } catch {
      $lastFetchError = Get-WebErrorDetail $_
      $rows = @()
    }
  }
}

if (($rows.Count -eq 0) -and (-not $codes -or $codes.Count -eq 0)) {
  if ($lastFetchError) {
    Write-Error ("No bars returned for date={0} (and previous 9 days). Last error: {1}" -f $Date, $lastFetchError)
  } else {
    Write-Error "No bars returned for date=$Date (and previous 9 days)"
  }
  exit 1
}
if ($effectiveDate -ne $Date) {
  Write-Host ("Input date {0} is non-trading day. Using {1}." -f $Date, $effectiveDate) -ForegroundColor Yellow
}

function Normalize-Code([string]$code) {
  if ($null -eq $code) { return "" }
  $c = $code.Trim()
  if ($c.Length -eq 5 -and $c.EndsWith("0")) { return $c.Substring(0, 4) }
  return $c
}

if (-not $codes -or $codes.Count -eq 0) {
  $codes = $rows |
    ForEach-Object {
      if ($_.Code) { [string]$_.Code }
      elseif ($_.code) { [string]$_.code }
      else { "" }
    } |
    ForEach-Object { Normalize-Code $_ } |
    Where-Object { $_ -and $_.Length -ge 4 } |
    Select-Object -Unique
}

$numericCodes = @($codes | Where-Object { $_ -match '^[0-9]{4}$' })
$otherCodes = @($codes | Where-Object { $_ -notmatch '^[0-9]{4}$' })

$selectedCodes = @($numericCodes | Select-Object -First $MaxCodes)
if ($selectedCodes.Count -lt $MaxCodes) {
  $need = $MaxCodes - $selectedCodes.Count
  $selectedCodes += @($otherCodes | Select-Object -First $need)
}
$codes = @($selectedCodes)

Write-Host ("codes selected: {0}" -f $codes.Count) -ForegroundColor Green
Write-Host ("numeric codes: {0} / others: {1}" -f $numericCodes.Count, $otherCodes.Count) -ForegroundColor DarkGray
$codesFile = Join-Path $PSScriptRoot ("warmup-codes-{0}.json" -f ($effectiveDate -replace "-", ""))
$codes | ConvertTo-Json -Depth 3 | Set-Content -Path $codesFile -Encoding UTF8
Write-Host ("codes file: {0}" -f $codesFile) -ForegroundColor DarkCyan

$body = @{
  date = $effectiveDate
  codes = $codes
  maxCodes = $MaxCodes
  force = [bool]$Force
} | ConvertTo-Json -Depth 6

$startUrl = "http://localhost:$Port/api/pullback-cache/warmup"
try {
  $health = Invoke-RestMethod -Uri "http://localhost:$Port/api/health" -TimeoutSec 10
  if (-not $health.ok) {
    Write-Error "Server health check failed at http://localhost:$Port/api/health"
    exit 1
  }
} catch {
  Write-Error "Server is not reachable on port $Port. Start server first."
  exit 1
}

try {
  $start = Invoke-RestMethod -Method Post -Uri $startUrl -ContentType "application/json" -Body $body -TimeoutSec 120 -ErrorAction Stop
} catch {
  $status = $null
  $bodyText = ""
  if ($_.Exception.Response) {
    $status = [int]$_.Exception.Response.StatusCode
    $reader = New-Object IO.StreamReader($_.Exception.Response.GetResponseStream())
    $bodyText = $reader.ReadToEnd()
  } else {
    $bodyText = $_.Exception.Message
  }

  if ($status -eq 404) {
    Write-Error "Endpoint not found: POST /api/pullback-cache/warmup. Rebuild and restart server: npm run build:all ; node dist-server/index.js"
  } else {
    Write-Error ("Warmup start failed. status={0} body={1}" -f $status, $bodyText)
  }
  exit 1
}

if (-not $start.jobId) {
  Write-Error "Warmup start response is invalid (missing jobId)."
  exit 1
}

Write-Host ("warmup job started: {0}" -f $start.jobId) -ForegroundColor Cyan

$statusUrl = "http://localhost:$Port$($start.statusUrl)"
$maxPolls = 720
for ($poll = 1; $poll -le $maxPolls; $poll++) {
  Start-Sleep -Seconds 5
  $st = Invoke-RestMethod -Uri $statusUrl -TimeoutSec 60 -ErrorAction Stop
  $p = $st.progress
  Write-Host ("status={0} done={1}/{2} success={3} fail={4} skipped={5} last={6}" -f $st.status, $p.done, $p.total, $p.success, $p.fail, $p.skipped, $p.lastCode)
  if ($st.status -eq "done" -or $st.status -eq "error") {
    $st | ConvertTo-Json -Depth 8
    if ($st.status -eq "error") { exit 1 }
    exit 0
  }
}

Write-Error "Warmup polling timed out."
exit 1

