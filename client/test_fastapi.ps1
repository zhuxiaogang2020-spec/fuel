$res = Invoke-RestMethod -Uri 'http://localhost:8000/prices?address=Toronto,+ON&radius=15&fuel_type=regular_gas' -TimeoutSec 30
Write-Host "=== Response Header ==="
Write-Host "address: $($res.address)"
Write-Host "count: $($res.count)"
Write-Host "cached: $($res.cached)"
Write-Host "radius_miles: $($res.radius_miles)"
Write-Host ""
Write-Host "=== Brands Distribution ==="
$res.prices | Group-Object -Property brand | ForEach-Object { Write-Host "$($_.Count)  $($_.Name)" }
Write-Host ""
Write-Host "=== Sample stations (first 5) ==="
$res.prices | Select-Object -First 5 | ForEach-Object { 
    Write-Host "site_id=$($_.site_id) name=$($_.name) brand=$($_.brand) cost=$($_.cost) dist=$([math]::Round($_.distance,2))km"
}
