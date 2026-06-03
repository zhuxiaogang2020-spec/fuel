$res = Invoke-RestMethod -Uri 'http://localhost:8000/prices?address=Toronto,+ON&radius=15' -TimeoutSec 30
Write-Host "count: $($res.count)"
Write-Host ""

$first5 = $res.prices | Select-Object -First 5
Write-Host "=== Sample (first 5) ==="
$first5 | ForEach-Object { Write-Host "site_id=$($_.site_id) fuel=$($_.fuel_type) name=$($_.name) brand=$($_.brand) cost=$($_.cost)" }

Write-Host ""
Write-Host "=== Fuel types in response ==="
$res.prices | Group-Object -Property fuel_type | ForEach-Object { Write-Host "$($_.Count)  $($_.Name)" }

Write-Host ""
Write-Host "=== Same station, different fuel types ==="
$res.prices | Where-Object { $_.site_id -eq 'gasbuddy_1288' } | ForEach-Object { Write-Host "fuel=$($_.fuel_type) cost=$($_.cost) name=$($_.name)" }
