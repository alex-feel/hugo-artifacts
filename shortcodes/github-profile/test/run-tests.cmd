@echo off
rem Builds the offline github-profile fixture TWICE from the SAME fixture
rem directory -- once as a plain build, once with --minify -- and runs the
rem Node build-output assertion suite against both. Windows mirror of
rem run-tests.sh: pre-launch process check, then a hard fail on any
rem deprecation, error, or missing-layout line in either build log.
rem
rem NETWORK: none. The fixture shadows the module's remote-fetch partial
rem with a canned data file, so both builds are fully offline.
setlocal

tasklist /FI "IMAGENAME eq hugo.exe" | find /I "hugo.exe" >nul
if not errorlevel 1 (
  echo A hugo process is already running; stop it first: taskkill /F /IM hugo.exe
  exit /b 1
)

if not exist "%~dp0node_modules" (
  pushd "%~dp0"
  call npm install
  if errorlevel 1 (
    echo npm install failed.
    popd
    exit /b 1
  )
  popd
)

set LOG_FILE=%~dp0hugo-build.log
set LOG_FILE_MINIFIED=%~dp0hugo-build-minified.log

pushd "%~dp0fixture"
rem Hugo --cleanDestinationDir never deletes dot-prefixed paths (a stale
rem .well-known artifact survives every rebuild), so the destination root is
rem removed outright before both builds.
if exist public rmdir /s /q public
hugo --gc --logLevel info --cleanDestinationDir --destination public\normal > "%LOG_FILE%" 2>&1
if errorlevel 1 (
  echo hugo build failed ^(public\normal^):
  type "%LOG_FILE%"
  popd
  exit /b 1
)
hugo --gc --logLevel info --cleanDestinationDir --minify --destination public\minified > "%LOG_FILE_MINIFIED%" 2>&1
if errorlevel 1 (
  echo hugo build failed ^(public\minified^):
  type "%LOG_FILE_MINIFIED%"
  popd
  exit /b 1
)
popd

for %%L in ("%LOG_FILE%" "%LOG_FILE_MINIFIED%") do (
  findstr /I "deprecat" %%L >nul 2>&1
  if not errorlevel 1 (
    echo Hugo reported deprecations in %%L:
    findstr /I "deprecat" %%L
    exit /b 1
  )
  findstr /C:"ERROR" %%L >nul 2>&1
  if not errorlevel 1 (
    echo Hugo reported errors in %%L:
    findstr /C:"ERROR" %%L
    exit /b 1
  )
  findstr /C:"found no layout file" %%L >nul 2>&1
  if not errorlevel 1 (
    echo Hugo reported a missing layout in %%L:
    findstr /C:"found no layout file" %%L
    exit /b 1
  )
)

set FIXTURE_PUBLIC=%~dp0fixture\public\normal
set FIXTURE_PUBLIC_MINIFIED=%~dp0fixture\public\minified
set HUGO_BUILD_LOG=%LOG_FILE%
set HUGO_BUILD_LOG_MINIFIED=%LOG_FILE_MINIFIED%

pushd "%~dp0"
call npm test %*
set EXITCODE=%ERRORLEVEL%
popd

rem The logs are retained (gitignored at the repo root) so the documented
rem re-run recipe can read them without rebuilding.
rem Belt-and-suspenders cleanup, mirroring modules/agent-readiness/test/run-tests.cmd.
taskkill /F /IM hugo.exe >nul 2>&1
exit /b %EXITCODE%
