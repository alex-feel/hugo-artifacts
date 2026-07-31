@echo off
rem Builds the composition fixture ONCE with hugo (a BUILD, not a server: no
rem port binding, and a finite build exits by itself) and runs the Node
rem build-output assertion suite against that one tree. Windows mirror of
rem run-tests.sh: pre-launch process check, then a hard fail on any
rem deprecation or error output in the build log.
rem
rem One build is the whole point. Each of seo, agent-readiness and search is
rem proven alone by its own suite; the surface none of those fixtures can see
rem is the one the modules SHARE -- the consuming site's single [outputs]
rem table. Hugo replaces the output list per page kind and never merges a
rem module's own [outputs], so a consumer following two module READMEs
rem literally ends up either with two [outputs] tables in one file (a
rem config-load failure) or with one table replacing the other (an exit-0
rem build that silently stops publishing documents).
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
