@echo off
rem Builds the fixture site EIGHTEEN TIMES with hugo (a BUILD, not a server: no
rem port binding, and a finite build exits by itself) and runs the Node
rem build-output assertion suite against the seventeen trees that succeed. Windows
rem mirror of run-tests.sh: pre-launch process check, then a hard fail on any
rem deprecation or error output in any build log.
rem
rem The default environment omits [params.url_retirement] entirely, so it is
rem the only build that shows what a site that configured nothing gets; the
rem `configured` environment turns on every knob at once; the `degraded`
rem environment holds every fault class at once, so N distinct faults must
rem produce N distinct diagnostics; `degraded-shapes` holds the faults that
rem cannot share a key with those; the `off` environment shows a disabled
rem module writing nothing at all while the site around it builds normally and
rem `partial` switches one document off while the other keeps publishing; the
rem `conflict` environment is the only one whose content claims one retired URL
rem twice; the `multilingual` environment is the only shape in which one
rem _redirects file is written by two languages, `multilingual-partial` the
rem only one where a sibling exists but publishes nothing, and
rem `multilingual-subdir` the only one that moves the default language into its
rem own directory, which reverses the root redirect, and `multihost` the only
rem one giving each language its own baseURL, where /_redirects is written once
rem per host rather than once for the deployment; `pagerpath` renames
rem the pagination segment without telling the module, so a rule carrying that
rem name was derived from a pager URL rather than read from configuration;
rem `ugly` is the only build in which the URL Hugo reports for a page and the
rem URL it serves that page at come apart; `html-last` and `html-missing` are
rem the only two that change the order and the membership of the home page's
rem output format list, the first being the only build in which the manifest
rem format's weight reaches a URL -- below html's 10 it moves that build's
rem sitemap entry for the home page onto the manifest -- and the second being
rem the only build where the home page has no html output at all and every URL
rem for it becomes this module's own document; `subpath`
rem and `canonify` are a PAIR that must agree byte for byte, which a
rem root-baseURL build cannot check; and the `hostile` environment is the only
rem build that MUST FAIL, because its content carries an alias containing
rem whitespace.
setlocal

tasklist /FI "IMAGENAME eq hugo.exe" | find /I "hugo.exe" >nul
if not errorlevel 1 (
  echo A hugo process is already running; stop it first: taskkill /F /IM hugo.exe
  exit /b 1
)

set LOG_BASELINE=%~dp0hugo-build-baseline.log
set LOG_CONFIGURED=%~dp0hugo-build-configured.log
set LOG_DEGRADED=%~dp0hugo-build-degraded.log
set LOG_SHAPES=%~dp0hugo-build-degraded-shapes.log
set LOG_PARTIAL=%~dp0hugo-build-partial.log
set LOG_CONFLICT=%~dp0hugo-build-conflict.log
set LOG_MULTIPARTIAL=%~dp0hugo-build-multilingual-partial.log
set LOG_MULTISUBDIR=%~dp0hugo-build-multilingual-subdir.log
set LOG_MULTIHOST=%~dp0hugo-build-multihost.log
set LOG_OFF=%~dp0hugo-build-off.log
set LOG_MULTILINGUAL=%~dp0hugo-build-multilingual.log
set LOG_SUBPATH=%~dp0hugo-build-subpath.log
set LOG_CANONIFY=%~dp0hugo-build-canonify.log
set LOG_PAGERPATH=%~dp0hugo-build-pagerpath.log
set LOG_UGLY=%~dp0hugo-build-ugly.log
set LOG_HTMLLAST=%~dp0hugo-build-html-last.log
set LOG_HTMLMISSING=%~dp0hugo-build-html-missing.log
set LOG_HOSTILE=%~dp0hugo-build-hostile.log

rem The destination is REMOVED, not merely cleaned: --cleanDestinationDir only
rem drops files absent from the static directories, so a document a previous
rem build published and this one does not would survive into the tree the specs
rem read, and one of this suite's assertions is that a disabled module
rem publishes NOTHING.
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
hugo -e degraded-shapes --logLevel info --cleanDestinationDir --destination public\degraded-shapes > "%LOG_SHAPES%" 2>&1
if errorlevel 1 (
  echo hugo build failed ^(degraded-shapes^):
  type "%LOG_SHAPES%"
  popd
  exit /b 1
)
hugo -e conflict --logLevel info --cleanDestinationDir --destination public\conflict > "%LOG_CONFLICT%" 2>&1
if errorlevel 1 (
  echo hugo build failed ^(conflict^):
  type "%LOG_CONFLICT%"
  popd
  exit /b 1
)
hugo -e partial --logLevel info --cleanDestinationDir --destination public\partial > "%LOG_PARTIAL%" 2>&1
if errorlevel 1 (
  echo hugo build failed ^(partial^):
  type "%LOG_PARTIAL%"
  popd
  exit /b 1
)
hugo -e multilingual-partial --logLevel info --cleanDestinationDir --destination public\multilingual-partial > "%LOG_MULTIPARTIAL%" 2>&1
if errorlevel 1 (
  echo hugo build failed ^(multilingual-partial^):
  type "%LOG_MULTIPARTIAL%"
  popd
  exit /b 1
)
hugo -e off --logLevel info --cleanDestinationDir --destination public\off > "%LOG_OFF%" 2>&1
if errorlevel 1 (
  echo hugo build failed ^(off^):
  type "%LOG_OFF%"
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
hugo -e multilingual-subdir --logLevel info --cleanDestinationDir --destination public\multilingual-subdir > "%LOG_MULTISUBDIR%" 2>&1
if errorlevel 1 (
  echo hugo build failed ^(multilingual-subdir^):
  type "%LOG_MULTISUBDIR%"
  popd
  exit /b 1
)
hugo -e multihost --logLevel info --cleanDestinationDir --destination public\multihost > "%LOG_MULTIHOST%" 2>&1
if errorlevel 1 (
  echo hugo build failed ^(multihost^):
  type "%LOG_MULTIHOST%"
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
hugo -e canonify --logLevel info --cleanDestinationDir --destination public\canonify > "%LOG_CANONIFY%" 2>&1
if errorlevel 1 (
  echo hugo build failed ^(canonify^):
  type "%LOG_CANONIFY%"
  popd
  exit /b 1
)
hugo -e pagerpath --logLevel info --cleanDestinationDir --destination public\pagerpath > "%LOG_PAGERPATH%" 2>&1
if errorlevel 1 (
  echo hugo build failed ^(pagerpath^):
  type "%LOG_PAGERPATH%"
  popd
  exit /b 1
)
hugo -e ugly --logLevel info --cleanDestinationDir --destination public\ugly > "%LOG_UGLY%" 2>&1
if errorlevel 1 (
  echo hugo build failed ^(ugly^):
  type "%LOG_UGLY%"
  popd
  exit /b 1
)
hugo -e html-last --logLevel info --cleanDestinationDir --destination public\html-last > "%LOG_HTMLLAST%" 2>&1
if errorlevel 1 (
  echo hugo build failed ^(html-last^):
  type "%LOG_HTMLLAST%"
  popd
  exit /b 1
)
hugo -e html-missing --logLevel info --cleanDestinationDir --destination public\html-missing > "%LOG_HTMLMISSING%" 2>&1
if errorlevel 1 (
  echo hugo build failed ^(html-missing^):
  type "%LOG_HTMLMISSING%"
  popd
  exit /b 1
)
rem The hostile build MUST fail: its content carries an alias containing
rem whitespace, and publishing that rule would corrupt the file format.
hugo -e hostile --logLevel info --cleanDestinationDir --destination public\hostile > "%LOG_HOSTILE%" 2>&1
if not errorlevel 1 (
  echo The hostile build was expected to FAIL and did not.
  type "%LOG_HOSTILE%"
  popd
  exit /b 1
)
popd

for %%L in ("%LOG_BASELINE%" "%LOG_CONFIGURED%" "%LOG_DEGRADED%" "%LOG_SHAPES%" "%LOG_PARTIAL%" "%LOG_CONFLICT%" "%LOG_OFF%" "%LOG_MULTILINGUAL%" "%LOG_MULTIPARTIAL%" "%LOG_MULTISUBDIR%" "%LOG_MULTIHOST%" "%LOG_SUBPATH%" "%LOG_CANONIFY%" "%LOG_PAGERPATH%" "%LOG_UGLY%" "%LOG_HTMLLAST%" "%LOG_HTMLMISSING%") do (
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

rem Every build except `degraded` is gated on warnings: the happy path is
rem silent, and producing one diagnostic per fault is the only thing the
rem degraded build exists to demonstrate.
for %%L in ("%LOG_BASELINE%" "%LOG_CONFIGURED%" "%LOG_PARTIAL%" "%LOG_OFF%" "%LOG_MULTILINGUAL%" "%LOG_MULTIPARTIAL%" "%LOG_MULTISUBDIR%" "%LOG_MULTIHOST%" "%LOG_SUBPATH%" "%LOG_CANONIFY%" "%LOG_PAGERPATH%" "%LOG_UGLY%" "%LOG_HTMLLAST%" "%LOG_HTMLMISSING%") do (
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
set FIXTURE_PUBLIC_SHAPES=%~dp0fixture\public\degraded-shapes
set FIXTURE_PUBLIC_PARTIAL=%~dp0fixture\public\partial
set FIXTURE_PUBLIC_CONFLICT=%~dp0fixture\public\conflict
set FIXTURE_PUBLIC_MULTIPARTIAL=%~dp0fixture\public\multilingual-partial
set FIXTURE_PUBLIC_MULTISUBDIR=%~dp0fixture\public\multilingual-subdir
set FIXTURE_PUBLIC_MULTIHOST=%~dp0fixture\public\multihost
set FIXTURE_PUBLIC_OFF=%~dp0fixture\public\off
set FIXTURE_PUBLIC_MULTILINGUAL=%~dp0fixture\public\multilingual
set FIXTURE_PUBLIC_SUBPATH=%~dp0fixture\public\subpath
set FIXTURE_PUBLIC_CANONIFY=%~dp0fixture\public\canonify
set FIXTURE_PUBLIC_PAGERPATH=%~dp0fixture\public\pagerpath
set FIXTURE_PUBLIC_UGLY=%~dp0fixture\public\ugly
set FIXTURE_PUBLIC_HTMLLAST=%~dp0fixture\public\html-last
set FIXTURE_PUBLIC_HTMLMISSING=%~dp0fixture\public\html-missing
set HUGO_BUILD_LOG_BASELINE=%LOG_BASELINE%
set HUGO_BUILD_LOG_CONFIGURED=%LOG_CONFIGURED%
set HUGO_BUILD_LOG_DEGRADED=%LOG_DEGRADED%
set HUGO_BUILD_LOG_SHAPES=%LOG_SHAPES%
set HUGO_BUILD_LOG_PARTIAL=%LOG_PARTIAL%
set HUGO_BUILD_LOG_CONFLICT=%LOG_CONFLICT%
set HUGO_BUILD_LOG_MULTIPARTIAL=%LOG_MULTIPARTIAL%
set HUGO_BUILD_LOG_MULTISUBDIR=%LOG_MULTISUBDIR%
set HUGO_BUILD_LOG_MULTIHOST=%LOG_MULTIHOST%
set HUGO_BUILD_LOG_OFF=%LOG_OFF%
set HUGO_BUILD_LOG_MULTILINGUAL=%LOG_MULTILINGUAL%
set HUGO_BUILD_LOG_SUBPATH=%LOG_SUBPATH%
set HUGO_BUILD_LOG_CANONIFY=%LOG_CANONIFY%
set HUGO_BUILD_LOG_PAGERPATH=%LOG_PAGERPATH%
set HUGO_BUILD_LOG_UGLY=%LOG_UGLY%
set HUGO_BUILD_LOG_HTMLLAST=%LOG_HTMLLAST%
set HUGO_BUILD_LOG_HTMLMISSING=%LOG_HTMLMISSING%
set HUGO_BUILD_LOG_HOSTILE=%LOG_HOSTILE%
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
