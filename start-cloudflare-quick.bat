@echo off
echo ========================================
echo   Cloudflare Quick Tunnel - DBTotal
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

echo [OK] Servidor detectado na porta 3000
echo.
echo ========================================
echo   IMPORTANTE
echo ========================================
echo.
echo 1. Uma URL aparecera abaixo (tipo: https://abc123.trycloudflare.com)
echo 2. COPIE essa URL
echo 3. Atualize script.js linha 10 com: URL + /api
echo 4. Faca commit e push
echo.
echo Mantenha este terminal aberto enquanto usar!
echo.
echo ========================================
echo.

cloudflared tunnel --url http://localhost:3000

pause

