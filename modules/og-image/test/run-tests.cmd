@echo off
rem Builds the fixture site SEVEN TIMES with hugo (a BUILD, not a server: no
rem port binding, and a finite build exits by itself) and runs the Node
rem build-output assertion suite against all seven trees. Windows mirror of
rem run-tests.sh: pre-launch process check, then a hard fail on any
rem deprecation or error output in any build log.
rem
rem The default environment omits [params.ogcard] entirely, so it is the only
rem build that can tell "inert when unconfigured" from "works"; the
rem `configured` environment holds the working card set and is the only build
rem whose log must be silent; the `degraded` environment holds every fault
rem class at once, each on its own section, template or slot, so N distinct
rem faults must produce N distinct diagnostics; the `multilingual`
rem environment composes a card for a page of one language while another is
rem rendering, the only shape in which a per-language read and a
rem rendering-language read disagree; and the `subpath` environment repeats
rem the card set under a baseURL carrying a PATH, the only shape in which a
rem card URL that keeps the base path and one that drops it are different
rem bytes; and the `routing` environment is the only one that sets
rem default_template, which `configured` cannot hold because its decline set
rem is the proof of the opposite statement; and the `typography` environment
rem is the only one whose MODULE level names a face, a width table and a line
rem height, which is what makes the three-level typography cascade measurable,
rem while `configured` keeps naming none of them so that its `unstyled` card
rem states what the module SHIPS.
setlocal

tasklist /FI "IMAGENAME eq hugo.exe" | find /I "hugo.exe" >nul
if not errorlevel 1 (
  echo A hugo process is already running; stop it first: taskkill /F /IM hugo.exe
  exit /b 1
)

set LOG_BASELINE=%~dp0hugo-build-baseline.log
set LOG_CONFIGURED=%~dp0hugo-build-configured.log
set LOG_DEGRADED=%~dp0hugo-build-degraded.log
set LOG_MULTILINGUAL=%~dp0hugo-build-multilingual.log
set LOG_SUBPATH=%~dp0hugo-build-subpath.log
set LOG_ROUTING=%~dp0hugo-build-routing.log
set LOG_TYPOGRAPHY=%~dp0hugo-build-typography.log

rem The destination is REMOVED, not merely cleaned: --cleanDestinationDir only
rem drops files absent from the static directories, so a card a previous build
rem published and this one does not would survive into the tree the specs
rem read, and this suite's central negative assertion is "a declining page
rem produces NO card".
if exist "%~dp0fixture\public" rmdir /S /Q "%~dp0fixture\public"

pushd "%~dp0fixture"
hugo --logLevel info --cleanDestinationDir --destination public\baseline > "%LOG_BASELINE%" 2>&1
if errorlevel 1 (
  echo hugo build failed ^(default^):
  type "%LOG_BASELINE%"
  popd
  exit /b 1
)
hugo -e configured --logLevel info --cleanDestinationDir --destination public\configured > "%LOG_CONFIGURED%" 2>&1
if errorlevel 1 (
  echo hugo build failed ^(configured^):
  type "%LOG_CONFIGURED%"
  popd
  exit /b 1
)
hugo -e degraded --logLevel info --cleanDestinationDir --destination public\degraded > "%LOG_DEGRADED%" 2>&1
if errorlevel 1 (
  echo hugo build failed ^(degraded^):
  type "%LOG_DEGRADED%"
  popd
  exit /b 1
)
hugo -e multilingual --logLevel info --cleanDestinationDir --destination public\multilingual > "%LOG_MULTILINGUAL%" 2>&1
if errorlevel 1 (
  echo hugo build failed ^(multilingual^):
  type "%LOG_MULTILINGUAL%"
  popd
  exit /b 1
)
hugo -e subpath --logLevel info --cleanDestinationDir --destination public\subpath > "%LOG_SUBPATH%" 2>&1
if errorlevel 1 (
  echo hugo build failed ^(subpath^):
  type "%LOG_SUBPATH%"
  popd
  exit /b 1
)
hugo -e routing --logLevel info --cleanDestinationDir --destination public\routing > "%LOG_ROUTING%" 2>&1
if errorlevel 1 (
  echo hugo build failed ^(routing^):
  type "%LOG_ROUTING%"
  popd
  exit /b 1
)
hugo -e typography --logLevel info --cleanDestinationDir --destination public\typography > "%LOG_TYPOGRAPHY%" 2>&1
if errorlevel 1 (
  echo hugo build failed ^(typography^):
  type "%LOG_TYPOGRAPHY%"
  popd
  exit /b 1
)
popd

for %%L in ("%LOG_BASELINE%" "%LOG_CONFIGURED%" "%LOG_DEGRADED%" "%LOG_MULTILINGUAL%" "%LOG_SUBPATH%" "%LOG_ROUTING%" "%LOG_TYPOGRAPHY%") do (
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

rem Only the configured and routing builds are gated on warnings: the happy
rem path is silent, and the other five builds carry the diagnostics they exist
rem to produce.
for %%L in ("%LOG_CONFIGURED%" "%LOG_ROUTING%") do (
  findstr /C:"WARN" %%L >nul 2>&1
  if not errorlevel 1 (
    echo A build that must warn about nothing did: %%L
    findstr /C:"WARN" %%L
    exit /b 1
  )
)

set FIXTURE_DIR=%~dp0fixture
for %%I in ("%~dp0..") do set MODULE_ROOT=%%~fI
set FIXTURE_PUBLIC_BASELINE=%~dp0fixture\public\baseline
set FIXTURE_PUBLIC_CONFIGURED=%~dp0fixture\public\configured
set FIXTURE_PUBLIC_DEGRADED=%~dp0fixture\public\degraded
set FIXTURE_PUBLIC_MULTILINGUAL=%~dp0fixture\public\multilingual
set FIXTURE_PUBLIC_SUBPATH=%~dp0fixture\public\subpath
set FIXTURE_PUBLIC_ROUTING=%~dp0fixture\public\routing
set FIXTURE_PUBLIC_TYPOGRAPHY=%~dp0fixture\public\typography
set HUGO_BUILD_LOG_BASELINE=%LOG_BASELINE%
set HUGO_BUILD_LOG_CONFIGURED=%LOG_CONFIGURED%
set HUGO_BUILD_LOG_DEGRADED=%LOG_DEGRADED%
set HUGO_BUILD_LOG_MULTILINGUAL=%LOG_MULTILINGUAL%
set HUGO_BUILD_LOG_SUBPATH=%LOG_SUBPATH%
set HUGO_BUILD_LOG_ROUTING=%LOG_ROUTING%
set HUGO_BUILD_LOG_TYPOGRAPHY=%LOG_TYPOGRAPHY%
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
