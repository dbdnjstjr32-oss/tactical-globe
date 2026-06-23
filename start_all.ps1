# Tactical Globe — one-click launcher
# Starts: 4 Python workers (with migrations) + Next.js dev server.
# Each runs in its own titled window so you can watch logs.
# Stop workers with: .\stop_workers.ps1   |   close the "Next.js" window to stop the server.

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "==== Tactical Globe :: starting everything ====" -ForegroundColor Cyan

# 1. Workers (+ idempotent migrations)
& "$PSScriptRoot\run_workers.ps1" -Migrate

# 2. Next.js dev server in its own window
Write-Host "[*] Launching Next.js dev server..." -ForegroundColor Green
Start-Process cmd -ArgumentList "/k", "title Next.js (tactical-globe) && npx next dev -H 0.0.0.0 --webpack"

# 3. Open the dashboard once the server has had a moment to boot
Start-Sleep -Seconds 4
Start-Process "http://localhost:3000"

Write-Host "[OK] All up. Dashboard: http://localhost:3000" -ForegroundColor Green
Write-Host "     Stop workers: .\stop_workers.ps1  |  Stop server: close the Next.js window." -ForegroundColor DarkGray
