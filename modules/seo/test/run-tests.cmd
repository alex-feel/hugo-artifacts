@echo off
rem Builds the fixture site SIX TIMES with hugo (a BUILD, not a server: no port
rem binding, and a finite build exits by itself) and runs the Node
rem build-output assertion suite against all six trees. Windows mirror of
rem run-tests.sh: pre-launch process check, then a hard fail on any
rem deprecation or error output in any build log.
rem
rem The default environment omits [seo.alternates], [seo.links] and
rem [seo] content_license, proving those additions are inert when
rem unconfigured; the `configured` environment adds exactly those three; the
rem `subpath` environment repeats them under a baseURL carrying a PATH, which
rem is the only shape that can tell a correct URL absolutization from a broken
rem one; the `badtypes` and `offswitch` environments hold the config shapes
rem that used to stop the build or silently disable the module; the
rem `multilingual` environment adds a second language whose params set a
rem noindex robots baseline, the only shape that can tell a per-language
rem params read from a rendering-language one.
setlocal

tasklist /FI "IMAGENAME eq hugo.exe" | find /I "hugo.exe" >nul
if not errorlevel 1 (
  echo A hugo process is already running; stop it first: taskkill /F /IM hugo.exe
  exit /b 1
)

set LOG_FILE=%~dp0hugo-build.log
set LOG_FILE_CONFIGURED=%~dp0hugo-build-configured.log
set LOG_FILE_SUBPATH=%~dp0hugo-build-subpath.log
set LOG_FILE_BADTYPES=%~dp0hugo-build-badtypes.log
set LOG_FILE_OFFSWITCH=%~dp0hugo-build-offswitch.log
set LOG_FILE_MULTILINGUAL=%~dp0hugo-build-multilingual.log

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
hugo -e subpath --logLevel info --cleanDestinationDir --destination public\subpath > "%LOG_FILE_SUBPATH%" 2>&1
if errorlevel 1 (
  echo hugo build failed ^(subpath^):
  type "%LOG_FILE_SUBPATH%"
  popd
  exit /b 1
)
hugo -e badtypes --logLevel info --cleanDestinationDir --destination public\badtypes > "%LOG_FILE_BADTYPES%" 2>&1
if errorlevel 1 (
  echo hugo build failed ^(badtypes^):
  type "%LOG_FILE_BADTYPES%"
  popd
  exit /b 1
)
hugo -e offswitch --logLevel info --cleanDestinationDir --destination public\offswitch > "%LOG_FILE_OFFSWITCH%" 2>&1
if errorlevel 1 (
  echo hugo build failed ^(offswitch^):
  type "%LOG_FILE_OFFSWITCH%"
  popd
  exit /b 1
)
hugo -e multilingual --logLevel info --cleanDestinationDir --destination public\multilingual > "%LOG_FILE_MULTILINGUAL%" 2>&1
if errorlevel 1 (
  echo hugo build failed ^(multilingual^):
  type "%LOG_FILE_MULTILINGUAL%"
  popd
  exit /b 1
)
popd

for %%L in ("%LOG_FILE%" "%LOG_FILE_CONFIGURED%" "%LOG_FILE_SUBPATH%" "%LOG_FILE_BADTYPES%" "%LOG_FILE_OFFSWITCH%" "%LOG_FILE_MULTILINGUAL%") do (
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
set FIXTURE_PUBLIC_SUBPATH=%~dp0fixture\public\subpath
set FIXTURE_PUBLIC_BADTYPES=%~dp0fixture\public\badtypes
set FIXTURE_PUBLIC_OFFSWITCH=%~dp0fixture\public\offswitch
set FIXTURE_PUBLIC_MULTILINGUAL=%~dp0fixture\public\multilingual
set HUGO_BUILD_LOG=%LOG_FILE%
set HUGO_BUILD_LOG_CONFIGURED=%LOG_FILE_CONFIGURED%
set HUGO_BUILD_LOG_SUBPATH=%LOG_FILE_SUBPATH%
set HUGO_BUILD_LOG_BADTYPES=%LOG_FILE_BADTYPES%
set HUGO_BUILD_LOG_OFFSWITCH=%LOG_FILE_OFFSWITCH%
set HUGO_BUILD_LOG_MULTILINGUAL=%LOG_FILE_MULTILINGUAL%
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
