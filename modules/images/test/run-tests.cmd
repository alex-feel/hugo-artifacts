@echo off
rem Builds the fixture site with hugo (a BUILD, not a server: no port
rem binding, and a finite build exits by itself) and runs the Node
rem build-output assertion suite. Windows mirror of run-tests.sh: pre-launch
rem process check, then a hard fail on any deprecation or error output in
rem the build log.
rem
rem THREE builds run, each with its own captured log: the default fixture at a
rem domain-root baseURL, a subpath overlay (..\subpath.toml) at a baseURL that
rem carries a PATH -- the only build where a discarded baseURL path is
rem visible, since Hugo drops it for a value that already starts with "/" --
rem and a canonifyURLs overlay (..\canonify.toml) on top of that subpath
rem baseURL, where relURL stops emitting the baseURL path altogether and only
rem the HTML output format gets it back.
setlocal

tasklist /FI "IMAGENAME eq hugo.exe" | find /I "hugo.exe" >nul
if not errorlevel 1 (
  echo A hugo process is already running; stop it first: taskkill /F /IM hugo.exe
  exit /b 1
)

set LOG_FILE=%~dp0hugo-build.log
pushd "%~dp0fixture"
hugo --logLevel info --cleanDestinationDir --destination public > "%LOG_FILE%" 2>&1
if errorlevel 1 (
  echo hugo build failed:
  type "%LOG_FILE%"
  popd
  exit /b 1
)
popd

findstr /I "deprecat" "%LOG_FILE%" >nul 2>&1
if not errorlevel 1 (
  echo Hugo reported deprecations:
  findstr /I "deprecat" "%LOG_FILE%"
  exit /b 1
)
findstr /C:"ERROR" "%LOG_FILE%" >nul 2>&1
if not errorlevel 1 (
  echo Hugo reported errors:
  findstr /C:"ERROR" "%LOG_FILE%"
  exit /b 1
)

rem ---- Subpath build: the same fixture under a path-carrying baseURL ----
rem Published INSIDE fixture\public (as public\subpath), so the repository's
rem public/-scoped ignore rules cover its output; it MUST therefore run AFTER
rem the default build, whose --cleanDestinationDir over public\ would wipe it.
rem tests\helpers.js skips this directory when it walks public\ recursively.
set SUBPATH_DIR=%~dp0fixture\public\subpath
set SUBPATH_LOG_FILE=%~dp0hugo-build-subpath.log
pushd "%~dp0fixture"
hugo --logLevel info --cleanDestinationDir --config hugo.toml,../subpath.toml --destination public\subpath > "%SUBPATH_LOG_FILE%" 2>&1
if errorlevel 1 (
  echo hugo build failed ^(subpath overlay^):
  type "%SUBPATH_LOG_FILE%"
  popd
  exit /b 1
)
popd

findstr /I "deprecat" "%SUBPATH_LOG_FILE%" >nul 2>&1
if not errorlevel 1 (
  echo Hugo reported deprecations ^(subpath overlay^):
  findstr /I "deprecat" "%SUBPATH_LOG_FILE%"
  exit /b 1
)
findstr /C:"ERROR" "%SUBPATH_LOG_FILE%" >nul 2>&1
if not errorlevel 1 (
  echo Hugo reported errors ^(subpath overlay^):
  findstr /C:"ERROR" "%SUBPATH_LOG_FILE%"
  exit /b 1
)

rem ---- canonifyURLs build: the subpath overlay plus canonifyURLs ----
rem Published alongside the subpath build inside fixture\public, for the same
rem ignore-rule reason and with the same must-run-after-the-default ordering.
set CANONIFY_DIR=%~dp0fixture\public\canonify
set CANONIFY_LOG_FILE=%~dp0hugo-build-canonify.log
pushd "%~dp0fixture"
hugo --logLevel info --cleanDestinationDir --config hugo.toml,../subpath.toml,../canonify.toml --destination public\canonify > "%CANONIFY_LOG_FILE%" 2>&1
if errorlevel 1 (
  echo hugo build failed ^(canonifyURLs overlay^):
  type "%CANONIFY_LOG_FILE%"
  popd
  exit /b 1
)
popd

findstr /I "deprecat" "%CANONIFY_LOG_FILE%" >nul 2>&1
if not errorlevel 1 (
  echo Hugo reported deprecations ^(canonifyURLs overlay^):
  findstr /I "deprecat" "%CANONIFY_LOG_FILE%"
  exit /b 1
)
findstr /C:"ERROR" "%CANONIFY_LOG_FILE%" >nul 2>&1
if not errorlevel 1 (
  echo Hugo reported errors ^(canonifyURLs overlay^):
  findstr /C:"ERROR" "%CANONIFY_LOG_FILE%"
  exit /b 1
)

set FIXTURE_PUBLIC=%~dp0fixture\public
set HUGO_BUILD_LOG=%LOG_FILE%
set IMAGES_SUBPATH_PUBLIC=%SUBPATH_DIR%
set IMAGES_CANONIFY_PUBLIC=%CANONIFY_DIR%
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

rem All three logs are retained (gitignored at the repo root) so the documented
rem re-run recipe -- FIXTURE_PUBLIC=... HUGO_BUILD_LOG=hugo-build.log
rem IMAGES_SUBPATH_PUBLIC=fixture/public/subpath
rem IMAGES_CANONIFY_PUBLIC=fixture/public/canonify npm test -- can read them
rem without rebuilding.
exit /b %EXITCODE%
