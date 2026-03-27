@echo off
REM Setup script to use local Node.js installation
REM Run this before using node/npm: setup-node.cmd

setlocal enabledelayedexpansion
set "PROJECT_DIR=%~dp0"
set "NODE_DIR=%PROJECT_DIR%node-portable"

REM Add to PATH (session-only)
set "PATH=%NODE_DIR%;%PATH%"

echo.
echo Node.js portatil ativado!
echo   Diretorio: %NODE_DIR%
echo.

node --version
npm --version

echo.
echo Para usar node/npm nesta sessao, rode este comando primeiro:
echo   setup-node.cmd
echo.
