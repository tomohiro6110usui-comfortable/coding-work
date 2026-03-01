# start.ps1
# 本番統合：build -> start をワンコマンドで実行
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

Write-Host "[prod] build:all..."
npm run build:all

Write-Host "[prod] start..."
npm run start
