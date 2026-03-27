@echo off
setlocal enabledelayedexpansion

set "ROOT=%~dp0"
cd /d "%ROOT%"

set "SUFIXO="
set "APPLY_FLAG="

if "%~1"=="" goto :auto

if /I "%~1"=="auto" (
  if /I "%~2"=="apply" set "APPLY_FLAG=--apply"
  goto :auto
)

set "SUFIXO=%~1"
if /I "%~2"=="apply" set "APPLY_FLAG=--apply"
goto :run

:auto
for /f "usebackq delims=" %%I in (`powershell -NoProfile -Command "$f=Get-ChildItem -Path 'data' -File -Filter 'ml-linkbuilder-input-*.txt' | Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty BaseName; if($f){$f -replace '^ml-linkbuilder-input-',''}"`) do set "SUFIXO=%%I"

if not defined SUFIXO (
  echo [ERRO] Nenhum lote encontrado em data\ml-linkbuilder-input-*.txt
  exit /b 2
)

echo [INFO] Lote detectado automaticamente: %SUFIXO%

:run
set "INPUT=data\ml-linkbuilder-input-%SUFIXO%.txt"
set "OUTPUT=data\ml-linkbuilder-output-%SUFIXO%.txt"
set "PAIRS=data\ml-pairs-%SUFIXO%-prevalidate.txt"
set "REPORT=data\ml-prevalidate-%SUFIXO%.json"

if not exist "%INPUT%" (
  echo [ERRO] Arquivo de entrada nao encontrado: %INPUT%
  exit /b 2
)

if not exist "%OUTPUT%" (
  echo [ERRO] Arquivo de saida nao encontrado: %OUTPUT%
  exit /b 2
)

echo [INFO] Executando pre-validacao do lote %SUFIXO%...
"%ROOT%node-portable\node.exe" "%ROOT%scripts\prevalidate-ml-linkbuilder-batch.js" --input "%INPUT%" --output "%OUTPUT%" --pairs "%PAIRS%" --report "%REPORT%" %APPLY_FLAG%
set "EXITCODE=%ERRORLEVEL%"

echo.
echo [INFO] Relatorio: %REPORT%
echo [INFO] Pares: %PAIRS%

if "%EXITCODE%"=="0" (
  echo [OK] Pre-validacao concluida com sucesso.
) else (
  echo [ALERTA] Pre-validacao retornou codigo %EXITCODE%.
  echo [ALERTA] Revise o relatorio antes de seguir.
)

exit /b %EXITCODE%

:usage
echo Uso:
echo   validar-ml-lote.bat
echo   validar-ml-lote.bat auto
echo   validar-ml-lote.bat auto apply
echo   validar-ml-lote.bat SUFIXO
echo   validar-ml-lote.bat SUFIXO apply
echo.
echo Exemplo:
echo   validar-ml-lote.bat
echo   validar-ml-lote.bat auto apply
echo   validar-ml-lote.bat 30f
echo   validar-ml-lote.bat 30f apply
exit /b 1
