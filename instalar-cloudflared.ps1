# Script para instalar e configurar Cloudflare Tunnel
# Execute como Administrador: PowerShell -ExecutionPolicy Bypass -File instalar-cloudflared.ps1

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Instalando Cloudflare Tunnel" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Verificar se já está instalado
$cloudflaredPath = Get-Command cloudflared -ErrorAction SilentlyContinue
if ($cloudflaredPath) {
    Write-Host "[OK] cloudflared já está instalado!" -ForegroundColor Green
    cloudflared --version
    Write-Host ""
    Write-Host "Deseja continuar com a configuração? (S/N)" -ForegroundColor Yellow
    $continue = Read-Host
    if ($continue -ne "S" -and $continue -ne "s") {
        exit
    }
} else {
    Write-Host "[INFO] Baixando cloudflared..." -ForegroundColor Yellow
    
    # Criar pasta temporária
    $tempDir = "$env:TEMP\cloudflared-install"
    if (!(Test-Path $tempDir)) {
        New-Item -ItemType Directory -Path $tempDir | Out-Null
    }
    
    # URL de download (Windows 64-bit)
    $downloadUrl = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
    $downloadPath = "$tempDir\cloudflared.exe"
    
    try {
        Write-Host "[INFO] Baixando de: $downloadUrl" -ForegroundColor Yellow
        Invoke-WebRequest -Uri $downloadUrl -OutFile $downloadPath -UseBasicParsing
        
        Write-Host "[OK] Download concluído!" -ForegroundColor Green
        
        # Verificar se precisa de permissões de admin
        $isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
        
        if ($isAdmin) {
            # Copiar para System32
            Write-Host "[INFO] Instalando em C:\Windows\System32..." -ForegroundColor Yellow
            Copy-Item -Path $downloadPath -Destination "C:\Windows\System32\cloudflared.exe" -Force
            Write-Host "[OK] Instalado com sucesso!" -ForegroundColor Green
        } else {
            # Copiar para pasta do projeto
            Write-Host "[INFO] Instalando na pasta do projeto..." -ForegroundColor Yellow
            $projectPath = Split-Path -Parent $MyInvocation.MyCommand.Path
            Copy-Item -Path $downloadPath -Destination "$projectPath\cloudflared.exe" -Force
            Write-Host "[OK] Instalado em: $projectPath\cloudflared.exe" -ForegroundColor Green
            Write-Host "[AVISO] Para usar globalmente, execute como Administrador ou adicione ao PATH" -ForegroundColor Yellow
        }
        
        # Limpar
        Remove-Item -Path $tempDir -Recurse -Force
        
        Write-Host ""
        Write-Host "[OK] Instalação concluída!" -ForegroundColor Green
        Write-Host ""
        
        # Verificar instalação
        if ($isAdmin) {
            cloudflared --version
        } else {
            & "$projectPath\cloudflared.exe" --version
        }
        
    } catch {
        Write-Host "[ERRO] Falha ao baixar/instalar: $_" -ForegroundColor Red
        Write-Host ""
        Write-Host "Solução manual:" -ForegroundColor Yellow
        Write-Host "1. Baixe manualmente: $downloadUrl" -ForegroundColor Yellow
        Write-Host "2. Renomeie para cloudflared.exe" -ForegroundColor Yellow
        Write-Host "3. Coloque em C:\Windows\System32 (como Admin) ou na pasta do projeto" -ForegroundColor Yellow
        exit 1
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Próximos Passos" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Faça login no Cloudflare:" -ForegroundColor Yellow
Write-Host "   cloudflared tunnel login" -ForegroundColor White
Write-Host ""
Write-Host "2. Crie um tunnel:" -ForegroundColor Yellow
Write-Host "   cloudflared tunnel create dbtotal-backend" -ForegroundColor White
Write-Host ""
Write-Host "3. Configure o DNS no painel do Cloudflare" -ForegroundColor Yellow
Write-Host ""
Write-Host "4. Crie o arquivo config.yml (veja CONFIGURAR_CLOUDFLARE_TUNNEL.md)" -ForegroundColor Yellow
Write-Host ""
Write-Host "5. Execute o tunnel:" -ForegroundColor Yellow
Write-Host "   cloudflared tunnel run dbtotal-backend" -ForegroundColor White
Write-Host ""
Write-Host "Veja o guia completo em: CONFIGURAR_CLOUDFLARE_TUNNEL.md" -ForegroundColor Cyan

