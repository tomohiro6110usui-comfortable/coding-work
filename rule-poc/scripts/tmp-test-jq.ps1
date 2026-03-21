$line=(Get-Content .env | Where-Object { $_ -like "JQUANTS_API_KEY=*" } | Select-Object -First 1)
$k=$line.Substring("JQUANTS_API_KEY=".Length).Trim()
$sw=[Diagnostics.Stopwatch]::StartNew()
$r=Invoke-RestMethod -Uri "https://api.jquants.com/v2/equities/bars/daily?date=2025-12-06" -Headers @{ "x-api-key"=$k; "accept"="application/json" } -TimeoutSec 30
$sw.Stop()
Write-Output ("COUNT=" + @($r.data).Count)
Write-Output ("MS=" + [int]$sw.ElapsedMilliseconds)
