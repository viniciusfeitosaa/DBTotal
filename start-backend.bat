@echo off
echo ========================================
echo   Iniciando Backend DBTotal
echo ========================================
echo.

echo [1/2] Iniciando servidor Node.js...
start "DBTotal - Servidor" cmd /k "npm start"
timeout /t 5 /nobreak >nul

echo [2/2] Aguardando servidor iniciar...
timeout /t 5 /nobreak >nul

echo.
echo ========================================
echo   Servidor iniciado em http://localhost:3000
echo ========================================
echo.
echo Para expor online, use um dos seguintes:
echo   1. ngrok: ngrok http 3000
echo   2. localtunnel: lt --port 3000
echo   3. Cloudflare Tunnel: cloudflared tunnel run
echo.
echo Pressione qualquer tecla para sair...
pause >nul

