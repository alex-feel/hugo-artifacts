@echo off
rem Builds the accordion fixture TWICE with hugo (builds, not servers: no port
rem binding, and a finite build exits by itself) and runs the Node
rem build-output assertion suite against both trees. Windows mirror of
rem run-tests.sh: pre-launch process check, then a hard fail on any
rem deprecation, error, or missing-layout line in either build log.
rem
rem WHY TWO BUILDS. Everything the module emits is raw HTML, and an item's
rem body goes back through Goldmark (.Page.RenderString), whose default
rem markup.goldmark.renderer.unsafe = false REPLACES raw HTML with an
rem omission comment. So an accordion nested inside another accordion's item
rem is silently dropped at the default settings and rendered whole with
rem unsafe enabled; both are real consumer configurations, and only a pair of
rem builds can prove the limitation AND the documented remedy.
rem
rem NETWORK: none. The module fetches nothing at build time.
rem
rem THE WARN GATE IS DELIBERATELY ABSENT here, and 05-warnings.spec.js is what
rem replaces it: the fixture exercises every degradation path on purpose, so a
rem blanket WARN failure would fail the suite on its own subject matter. That
rem spec asserts the EXACT set of warnings instead. ERROR and deprecation
rem lines remain hard failures.
setlocal

rem findstr, not find: a caller inheriting Git Bash's PATH resolves find to
rem GNU find (usr\bin precedes System32), which rejects /I and exits 1 -- a
rem find-based check silently passes over a live hugo, and the builds then run
rem beside the process the check exists to keep them clear of.
tasklist /FI "IMAGENAME eq hugo.exe" | findstr /I "hugo.exe" >nul
if not errorlevel 1 (
  echo A hugo process is already running; stop it first: taskkill /F /IM hugo.exe
  exit /b 1
)

set LOG_FILE=%~dp0hugo-build.log
set LOG_FILE_UNSAFE=%~dp0hugo-build-unsafe.log

rem The destination root is REMOVED, not merely cleaned: --cleanDestinationDir
rem only removes files that no longer exist in the static directories, so a
rem document a previous build published and this one does not would survive
rem into the trees these specs read. It also never deletes dot-prefixed paths.
if exist "%~dp0fixture\public" rd /s /q "%~dp0fixture\public"

pushd "%~dp0fixture"
hugo --gc --logLevel info --cleanDestinationDir --config hugo.toml --destination public\default > "%LOG_FILE%" 2>&1
if errorlevel 1 (
  echo hugo build failed ^(accordion/default^):
  type "%LOG_FILE%"
  popd
  exit /b 1
)
rem The config chain is quoted because cmd splits call arguments on commas:
rem this invocation is inline rather than through `call`, but the quoting is
rem kept so the line survives being moved into a subroutine, which is exactly
rem how a sibling suite lost its overlay and silently built the base config.
hugo --gc --logLevel info --cleanDestinationDir --config "hugo.toml,unsafe.toml" --destination public\unsafe > "%LOG_FILE_UNSAFE%" 2>&1
if errorlevel 1 (
  echo hugo build failed ^(accordion/unsafe^):
  type "%LOG_FILE_UNSAFE%"
  popd
  exit /b 1
)
popd

for %%L in ("%LOG_FILE%" "%LOG_FILE_UNSAFE%") do (
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

set FIXTURE_PUBLIC=%~dp0fixture\public\default
set FIXTURE_PUBLIC_UNSAFE=%~dp0fixture\public\unsafe
set HUGO_BUILD_LOG=%LOG_FILE%
set HUGO_BUILD_LOG_UNSAFE=%LOG_FILE_UNSAFE%

pushd "%~dp0"
call npm test %*
set EXITCODE=%ERRORLEVEL%
popd

rem The logs are retained (gitignored at the repo root) so the documented
rem re-run recipe can read them without rebuilding.
rem Belt-and-suspenders cleanup, mirroring the sibling suites.
taskkill /F /IM hugo.exe >nul 2>&1
exit /b %EXITCODE%
