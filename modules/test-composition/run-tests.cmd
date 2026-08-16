@echo off
rem Builds the composition fixture ONCE with hugo (a BUILD, not a server: no
rem port binding, and a finite build exits by itself) and runs the Node
rem build-output assertion suite against that one tree. Windows mirror of
rem run-tests.sh: pre-launch process check, then a hard fail on any
rem deprecation or error output in the build log.
rem
rem One build is the whole point. Every module here is proven alone by its own
rem suite; what none of those fixtures can see is what the modules do in each
rem other's company. Two such surfaces live in this one build.
rem
rem The consuming site's single [outputs] table. Hugo replaces the output list
rem per page kind and never merges a module's own [outputs], so a consumer
rem following two module READMEs literally ends up either with two [outputs]
rem tables in one file (a config-load failure) or with one table replacing the
rem other (an exit-0 build that silently stops publishing documents).
rem
rem The generated-image hook. seo names a partial to compose an image for a
rem page that has no image of its own, og-image composes one, and only a site
rem holding both can show a real card reaching og:image -- with the file it
rem names on disk, at the right size, drawn on this site's own base raster.
setlocal

tasklist /FI "IMAGENAME eq hugo.exe" | find /I "hugo.exe" >nul
if not errorlevel 1 (
  echo A hugo process is already running; stop it first: taskkill /F /IM hugo.exe
  exit /b 1
)

set LOG_FILE=%~dp0hugo-build.log

rem The destination is REMOVED, not merely cleaned: --cleanDestinationDir only
rem removes files that no longer exist in the static directories, so a document
rem a previous build published and this one does not would survive into the
rem tree these specs read, and a dropped format would assert green off stale
rem bytes.
if exist "%~dp0fixture\public" rd /s /q "%~dp0fixture\public"

pushd "%~dp0fixture"
hugo --logLevel info --cleanDestinationDir --destination public > "%LOG_FILE%" 2>&1
if errorlevel 1 (
  echo hugo build failed ^(composition^):
  type "%LOG_FILE%"
  popd
  exit /b 1
)
popd

findstr /I "deprecat" "%LOG_FILE%" >nul 2>&1
if not errorlevel 1 (
  echo Hugo reported deprecations in %LOG_FILE%:
  findstr /I "deprecat" "%LOG_FILE%"
  exit /b 1
)
findstr /C:"ERROR" "%LOG_FILE%" >nul 2>&1
if not errorlevel 1 (
  echo Hugo reported errors in %LOG_FILE%:
  findstr /C:"ERROR" "%LOG_FILE%"
  exit /b 1
)

set FIXTURE_PUBLIC=%~dp0fixture\public
set HUGO_BUILD_LOG=%LOG_FILE%

pushd "%~dp0"
call npm test %*
set EXITCODE=%ERRORLEVEL%
popd

rem The log is retained (gitignored at the repo root) so the documented re-run
rem recipe can read it without rebuilding.
exit /b %EXITCODE%
