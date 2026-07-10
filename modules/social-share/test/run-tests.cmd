@echo off
rem Serves the fixture site with hugo and runs the Playwright suite against
rem it. Windows mirror of run-tests.sh: pre-launch process check, deprecation
rem gate on the server log, and forced hugo cleanup afterward.
setlocal enabledelayedexpansion
if "%PORT%"=="" set PORT=1414

tasklist /FI "IMAGENAME eq hugo.exe" | find /I "hugo.exe" >nul
if not errorlevel 1 (
  echo A hugo process is already running; stop it first: taskkill /F /IM hugo.exe
  exit /b 1
)

pushd "%~dp0fixture"
start "social-share-fixture" /b hugo server --port %PORT% --bind 127.0.0.1 --logLevel info > "%~dp0.hugo-server.log" 2>&1
popd

set READY=0
for /l %%i in (1,1,60) do (
  curl -fsS "http://localhost:%PORT%/" >nul 2>&1 && set READY=1
  if "!READY!"=="1" goto ready
  timeout /t 1 /nobreak >nul
)
:ready
if "%READY%"=="0" (
  echo Fixture server did not become ready on port %PORT%.
  taskkill /F /IM hugo.exe >nul 2>&1
  exit /b 1
)

findstr /I "deprecat" "%~dp0.hugo-server.log" >nul 2>&1
if not errorlevel 1 (
  echo Hugo reported deprecations:
  findstr /I "deprecat" "%~dp0.hugo-server.log"
  taskkill /F /IM hugo.exe >nul 2>&1
  exit /b 1
)

pushd "%~dp0"
set FIXTURE_URL=http://localhost:%PORT%
call npx playwright test %*
set EXITCODE=%ERRORLEVEL%
popd

taskkill /F /IM hugo.exe >nul 2>&1
del "%~dp0.hugo-server.log" >nul 2>&1
exit /b %EXITCODE%
