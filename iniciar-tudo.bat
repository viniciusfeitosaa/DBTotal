@echo off
echo ========================================
echo   DBTotal - Iniciar Servidor e Tunnel
echo ========================================
echo.

REM Navegar para a pasta do projeto
cd /d "%~dp0"

REM Verificar se estamos na pasta correta
if not exist "server.js" (
    echo [ERRO] Arquivo server.js nao encontrado!
    echo Certifique-se de que este script esta na pasta do projeto.
    pause
    exit /b 1
)

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

REM Verificar se node está instalado
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERRO] Node.js nao encontrado!
    echo Instale o Node.js primeiro.
    pause
    exit /b 1
)

REM Verificar se já existe servidor rodando na porta 3000
netstat -ano | findstr :3000 >nul
if %errorlevel% equ 0 (
    echo [AVISO] Ja existe um servidor rodando na porta 3000!
    echo Deseja continuar mesmo assim? (S/N)
    set /p continue=
    if /i not "%continue%"=="S" (
        exit /b 1
    )
)

echo [1/2] Iniciando servidor Node.js...
start "DBTotal - Servidor" cmd /k "npm start"

echo [INFO] Aguardando servidor iniciar...
timeout /t 8 /nobreak >nul

REM Verificar se servidor iniciou corretamente
:check_server
netstat -ano | findstr :3000 >nul
if %errorlevel% neq 0 (
    echo [INFO] Aguardando servidor iniciar (mais 5 segundos)...
    timeout /t 5 /nobreak >nul
    goto check_server
)

echo [OK] Servidor iniciado em http://localhost:3000
echo.

echo [2/2] Iniciando Cloudflare Tunnel...
start "DBTotal - Cloudflare Tunnel" cmd /k "cloudflared tunnel --url http://localhost:3000"

timeout /t 3 /nobreak >nul

echo.
echo ========================================
echo   IMPORTANTE
echo ========================================
echo.
echo 1. Uma URL aparecera na janela do Tunnel
echo    (tipo: https://abc123.trycloudflare.com)
echo 2. COPIE essa URL
echo 3. Atualize script.js linha 10 com: URL + /api
echo 4. Faca commit e push
echo.
echo Mantenha ambas as janelas abertas enquanto usar!
echo.
echo Pressione qualquer tecla para fechar esta janela...
pause >nul
