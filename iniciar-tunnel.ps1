# Script PowerShell para iniciar Cloudflare Quick Tunnel
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Cloudflare Quick Tunnel - DBTotal" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Verificar se servidor está rodando
Write-Host "Verificando se servidor está rodando..." -ForegroundColor Yellow
$serverRunning = netstat -ano | Select-String ":3000" | Select-String "LISTENING"

if (-not $serverRunning) {
    Write-Host "[ERRO] Servidor não está rodando na porta 3000!" -ForegroundColor Red
    Write-Host "Execute 'npm start' primeiro." -ForegroundColor Yellow
    Read-Host "Pressione Enter para sair"
    exit 1
}

Write-Host "[OK] Servidor detectado na porta 3000" -ForegroundColor Green
Write-Host ""

# Verificar se cloudflared existe
$cloudflaredPath = ".\cloudflared.exe"
if (-not (Test-Path $cloudflaredPath)) {
    Write-Host "[ERRO] cloudflared.exe não encontrado na pasta atual!" -ForegroundColor Red
    Write-Host "Baixe de: https://github.com/cloudflare/cloudflared/releases/latest" -ForegroundColor Yellow
    Read-Host "Pressione Enter para sair"
    exit 1
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  IMPORTANTE" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Uma URL aparecerá abaixo (tipo: https://abc123.trycloudflare.com)" -ForegroundColor White
Write-Host "2. COPIE essa URL" -ForegroundColor White
Write-Host "3. Atualize script.js linha 10 com: URL + /api" -ForegroundColor White
Write-Host "4. Faça commit e push" -ForegroundColor White
Write-Host ""
Write-Host "Mantenha este terminal aberto enquanto usar!" -ForegroundColor Yellow
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Executar cloudflared
& $cloudflaredPath tunnel --url http://localhost:3000

