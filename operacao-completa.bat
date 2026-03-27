@echo off
setlocal
cls

set "PROJECT_DIR=%~dp0"
set "LOG_FILE=%PROJECT_DIR%data\launcher.log"
set "DASHBOARD_URL=http://localhost:3000/dashboard.html"
cd /d "%PROJECT_DIR%"
set "PATH=%PROJECT_DIR%node-portable;%PATH%"
set "NODE_OPTIONS=--no-deprecation"
set "RADAR_TOP_N=6"
set "MERCADO_LIVRE_LINKBUILDER_LINKS=https://meli.la/12o3Bpe,https://meli.la/2Qp6GZX"

call :log "Launcher iniciado"

echo.
echo ========================================
echo  Radar de Ofertas - Operacao Completa
echo ========================================
echo.

rem Sobe o dashboard em janela separada se a porta 3000 nao estiver em uso.
netstat -ano | findstr ":3000" >nul 2>&1
if errorlevel 1 (
  echo Iniciando dashboard local em nova janela...
  call :log "Dashboard nao estava ativo; iniciando servidor"
  start "Radar Dashboard" cmd /k "cd /d "%PROJECT_DIR%" && set PATH=%PROJECT_DIR%node-portable;%%PATH%% && set NODE_OPTIONS=--no-deprecation && node bin\dashboard-server.js"
  timeout /t 2 >nul
) else (
  echo Dashboard ja parece estar ativo na porta 3000.
  call :log "Dashboard ja ativo na porta 3000"
)

start "" "%DASHBOARD_URL%" >nul 2>&1
call :log "Navegador aberto em %DASHBOARD_URL%"

echo.
if exist ".wwebjs_sessions\producao" (
  echo Sessao WhatsApp encontrada: .wwebjs_sessions\producao
  call :log "Sessao WhatsApp encontrada"
) else (
  echo AVISO: sessao WhatsApp nao encontrada.
  echo        Rode a autenticacao antes do envio, se necessario.
  call :log "Sessao WhatsApp nao encontrada"
)

echo.
echo Dashboard: %DASHBOARD_URL%
echo.
echo Escolha uma opcao:
echo   [1] Autenticar WhatsApp
echo   [2] Rodar teste com 1 oferta
echo   [3] Iniciar modo agendado (5 min, 09h-22h)
echo   [4] Rodar disparo pontual agora (producao)
echo   [5] Executar diagnostico
echo   [6] Abrir apenas dashboard e sair
echo   [7] Sair
echo.

choice /C 1234567 /N /M "Opcao: "

if errorlevel 7 goto :end
if errorlevel 6 goto :dashboard_only
if errorlevel 5 goto :diag
if errorlevel 4 goto :prod
if errorlevel 3 goto :scheduled
if errorlevel 2 goto :test1
if errorlevel 1 goto :auth

:auth
cls
echo.
echo ========================================
echo  Autenticacao WhatsApp
echo ========================================
echo.
call :log "Opcao escolhida: autenticar WhatsApp"
node autenticar-sessao.js
goto :end

:test1
cls
echo.
echo ========================================
echo  Disparo de Teste - 1 Oferta
echo ========================================
echo.
call :log "Opcao escolhida: disparo de teste com 1 oferta"
set "OFFER_LIMIT=1"
set "RADAR_TOP_N=2"
node disparo-completo.js
goto :end

:scheduled
cls
echo.
echo ========================================
echo  Modo Agendado
echo ========================================
echo.
echo Janela: 09:00 ate 17:00 (todos os dias)
echo Frequencia: a cada 5 minutos
echo.
echo Pressione CTRL+C para encerrar o agendador.
echo.
call :log "Opcao escolhida: iniciar modo agendado"
node agendador-envios.js
goto :end

:prod
cls
echo.
echo ========================================
echo  Disparo Pontual em Producao
echo ========================================
echo.
choice /C SN /N /M "Confirmar disparo pontual agora? [S/N]: "
if errorlevel 2 (
  echo.
  echo Disparo pontual cancelado.
  call :log "Disparo pontual cancelado pelo usuario"
  goto :end
)
call :log "Opcao escolhida: disparo pontual confirmado"
set "OFFER_LIMIT="
set "RADAR_TOP_N=6"
node disparo-completo.js
goto :end

:diag
call :log "Opcao escolhida: diagnostico"
call diagnostico.bat
goto :end

:dashboard_only
echo.
echo Dashboard iniciado. Nenhuma outra acao executada.
call :log "Opcao escolhida: apenas dashboard"
goto :end

:end
echo.
echo Encerrando launcher.
call :log "Launcher encerrado"
endlocal
goto :eof

:log
echo [%date% %time%] %~1>>"%LOG_FILE%"
goto :eof
