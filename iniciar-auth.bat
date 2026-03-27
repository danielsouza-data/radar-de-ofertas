@echo off
CLS
echo.
echo ========================================
echo  Radar de Ofertas - Autenticacao WhatsApp
echo ========================================
echo.

cd /d "C:\Users\daniel.s.santos\Documents\Agents\Radar de Ofertas"

set "PATH=%CD%\node-portable;%PATH%"
set "NODE_OPTIONS=--no-deprecation"

echo Iniciando autenticacao da sessao...
echo O Chrome sera aberto se o login precisar ser renovado.
echo.
echo Pressione CTRL+C para parar
echo.

node autenticar-sessao.js

pause
