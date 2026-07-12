@echo off
rem Builds the fixture site with hugo (a BUILD, not a server: no port
rem binding, and a finite build exits by itself) and runs the Node
rem build-output assertion suite. Windows mirror of run-tests.sh: pre-launch
rem process check, then a hard fail on any deprecation or error output in
rem the build log.
setlocal

tasklist /FI "IMAGENAME eq hugo.exe" | find /I "hugo.exe" >nul
if not errorlevel 1 (
  echo A hugo process is already running; stop it first: taskkill /F /IM hugo.exe
  exit /b 1
)

set LOG_FILE=%~dp0hugo-build.log
pushd "%~dp0fixture"
hugo --logLevel info --cleanDestinationDir --destination public > "%LOG_FILE%" 2>&1
if errorlevel 1 (
  echo hugo build failed:
  type "%LOG_FILE%"
  popd
  exit /b 1
)
popd

findstr /I "deprecat" "%LOG_FILE%" >nul 2>&1
if not errorlevel 1 (
  echo Hugo reported deprecations:
  findstr /I "deprecat" "%LOG_FILE%"
  exit /b 1
)
findstr /C:"ERROR" "%LOG_FILE%" >nul 2>&1
if not errorlevel 1 (
  echo Hugo reported errors:
  findstr /C:"ERROR" "%LOG_FILE%"
  exit /b 1
)

set FIXTURE_PUBLIC=%~dp0fixture\public
set HUGO_BUILD_LOG=%LOG_FILE%
for /f "tokens=2 delims=v " %%v in ('hugo version') do (
  set HUGO_VERSION_RAW=%%v
  goto gotversion
)
:gotversion
for /f "tokens=1 delims=-+" %%v in ("%HUGO_VERSION_RAW%") do set HUGO_VERSION=%%v

pushd "%~dp0"
call npm test %*
set EXITCODE=%ERRORLEVEL%
popd

rem The log is retained (gitignored at the repo root) so the documented
rem re-run recipe -- FIXTURE_PUBLIC=... HUGO_BUILD_LOG=hugo-build.log
rem npm test -- can read it without rebuilding.
exit /b %EXITCODE%
