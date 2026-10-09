param([int]$Port = 8000)
Write-Host "Serving $PSScriptRoot on http://localhost:$Port"
python -m http.server $Port
