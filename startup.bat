@echo off
REM Script para iniciar servidor e tunnel automaticamente
REM Coloque este arquivo na pasta de inicialização do Windows (shell:startup)

echo ========================================
echo   Iniciando DBTotal - Servidor e Tunnel
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

REM Iniciar servidor em nova janela
echo [INFO] Iniciando servidor...
start "DBTotal - Servidor" cmd /k "npm start"

REM Aguardar servidor iniciar
echo [INFO] Aguardando servidor iniciar...
timeout /t 5 /nobreak >nul

REM Verificar se servidor esta rodando
netstat -ano | findstr :3000 >nul
if %errorlevel% neq 0 (
    echo [AVISO] Servidor pode nao ter iniciado corretamente
    echo Aguardando mais 5 segundos...
    timeout /t 5 /nobreak >nul
)

REM Iniciar tunnel em nova janela
echo [INFO] Iniciando Cloudflare Tunnel...
if exist "cloudflared.exe" (
    start "DBTotal - Cloudflare Tunnel" cmd /k "cloudflared.exe tunnel --url http://localhost:3000"
) else (
    echo [ERRO] cloudflared.exe nao encontrado!
    echo Execute: .\iniciar-tunnel.ps1 manualmente
)

echo.
echo [OK] Servidor e Tunnel iniciados!
echo.
echo IMPORTANTE:
echo - Mantenha ambas as janelas abertas
echo - A URL do tunnel aparecera na janela do tunnel
echo - Se a URL mudar, atualize script.js e faca commit
echo.
echo Pressione qualquer tecla para fechar esta janela...
pause >nul

