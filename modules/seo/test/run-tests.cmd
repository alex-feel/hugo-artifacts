@echo off
rem Builds the fixture site TWICE with hugo (a BUILD, not a server: no port
rem binding, and a finite build exits by itself) and runs the Node
rem build-output assertion suite against both trees. Windows mirror of
rem run-tests.sh: pre-launch process check, then a hard fail on any
rem deprecation or error output in either build log.
rem
rem The default environment omits [seo.alternates], [seo.links] and
rem [seo] content_license, proving the Phase 7 additions are inert when
rem unconfigured; the `configured` environment adds exactly those three.
setlocal

tasklist /FI "IMAGENAME eq hugo.exe" | find /I "hugo.exe" >nul
if not errorlevel 1 (
  echo A hugo process is already running; stop it first: taskkill /F /IM hugo.exe
  exit /b 1
)

set LOG_FILE=%~dp0hugo-build.log
set LOG_FILE_CONFIGURED=%~dp0hugo-build-configured.log

pushd "%~dp0fixture"
hugo --logLevel info --cleanDestinationDir --destination public\baseline > "%LOG_FILE%" 2>&1
if errorlevel 1 (
  echo hugo build failed ^(default^):
  type "%LOG_FILE%"
  popd
  exit /b 1
)
hugo -e configured --logLevel info --cleanDestinationDir --destination public\configured > "%LOG_FILE_CONFIGURED%" 2>&1
if errorlevel 1 (
  echo hugo build failed ^(configured^):
  type "%LOG_FILE_CONFIGURED%"
  popd
  exit /b 1
)
popd

for %%L in ("%LOG_FILE%" "%LOG_FILE_CONFIGURED%") do (
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
)

set FIXTURE_PUBLIC=%~dp0fixture\public\baseline
set FIXTURE_PUBLIC_CONFIGURED=%~dp0fixture\public\configured
set HUGO_BUILD_LOG=%LOG_FILE%
set HUGO_BUILD_LOG_CONFIGURED=%LOG_FILE_CONFIGURED%
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
