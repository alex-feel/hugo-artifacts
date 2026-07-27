@echo off
rem Serves the fixture site with hugo and runs the Playwright suite against
rem it. Windows mirror of run-tests.sh: pre-launch process check, two static
rem overlay builds, deprecation gate on the server log, and forced hugo
rem cleanup afterward.
rem
rem The static builds reach the two OpenSearch states the single served
rem fixture cannot be in at once: a hostile site title, which proves the
rem document escapes what it interpolates, and the default-off gate.
setlocal enabledelayedexpansion
if "%PORT%"=="" set PORT=1515

tasklist /FI "IMAGENAME eq hugo.exe" | find /I "hugo.exe" >nul
if not errorlevel 1 (
  echo A hugo process is already running; stop it first: taskkill /F /IM hugo.exe
  exit /b 1
)

set OPENSEARCH_HOSTILE_DIR=%~dp0.opensearch-hostile
set OPENSEARCH_OFF_DIR=%~dp0.opensearch-off
set SUBPATH_DIR=%~dp0.subpath

pushd "%~dp0fixture"
hugo --config hugo.toml,config-opensearch-hostile.toml --quiet --cleanDestinationDir --destination "%OPENSEARCH_HOSTILE_DIR%"
if errorlevel 1 (
  echo Static overlay build failed ^(hostile title^).
  popd
  exit /b 1
)
hugo --config hugo.toml,config-opensearch-off.toml --quiet --cleanDestinationDir --destination "%OPENSEARCH_OFF_DIR%"
if errorlevel 1 (
  echo Static overlay build failed ^(opensearch off^).
  popd
  exit /b 1
)
hugo --config hugo.toml,config-subpath.toml --quiet --cleanDestinationDir --destination "%SUBPATH_DIR%"
if errorlevel 1 (
  echo Static overlay build failed ^(subpath^).
  popd
  exit /b 1
)
popd

pushd "%~dp0fixture"
start "search-fixture" /b hugo server --port %PORT% --bind 127.0.0.1 --logLevel info > "%~dp0.hugo-server.log" 2>&1
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
rd /s /q "%OPENSEARCH_HOSTILE_DIR%" >nul 2>&1
rd /s /q "%OPENSEARCH_OFF_DIR%" >nul 2>&1
rd /s /q "%SUBPATH_DIR%" >nul 2>&1
exit /b %EXITCODE%
