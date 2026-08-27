@echo off
rem Builds the github-profile fixture THREE TIMES from the SAME fixture
rem directory -- plain, with --minify, and origin-backed -- and runs the
rem Node build-output assertion suite against all three. Windows mirror of
rem run-tests.sh: pre-launch process check, then a hard fail on any
rem deprecation, error, or missing-layout line in any build log.
rem
rem NETWORK: loopback only. The fixture shadows the module's remote-fetch
rem partial with a canned data file, so the first two builds are fully
rem offline; the third fetches one avatar image from serve-origin.mjs on
rem 127.0.0.1, which is what renders the shared avatar partial's fetch
rem success arm on a site importing github-profile ALONE. cmd has no trap,
rem so an early exit can leave the origin running; that is bounded rather
rem than unhandled -- the server gives up on its own after fifteen minutes,
rem and every run stops a previous one before starting its own.
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
set LOG_FILE_ORIGIN=%~dp0hugo-build-origin.log
set ORIGIN_LOG=%~dp0fixture-origin.log

rem Fixed, because a Hugo configuration file cannot learn a port at run time
rem and fixture\origin.toml names this one. Kept in step with the value in
rem serve-origin.mjs, run-tests.sh and fixture\origin.toml.
set ORIGIN_PORT=1717

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

rem ---- The origin-backed build ----
call node "%~dp0serve-origin.mjs" stop >nul 2>&1
start "github-profile-origin" /b node "%~dp0serve-origin.mjs" serve %ORIGIN_PORT% > "%ORIGIN_LOG%" 2>&1
call node "%~dp0serve-origin.mjs" wait %ORIGIN_PORT%
if errorlevel 1 (
  echo The fixture origin did not start on 127.0.0.1:%ORIGIN_PORT%:
  type "%ORIGIN_LOG%"
  call node "%~dp0serve-origin.mjs" stop >nul 2>&1
  exit /b 1
)

pushd "%~dp0fixture"
hugo --gc --logLevel info --config hugo.toml,origin.toml --cleanDestinationDir --destination public\origin > "%LOG_FILE_ORIGIN%" 2>&1
if errorlevel 1 (
  echo hugo build failed ^(public\origin^):
  type "%LOG_FILE_ORIGIN%"
  popd
  call node "%~dp0serve-origin.mjs" stop >nul 2>&1
  exit /b 1
)
popd

call node "%~dp0serve-origin.mjs" stop >nul 2>&1

for %%L in ("%LOG_FILE%" "%LOG_FILE_MINIFIED%" "%LOG_FILE_ORIGIN%") do (
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
set FIXTURE_PUBLIC_ORIGIN=%~dp0fixture\public\origin
set HUGO_BUILD_LOG=%LOG_FILE%
set HUGO_BUILD_LOG_MINIFIED=%LOG_FILE_MINIFIED%
set HUGO_BUILD_LOG_ORIGIN=%LOG_FILE_ORIGIN%

pushd "%~dp0"
call npm test %*
set EXITCODE=%ERRORLEVEL%
popd

rem The logs are retained (gitignored at the repo root) so the documented
rem re-run recipe can read them without rebuilding.
rem Belt-and-suspenders cleanup, mirroring modules/agent-readiness/test/run-tests.cmd.
taskkill /F /IM hugo.exe >nul 2>&1
call node "%~dp0serve-origin.mjs" stop >nul 2>&1
exit /b %EXITCODE%
