@echo off
rem Validates the shipped data files, starts the fixture ORIGIN, then builds
rem TWENTY-FOUR fixture sites with hugo (builds, not servers: no port binding,
rem and a finite build exits by itself) and runs the Node build-output
rem assertion suite against all twenty-four.
rem Windows mirror of run-tests.sh: data check first, pre-launch process
rem check, then a hard fail on any deprecation, error, or missing-layout line
rem in any build log.
rem
rem THE ORIGIN: the agent-skills specs exercise a real build-time remote fetch,
rem because the digest guarantee cannot be proven without one, and those
rem fetches are answered by serve-origin.mjs on 127.0.0.1 rather than by
rem anybody else's endpoint. cmd has no trap, so an early `exit /b` here can
rem leave the origin running; that is bounded rather than unhandled -- the
rem server gives up on its own after fifteen minutes, and every run stops a
rem previous one before starting its own.
rem
rem NETWORK: the widgets build still fetches the widget modules' remote APIs
rem (GitHub, the Hugging Face Hub, arXiv, YouTube posters); those fetches
rem degrade with WARN lines when tokenless or rate-limited, which the log gates
rem below deliberately tolerate -- they hard-fail on deprecations and errors
rem only.
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
set LOG_FILE_MINIMAL=%~dp0hugo-build-minimal.log
set LOG_FILE_NOTWINS=%~dp0hugo-build-notwins.log
set LOG_FILE_MULTILINGUAL=%~dp0hugo-build-multilingual.log
set LOG_FILE_MULTIHOST=%~dp0hugo-build-multihost.log
set LOG_FILE_LLMSOFF=%~dp0hugo-build-llmsoff.log
set LOG_FILE_EDGE=%~dp0hugo-build-edge.log
set LOG_FILE_EDGE_CANONIFY=%~dp0hugo-build-edge-canonify.log
set LOG_FILE_OFF=%~dp0hugo-build-off.log
set LOG_FILE_BADTABLES=%~dp0hugo-build-badtables.log
set LOG_FILE_NSOFF=%~dp0hugo-build-nsoff.log
set LOG_FILE_NOSECTIONPAGES=%~dp0hugo-build-nosectionpages.log
set LOG_FILE_NOLINKMD=%~dp0hugo-build-nolinkmd.log
set LOG_FILE_NOBUILDTIME=%~dp0hugo-build-nobuildtime.log
set LOG_FILE_LLMSINDEXOFF=%~dp0hugo-build-llmsindexoff.log
set LOG_FILE_UNWIRED=%~dp0hugo-build-unwired.log
set LOG_FILE_NOLINKINDEXES=%~dp0hugo-build-nolinkindexes.log
set LOG_FILE_NOCOMPACT=%~dp0hugo-build-nocompact.log
set LOG_FILE_STRICTSKILLS=%~dp0hugo-build-strictskills.log
set LOG_FILE_SHADOW=%~dp0hugo-build-shadow.log
set LOG_FILE_PAGINATED=%~dp0hugo-build-paginated.log
set LOG_FILE_WIDGETS=%~dp0hugo-build-widgets.log
set LOG_FILE_EXTRA=%~dp0hugo-build-extra.log
set ORIGIN_LOG=%~dp0fixture-origin.log
rem Fixed, because a Hugo configuration file cannot learn a port at run time
rem and the fixture's `source` URLs name this one. Kept in step with the value
rem in serve-origin.mjs and in fixture\config\_default\hugo.toml.
set ORIGIN_PORT=1818

rem ---- The fixture origin ----
rem The stop first clears an origin left behind by an aborted run; a port held
rem by anything else makes the listen fail, which `wait` reports with the
rem server's own message rather than letting the builds fetch from whatever is
rem actually there.
call node "%~dp0serve-origin.mjs" stop >nul 2>&1
start "agent-readiness-origin" /b node "%~dp0serve-origin.mjs" serve %ORIGIN_PORT% > "%ORIGIN_LOG%" 2>&1
call node "%~dp0serve-origin.mjs" wait %ORIGIN_PORT%
if errorlevel 1 (
  echo The fixture origin did not start on 127.0.0.1:%ORIGIN_PORT%:
  type "%ORIGIN_LOG%"
  exit /b 1
)

pushd "%~dp0fixture"
rem Hugo --cleanDestinationDir never deletes dot-prefixed paths (a stale
rem .well-known artifact survives every rebuild), so the destination root is
rem removed outright before the builds.
if exist public rmdir /s /q public
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
hugo -e minimal --gc --logLevel info --cleanDestinationDir --destination public\minimal > "%LOG_FILE_MINIMAL%" 2>&1
if errorlevel 1 (
  echo hugo build failed ^(minimal^):
  type "%LOG_FILE_MINIMAL%"
  popd
  exit /b 1
)
hugo -e notwins --gc --logLevel info --cleanDestinationDir --destination public\notwins > "%LOG_FILE_NOTWINS%" 2>&1
if errorlevel 1 (
  echo hugo build failed ^(notwins^):
  type "%LOG_FILE_NOTWINS%"
  popd
  exit /b 1
)
hugo -e multilingual --gc --logLevel info --cleanDestinationDir --destination public\multilingual > "%LOG_FILE_MULTILINGUAL%" 2>&1
if errorlevel 1 (
  echo hugo build failed ^(multilingual^):
  type "%LOG_FILE_MULTILINGUAL%"
  popd
  exit /b 1
)
hugo -e multihost --gc --logLevel info --cleanDestinationDir --destination public\multihost > "%LOG_FILE_MULTIHOST%" 2>&1
if errorlevel 1 (
  echo hugo build failed ^(multihost^):
  type "%LOG_FILE_MULTIHOST%"
  popd
  exit /b 1
)
hugo -e llmsoff --gc --logLevel info --cleanDestinationDir --destination public\llmsoff > "%LOG_FILE_LLMSOFF%" 2>&1
if errorlevel 1 (
  echo hugo build failed ^(llmsoff^):
  type "%LOG_FILE_LLMSOFF%"
  popd
  exit /b 1
)
hugo -e edge --gc --logLevel info --cleanDestinationDir --destination public\edge > "%LOG_FILE_EDGE%" 2>&1
if errorlevel 1 (
  echo hugo build failed ^(edge^):
  type "%LOG_FILE_EDGE%"
  popd
  exit /b 1
)
rem The same environment with canonifyURLs on, merged as an extra config
rem file rather than restated as a config directory of its own.
hugo -e edge --config ../canonify.toml --gc --logLevel info --cleanDestinationDir --destination public\edge-canonify > "%LOG_FILE_EDGE_CANONIFY%" 2>&1
if errorlevel 1 (
  echo hugo build failed ^(edge-canonify^):
  type "%LOG_FILE_EDGE_CANONIFY%"
  popd
  exit /b 1
)
hugo -e off --gc --logLevel info --cleanDestinationDir --destination public\off > "%LOG_FILE_OFF%" 2>&1
if errorlevel 1 (
  echo hugo build failed ^(off^):
  type "%LOG_FILE_OFF%"
  popd
  exit /b 1
)
hugo -e badtables --gc --logLevel info --cleanDestinationDir --destination public\badtables > "%LOG_FILE_BADTABLES%" 2>&1
if errorlevel 1 (
  echo hugo build failed ^(badtables^):
  type "%LOG_FILE_BADTABLES%"
  popd
  exit /b 1
)
hugo -e nsoff --gc --logLevel info --cleanDestinationDir --destination public\nsoff > "%LOG_FILE_NSOFF%" 2>&1
if errorlevel 1 (
  echo hugo build failed ^(nsoff^):
  type "%LOG_FILE_NSOFF%"
  popd
  exit /b 1
)
hugo -e nosectionpages --gc --logLevel info --cleanDestinationDir --destination public\nosectionpages > "%LOG_FILE_NOSECTIONPAGES%" 2>&1
if errorlevel 1 (
  echo hugo build failed ^(nosectionpages^):
  type "%LOG_FILE_NOSECTIONPAGES%"
  popd
  exit /b 1
)
hugo -e nolinkmd --gc --logLevel info --cleanDestinationDir --destination public\nolinkmd > "%LOG_FILE_NOLINKMD%" 2>&1
if errorlevel 1 (
  echo hugo build failed ^(nolinkmd^):
  type "%LOG_FILE_NOLINKMD%"
  popd
  exit /b 1
)
hugo -e nobuildtime --gc --logLevel info --cleanDestinationDir --destination public\nobuildtime > "%LOG_FILE_NOBUILDTIME%" 2>&1
if errorlevel 1 (
  echo hugo build failed ^(nobuildtime^):
  type "%LOG_FILE_NOBUILDTIME%"
  popd
  exit /b 1
)
hugo -e llmsindexoff --gc --logLevel info --cleanDestinationDir --destination public\llmsindexoff > "%LOG_FILE_LLMSINDEXOFF%" 2>&1
if errorlevel 1 (
  echo hugo build failed ^(llmsindexoff^):
  type "%LOG_FILE_LLMSINDEXOFF%"
  popd
  exit /b 1
)
hugo -e unwired --gc --logLevel info --cleanDestinationDir --destination public\unwired > "%LOG_FILE_UNWIRED%" 2>&1
if errorlevel 1 (
  echo hugo build failed ^(unwired^):
  type "%LOG_FILE_UNWIRED%"
  popd
  exit /b 1
)
hugo -e nolinkindexes --gc --logLevel info --cleanDestinationDir --destination public\nolinkindexes > "%LOG_FILE_NOLINKINDEXES%" 2>&1
if errorlevel 1 (
  echo hugo build failed ^(nolinkindexes^):
  type "%LOG_FILE_NOLINKINDEXES%"
  popd
  exit /b 1
)
hugo -e nocompact --gc --logLevel info --cleanDestinationDir --destination public\nocompact > "%LOG_FILE_NOCOMPACT%" 2>&1
if errorlevel 1 (
  echo hugo build failed ^(nocompact^):
  type "%LOG_FILE_NOCOMPACT%"
  popd
  exit /b 1
)
hugo -e strictskills --gc --logLevel info --cleanDestinationDir --destination public\strictskills > "%LOG_FILE_STRICTSKILLS%" 2>&1
if errorlevel 1 (
  echo hugo build failed ^(strictskills^):
  type "%LOG_FILE_STRICTSKILLS%"
  popd
  exit /b 1
)
popd

pushd "%~dp0fixture-shadow"
rem Hugo --cleanDestinationDir never deletes dot-prefixed paths (a stale
rem .well-known artifact survives every rebuild), so the destination root is
rem removed outright before the builds.
if exist public rmdir /s /q public
hugo --gc --logLevel info --cleanDestinationDir --destination public > "%LOG_FILE_SHADOW%" 2>&1
if errorlevel 1 (
  echo hugo build failed ^(shadow^):
  type "%LOG_FILE_SHADOW%"
  popd
  exit /b 1
)
popd

pushd "%~dp0fixture-paginated"
rem Hugo --cleanDestinationDir never deletes dot-prefixed paths (a stale
rem .well-known artifact survives every rebuild), so the destination root is
rem removed outright before the builds.
if exist public rmdir /s /q public
hugo --gc --logLevel info --cleanDestinationDir --destination public > "%LOG_FILE_PAGINATED%" 2>&1
if errorlevel 1 (
  echo hugo build failed ^(paginated^):
  type "%LOG_FILE_PAGINATED%"
  popd
  exit /b 1
)
popd

pushd "%~dp0fixture-widgets"
rem Hugo --cleanDestinationDir never deletes dot-prefixed paths (a stale
rem .well-known artifact survives every rebuild), so the destination root is
rem removed outright before the builds.
if exist public rmdir /s /q public
hugo --gc --logLevel info --cleanDestinationDir --destination public > "%LOG_FILE_WIDGETS%" 2>&1
if errorlevel 1 (
  echo hugo build failed ^(widgets^):
  type "%LOG_FILE_WIDGETS%"
  popd
  exit /b 1
)
popd

pushd "%~dp0fixture-extra"
rem Hugo --cleanDestinationDir never deletes dot-prefixed paths (a stale
rem .well-known artifact survives every rebuild), so the destination root is
rem removed outright before the builds.
if exist public rmdir /s /q public
hugo --gc --logLevel info --cleanDestinationDir --destination public > "%LOG_FILE_EXTRA%" 2>&1
if errorlevel 1 (
  echo hugo build failed ^(extra^):
  type "%LOG_FILE_EXTRA%"
  popd
  exit /b 1
)
popd

for %%L in ("%LOG_FILE%" "%LOG_FILE_CONFIGURED%" "%LOG_FILE_MINIMAL%" "%LOG_FILE_NOTWINS%" "%LOG_FILE_MULTILINGUAL%" "%LOG_FILE_MULTIHOST%" "%LOG_FILE_LLMSOFF%" "%LOG_FILE_EDGE%" "%LOG_FILE_EDGE_CANONIFY%" "%LOG_FILE_OFF%" "%LOG_FILE_BADTABLES%" "%LOG_FILE_NSOFF%" "%LOG_FILE_NOSECTIONPAGES%" "%LOG_FILE_NOLINKMD%" "%LOG_FILE_NOBUILDTIME%" "%LOG_FILE_LLMSINDEXOFF%" "%LOG_FILE_UNWIRED%" "%LOG_FILE_NOLINKINDEXES%" "%LOG_FILE_NOCOMPACT%" "%LOG_FILE_STRICTSKILLS%" "%LOG_FILE_SHADOW%" "%LOG_FILE_PAGINATED%" "%LOG_FILE_WIDGETS%" "%LOG_FILE_EXTRA%") do (
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
set FIXTURE_PUBLIC_MINIMAL=%~dp0fixture\public\minimal
set FIXTURE_PUBLIC_NOTWINS=%~dp0fixture\public\notwins
set FIXTURE_PUBLIC_MULTILINGUAL=%~dp0fixture\public\multilingual
set FIXTURE_PUBLIC_MULTIHOST=%~dp0fixture\public\multihost
set FIXTURE_PUBLIC_LLMSOFF=%~dp0fixture\public\llmsoff
set FIXTURE_PUBLIC_EDGE=%~dp0fixture\public\edge
set FIXTURE_PUBLIC_EDGE_CANONIFY=%~dp0fixture\public\edge-canonify
set FIXTURE_PUBLIC_OFF=%~dp0fixture\public\off
set FIXTURE_PUBLIC_BADTABLES=%~dp0fixture\public\badtables
set FIXTURE_PUBLIC_NSOFF=%~dp0fixture\public\nsoff
set FIXTURE_PUBLIC_NOSECTIONPAGES=%~dp0fixture\public\nosectionpages
set FIXTURE_PUBLIC_NOLINKMD=%~dp0fixture\public\nolinkmd
set FIXTURE_PUBLIC_NOBUILDTIME=%~dp0fixture\public\nobuildtime
set FIXTURE_PUBLIC_LLMSINDEXOFF=%~dp0fixture\public\llmsindexoff
set FIXTURE_PUBLIC_UNWIRED=%~dp0fixture\public\unwired
set FIXTURE_PUBLIC_NOLINKINDEXES=%~dp0fixture\public\nolinkindexes
set FIXTURE_PUBLIC_NOCOMPACT=%~dp0fixture\public\nocompact
set FIXTURE_PUBLIC_STRICTSKILLS=%~dp0fixture\public\strictskills
set FIXTURE_PUBLIC_SHADOW=%~dp0fixture-shadow\public
set FIXTURE_PUBLIC_PAGINATED=%~dp0fixture-paginated\public
set FIXTURE_PUBLIC_WIDGETS=%~dp0fixture-widgets\public
set FIXTURE_PUBLIC_EXTRA=%~dp0fixture-extra\public
set HUGO_BUILD_LOG=%LOG_FILE%
set HUGO_BUILD_LOG_CONFIGURED=%LOG_FILE_CONFIGURED%
set HUGO_BUILD_LOG_MINIMAL=%LOG_FILE_MINIMAL%
set HUGO_BUILD_LOG_NOTWINS=%LOG_FILE_NOTWINS%
set HUGO_BUILD_LOG_MULTILINGUAL=%LOG_FILE_MULTILINGUAL%
set HUGO_BUILD_LOG_MULTIHOST=%LOG_FILE_MULTIHOST%
set HUGO_BUILD_LOG_LLMSOFF=%LOG_FILE_LLMSOFF%
set HUGO_BUILD_LOG_EDGE=%LOG_FILE_EDGE%
set HUGO_BUILD_LOG_EDGE_CANONIFY=%LOG_FILE_EDGE_CANONIFY%
set HUGO_BUILD_LOG_OFF=%LOG_FILE_OFF%
set HUGO_BUILD_LOG_BADTABLES=%LOG_FILE_BADTABLES%
set HUGO_BUILD_LOG_NSOFF=%LOG_FILE_NSOFF%
set HUGO_BUILD_LOG_NOSECTIONPAGES=%LOG_FILE_NOSECTIONPAGES%
set HUGO_BUILD_LOG_NOLINKMD=%LOG_FILE_NOLINKMD%
set HUGO_BUILD_LOG_NOBUILDTIME=%LOG_FILE_NOBUILDTIME%
set HUGO_BUILD_LOG_LLMSINDEXOFF=%LOG_FILE_LLMSINDEXOFF%
set HUGO_BUILD_LOG_UNWIRED=%LOG_FILE_UNWIRED%
set HUGO_BUILD_LOG_NOLINKINDEXES=%LOG_FILE_NOLINKINDEXES%
set HUGO_BUILD_LOG_NOCOMPACT=%LOG_FILE_NOCOMPACT%
set HUGO_BUILD_LOG_STRICTSKILLS=%LOG_FILE_STRICTSKILLS%
set HUGO_BUILD_LOG_SHADOW=%LOG_FILE_SHADOW%
set HUGO_BUILD_LOG_PAGINATED=%LOG_FILE_PAGINATED%
set HUGO_BUILD_LOG_WIDGETS=%LOG_FILE_WIDGETS%
set HUGO_BUILD_LOG_EXTRA=%LOG_FILE_EXTRA%
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
rem Belt-and-suspenders cleanup, mirroring modules/search/test/run-tests.cmd.
taskkill /F /IM hugo.exe >nul 2>&1
call node "%~dp0serve-origin.mjs" stop >nul 2>&1
exit /b %EXITCODE%
