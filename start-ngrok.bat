@echo off
echo ========================================
echo   Iniciando ngrok para DBTotal
echo ========================================
echo.
echo Verificando se servidor está rodando...
netstat -ano | findstr :3000 >nul
if %errorlevel% neq 0 (
    echo [ERRO] Servidor não está rodando na porta 3000!
    echo Execute 'npm start' primeiro.
    pause
    exit /b 1
)

echo [OK] Servidor detectado na porta 3000
echo.
echo Iniciando ngrok...
echo.
echo IMPORTANTE: Copie a URL "Forwarding" que aparecerá abaixo
echo Exemplo: https://abc123.ngrok-free.app
echo.
echo Depois atualize script.js linha 10 com essa URL + /api
echo.
pause
ngrok http 3000

