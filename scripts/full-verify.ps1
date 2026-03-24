# EventPulse: tam dogrulama (Docker + migrasyon + entegrasyon + saglik).
# Calistirma: proje kokunden .\scripts\full-verify.ps1 veya npm run verify:full
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

function Step($n, $msg) {
  Write-Host ""
  Write-Host "=== $n $msg ===" -ForegroundColor Cyan
}

Step 1 "Birim testleri"
npm run test
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Step 2 "Coverage (birim)"
npm run test:coverage
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Step 3 "Docker Compose (build + up)"
try {
  docker compose version | Out-Null
} catch {
  Write-Host "Docker CLI yok." -ForegroundColor Red
  exit 1
}
docker compose up -d --build
if ($LASTEXITCODE -ne 0) {
  Write-Host "Docker Compose basarisiz. Docker Desktop acik ve engine calisir olmali." -ForegroundColor Red
  exit $LASTEXITCODE
}

Step 4 "TimescaleDB healthy bekle (en fazla 120 sn)"
$deadline = (Get-Date).AddSeconds(120)
$ok = $false
while ((Get-Date) -lt $deadline) {
  $st = docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' eventpulse-timescaledb 2>$null
  if ($st -eq "healthy") {
    $ok = $true
    break
  }
  Start-Sleep -Seconds 2
}
if (-not $ok) {
  Write-Host "TimescaleDB healthy olmadi." -ForegroundColor Red
  exit 1
}

Step 5 "DB migrasyonlari (01-06)"
$migs = @(
  "01_init_schema.sql",
  "02_anomalies.sql",
  "03_anomalies_p1_columns.sql",
  "04_rules_retention.sql",
  "05_events_source_metadata.sql",
  "06_retention_policy.sql"
)
foreach ($m in $migs) {
  $path = Join-Path $Root "src\db\migrations\$m"
  Write-Host "  -> $m"
  Get-Content -Raw $path | docker exec -i eventpulse-timescaledb psql -U eventpulse -d eventpulse -v ON_ERROR_STOP=1
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Migrasyon hatasi: $m" -ForegroundColor Red
    exit $LASTEXITCODE
  }
}

Step 6 "Entegrasyon testi (Redis + Postgres + Fastify)"
$env:RUN_INTEGRATION = "1"
$env:DATABASE_URL = "postgresql://eventpulse:eventpulse_dev@127.0.0.1:5432/eventpulse"
$env:REDIS_URL = "redis://127.0.0.1:6379"
npm run test:integration
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

Step 7 "API pipeline health (http://127.0.0.1:3000)"
try {
  $r = Invoke-RestMethod -Uri "http://127.0.0.1:3000/api/v1/events/health" -TimeoutSec 15
  $r | ConvertTo-Json -Depth 5
} catch {
  Write-Host "Health istegi basarisiz (API konteyneri ayakta mi?): $_" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Tamamlandi." -ForegroundColor Green
