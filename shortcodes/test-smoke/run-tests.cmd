@echo off
rem Builds the shortcode smoke fixture ONCE with hugo (a BUILD, not a server:
rem no port binding, and a finite build exits by itself) and runs the Node
rem build-output assertion suite against that one tree. Windows mirror of
rem run-tests.sh.
rem
rem The five modules this covers ship no suite of their own. Before this
rem existed nothing in the repository rendered their templates except a
rem fixture belonging to another module, and nothing asserted a byte of their
rem output.
rem
rem THE WARN GATE IS DELIBERATELY ABSENT, unlike every other runner here. All
rem five modules fetch remote data at build time and degrade by warning, which
rem is their documented contract, so failing on WARN would fail this suite on
rem any runner without network. ERROR and deprecation remain hard failures.
setlocal

tasklist /FI "IMAGENAME eq hugo.exe" | find /I "hugo.exe" >nul
if not errorlevel 1 (
  echo A hugo process is already running; stop it first: taskkill /F /IM hugo.exe
  exit /b 1
)

set LOG_FILE=%~dp0hugo-build.log
set CACHE_DIR=%~dp0.hugo-cache

rem A PRIVATE cache directory, emptied first, and --ignoreCache on top of it.
rem Hugo caches remote responses, so a cache populated by an earlier build
rem would let a fetch "succeed" with no network and silently produce enriched
rem markup. The suite tolerates either shape, but a run whose outcome depends
rem on what a previous run left behind is not a run that means anything.
if exist "%~dp0fixture\public" rd /s /q "%~dp0fixture\public"
if exist "%CACHE_DIR%" rd /s /q "%CACHE_DIR%"

pushd "%~dp0fixture"
hugo --logLevel info --cleanDestinationDir --cacheDir "%CACHE_DIR%" --ignoreCache --destination public > "%LOG_FILE%" 2>&1
if errorlevel 1 (
  echo hugo build failed ^(shortcode smoke^):
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
