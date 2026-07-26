@echo off
rem Validates the shipped data files, then builds THREE fixture sites with
rem hugo (builds, not servers: no port binding, and a finite build exits by
rem itself) and runs the Node build-output assertion suite against all three.
rem Windows mirror of run-tests.sh: data check first, pre-launch process
rem check, then a hard fail on any deprecation, error, or missing-layout line
rem in any build log.
rem
rem NETWORK: the agent-skills specs exercise a real build-time remote fetch,
rem because the digest guarantee cannot be proven without one.
setlocal

pushd "%~dp0"
call npm run --silent test:data
if errorlevel 1 (
  echo Data-file validation failed; the fixtures were not built.
  popd
  exit /b 1
)
popd

tasklist /FI "IMAGENAME eq hugo.exe" | find /I "hugo.exe" >nul
if not errorlevel 1 (
  echo A hugo process is already running; stop it first: taskkill /F /IM hugo.exe
  exit /b 1
)

set LOG_FILE=%~dp0hugo-build.log
set LOG_FILE_CONFIGURED=%~dp0hugo-build-configured.log
set LOG_FILE_SHADOW=%~dp0hugo-build-shadow.log

pushd "%~dp0fixture"
hugo --gc --logLevel info --cleanDestinationDir --destination public\baseline > "%LOG_FILE%" 2>&1
if errorlevel 1 (
  echo hugo build failed ^(baseline^):
  type "%LOG_FILE%"
  popd
  exit /b 1
)
hugo -e configured --gc --logLevel info --cleanDestinationDir --destination public\configured > "%LOG_FILE_CONFIGURED%" 2>&1
if errorlevel 1 (
  echo hugo build failed ^(configured^):
  type "%LOG_FILE_CONFIGURED%"
  popd
  exit /b 1
)
popd

pushd "%~dp0fixture-shadow"
hugo --gc --logLevel info --cleanDestinationDir --destination public > "%LOG_FILE_SHADOW%" 2>&1
if errorlevel 1 (
  echo hugo build failed ^(shadow^):
  type "%LOG_FILE_SHADOW%"
  popd
  exit /b 1
)
popd

for %%L in ("%LOG_FILE%" "%LOG_FILE_CONFIGURED%" "%LOG_FILE_SHADOW%") do (
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

set FIXTURE_PUBLIC=%~dp0fixture\public\baseline
set FIXTURE_PUBLIC_CONFIGURED=%~dp0fixture\public\configured
set FIXTURE_PUBLIC_SHADOW=%~dp0fixture-shadow\public
set HUGO_BUILD_LOG=%LOG_FILE%
set HUGO_BUILD_LOG_CONFIGURED=%LOG_FILE_CONFIGURED%
set HUGO_BUILD_LOG_SHADOW=%LOG_FILE_SHADOW%
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

rem The logs are retained (gitignored at the repo root) so the documented
rem re-run recipe can read them without rebuilding.
exit /b %EXITCODE%
