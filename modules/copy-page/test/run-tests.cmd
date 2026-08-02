@echo off
rem Serves the fixture site with hugo and runs the Playwright suite against
rem it. Windows mirror of run-tests.sh: pre-launch process check, deprecation
rem gate on the server log, and forced hugo cleanup afterward.
setlocal enabledelayedexpansion
if "%PORT%"=="" set PORT=1616

tasklist /FI "IMAGENAME eq hugo.exe" | find /I "hugo.exe" >nul
if not errorlevel 1 (
  echo A hugo process is already running; stop it first: taskkill /F /IM hugo.exe
  exit /b 1
)

rem ---- Static overlay: the site-wide kill switch ----
rem Built once before the server starts: params.copy_page.enable = false must
rem strip every widget root and script tag from the whole build; the suite
rem proves it with filesystem assertions against this tree. The log is
rem retained and gitignored (hugo-build*.log).
pushd "%~dp0fixture"
hugo --gc --logLevel info --cleanDestinationDir --config hugo.toml,killed.toml --destination public\killed > "%~dp0hugo-build-killed.log" 2>&1
if errorlevel 1 (
  echo hugo build failed ^(killed overlay^):
  type "%~dp0hugo-build-killed.log"
  popd
  exit /b 1
)
popd
findstr /I "deprecat" "%~dp0hugo-build-killed.log" >nul 2>&1
if not errorlevel 1 (
  echo Hugo reported deprecations ^(killed overlay^):
  findstr /I "deprecat" "%~dp0hugo-build-killed.log"
  exit /b 1
)

pushd "%~dp0fixture"
start "copy-page-fixture" /b hugo server --port %PORT% --bind 127.0.0.1 --logLevel info > "%~dp0.hugo-server.log" 2>&1
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
rem npm rather than npx: npx resolves the binary through its own global cache
rem first, and when that cache holds a Playwright of its own the run loads two
rem copies and dies with "No tests found". npm runs this package's own script,
rem which resolves the binary from this directory's node_modules.
call npm test %*
set EXITCODE=%ERRORLEVEL%
popd

taskkill /F /IM hugo.exe >nul 2>&1
del "%~dp0.hugo-server.log" >nul 2>&1
exit /b %EXITCODE%
