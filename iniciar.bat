@echo off
CLS
echo.
echo ========================================
echo  Radar de Ofertas - Dashboard
echo ========================================
echo.

cd /d "C:\Users\daniel.s.santos\Documents\Agents\Radar de Ofertas"

set "PATH=%CD%\node-portable;%PATH%"
set "NODE_OPTIONS=--no-deprecation"

echo Iniciando dashboard local...
echo Acesse: http://localhost:3000/dashboard.html
echo.
echo Pressione CTRL+C para parar
echo.

node bin\dashboard-server.js

pause
