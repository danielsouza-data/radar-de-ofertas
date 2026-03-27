@echo off
CLS
echo.
echo ========================================
echo  Diagnostico do Projeto
echo ========================================
echo.

cd /d "C:\Users\daniel.s.santos\Documents\Agents\Radar de Ofertas"
set "PATH=%CD%\node-portable;%PATH%"
set "NODE_OPTIONS=--no-deprecation"

echo.
echo Verificando Node portatil...
node -v
call npm.cmd -v

echo.
echo Verificando arquivos principais...
if exist "autenticar-sessao.js" (echo   OK autenticar-sessao.js) else (echo   FALTA autenticar-sessao.js)
if exist "disparo-completo.js" (echo   OK disparo-completo.js) else (echo   FALTA disparo-completo.js)
if exist "bin\dashboard-server.js" (echo   OK bin\dashboard-server.js) else (echo   FALTA bin\dashboard-server.js)
if exist "public\dashboard.html" (echo   OK public\dashboard.html) else (echo   FALTA public\dashboard.html)

echo.
echo Verificando sessao WhatsApp...
if exist ".wwebjs_sessions\producao" (echo   OK sessao encontrada em .wwebjs_sessions\producao) else (echo   AVISO sessao nao encontrada)

echo.
echo Verificando logs e status...
if exist "data\disparos-log.json" (echo   OK data\disparos-log.json) else (echo   AVISO disparos-log.json nao encontrado)
if exist "data\whatsapp-status.json" (echo   OK data\whatsapp-status.json) else (echo   AVISO whatsapp-status.json nao encontrado)
echo.
echo ========================================

echo Diagnostico concluido.

pause
