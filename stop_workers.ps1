# Tactical Globe — stop all workers
# Usage:  .\stop_workers.ps1

$count = 0
Get-CimInstance Win32_Process -Filter "Name='python.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match 'worker_(ingest|analyzer|fusion|adsb)' } |
    ForEach-Object {
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        Write-Host "killed worker PID $($_.ProcessId)"
        $count++
    }
if ($count -eq 0) { Write-Host "no workers running" } else { Write-Host "[OK] stopped $count worker(s)" }
