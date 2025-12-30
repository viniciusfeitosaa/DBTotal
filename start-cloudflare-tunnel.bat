@echo off
echo ========================================
echo   Cloudflare Tunnel - DBTotal
echo ========================================
echo.

REM Verificar se cloudflared está instalado
where cloudflared >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERRO] cloudflared nao encontrado!
    echo.
    echo Instale executando:
    echo   PowerShell -ExecutionPolicy Bypass -File instalar-cloudflared.ps1
    echo.
    pause
    exit /b 1
)

REM Verificar se servidor está rodando
echo Verificando se servidor esta rodando...
netstat -ano | findstr :3000 >nul
if %errorlevel% neq 0 (
    echo [AVISO] Servidor nao esta rodando na porta 3000!
    echo Execute 'npm start' em outro terminal primeiro.
    echo.
    echo Deseja continuar mesmo assim? (S/N)
    set /p continue=
    if /i not "%continue%"=="S" (
        exit /b 1
    )
)

echo [OK] Iniciando Cloudflare Tunnel...
echo.
echo IMPORTANTE: Mantenha este terminal aberto!
echo.
echo Se o tunnel nao estiver configurado, siga o guia:
echo   CONFIGURAR_CLOUDFLARE_TUNNEL.md
echo.

REM Tentar usar config.yml se existir
if exist config.yml (
    echo [INFO] Usando config.yml...
    cloudflared tunnel --config config.yml run
) else (
    echo [INFO] Tentando usar tunnel: dbtotal-backend
    cloudflared tunnel run dbtotal-backend
)

pause

