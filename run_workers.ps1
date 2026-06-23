# Tactical Globe — worker launcher / restarter
# Usage:
#   .\run_workers.ps1            # restart all 4 workers
#   .\run_workers.ps1 -Migrate   # run pending migrations first, then restart
#   .\run_workers.ps1 -Hidden    # run workers in background (no windows)

param(
    [switch]$Migrate,
    [switch]$Hidden
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$workers = @("worker_ingest", "worker_analyzer", "worker_fusion", "worker_adsb")
$migrations = @("migration_kinematic", "migration_trust", "migration_media")

# 1. Stop only OUR running workers (match 'worker_' in command line; leaves other python alone)
Write-Host "[*] Stopping existing workers..." -ForegroundColor Yellow
Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match '^(python|cmd)' -and $_.CommandLine -match 'worker_(ingest|analyzer|fusion|adsb)' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue; Write-Host "    killed PID $($_.ProcessId)" }
Start-Sleep -Seconds 1

# 2. Optional migrations (idempotent — safe to run repeatedly)
if ($Migrate) {
    Write-Host "[*] Running migrations..." -ForegroundColor Cyan
    foreach ($m in $migrations) {
        if (Test-Path "$m.py") { python "$m.py" }
    }
}

# 3. Launch all 4 workers
Write-Host "[*] Launching workers..." -ForegroundColor Green
foreach ($w in $workers) {
    if ($Hidden) {
        Start-Process python -ArgumentList "-u", "$w.py" -WindowStyle Hidden
    } else {
        # Each worker in its own titled window so you can watch its logs
        Start-Process cmd -ArgumentList "/k", "title $w && python -u $w.py"
    }
    Write-Host "    started $w" -ForegroundColor Green
}

Write-Host "[OK] All 4 workers up. Stop them anytime with: .\stop_workers.ps1" -ForegroundColor Green
