@echo off
rem Serves the composed fixture site with hugo and runs the Playwright suite
rem against it, after three static builds (standalone fixture-bare, killed
rem overlay, multilingual overlay) and one intentionally failing build
rem (fixture-invalid). Windows mirror of run-tests.sh: pre-launch process
rem check, deprecation gates on every build/server log, and forced hugo
rem cleanup afterward.
setlocal enabledelayedexpansion
if "%PORT%"=="" set PORT=1717

tasklist /FI "IMAGENAME eq hugo.exe" | find /I "hugo.exe" >nul
if not errorlevel 1 (
  echo A hugo process is already running; stop it first: taskkill /F /IM hugo.exe
  exit /b 1
)

rem ---- Static build 1: the standalone fixture (fixture-bare) ----
rem Built once, statically, before the server starts: proves the module
rem renders its plain-img fallback with modules/images absent. Specs assert
rem on this tree via fs, so the public dir and this log are exported below.
set "CAROUSEL_BARE_LOG=%~dp0hugo-build-bare.log"
set "CAROUSEL_BARE_PUBLIC=%~dp0fixture-bare\public"
pushd "%~dp0fixture-bare"
hugo --gc --logLevel info --cleanDestinationDir > "%CAROUSEL_BARE_LOG%" 2>&1
if errorlevel 1 (
  echo hugo build failed ^(fixture-bare^):
  type "%CAROUSEL_BARE_LOG%"
  popd
  exit /b 1
)
popd
findstr /I "deprecat" "%CAROUSEL_BARE_LOG%" >nul 2>&1
if not errorlevel 1 (
  echo Hugo reported deprecations ^(fixture-bare^):
  findstr /I "deprecat" "%CAROUSEL_BARE_LOG%"
  exit /b 1
)

rem ---- Static build 2: the composed fixture's site-wide kill overlay ----
rem params.carousel.enable = false must strip every carousel root and every
rem script tag from the whole build; the suite proves it with filesystem
rem assertions against this tree.
set "CAROUSEL_KILLED_LOG=%~dp0hugo-build-killed.log"
set "CAROUSEL_KILLED_PUBLIC=%~dp0fixture\public\killed"
pushd "%~dp0fixture"
hugo --gc --logLevel info --cleanDestinationDir --config hugo.toml,../killed.toml --destination public\killed > "%CAROUSEL_KILLED_LOG%" 2>&1
if errorlevel 1 (
  echo hugo build failed ^(killed overlay^):
  type "%CAROUSEL_KILLED_LOG%"
  popd
  exit /b 1
)
popd
findstr /I "deprecat" "%CAROUSEL_KILLED_LOG%" >nul 2>&1
if not errorlevel 1 (
  echo Hugo reported deprecations ^(killed overlay^):
  findstr /I "deprecat" "%CAROUSEL_KILLED_LOG%"
  exit /b 1
)

rem ---- Static build 3: the multilingual overlay (en + ru) ----
rem Mirrors the modules/agent-readiness multilingual build precedent: a
rem second language is the only shape in which module output routed through
rem i18n (here i18n/ru.toml) can be proven to resolve for a non-default
rem language. content\gallery\index.ru.md is a translate-by-filename sibling
rem of content\gallery\index.md, so /ru/gallery/ is a carousel-bearing page
rem whose aria strings resolve through i18n/ru.toml.
set "CAROUSEL_MULTILINGUAL_LOG=%~dp0hugo-build-multilingual.log"
set "CAROUSEL_MULTILINGUAL_PUBLIC=%~dp0fixture\public\multilingual"
pushd "%~dp0fixture"
hugo --gc --logLevel info --cleanDestinationDir --config hugo.toml,../multilingual.toml --destination public\multilingual > "%CAROUSEL_MULTILINGUAL_LOG%" 2>&1
if errorlevel 1 (
  echo hugo build failed ^(multilingual overlay^):
  type "%CAROUSEL_MULTILINGUAL_LOG%"
  popd
  exit /b 1
)
popd
findstr /I "deprecat" "%CAROUSEL_MULTILINGUAL_LOG%" >nul 2>&1
if not errorlevel 1 (
  echo Hugo reported deprecations ^(multilingual overlay^):
  findstr /I "deprecat" "%CAROUSEL_MULTILINGUAL_LOG%"
  exit /b 1
)

rem ---- Negative build: fixture-invalid (match + items together) ----
rem The shortcode's match/items exclusivity errorf contract must fail the
rem build with a non-zero exit and a [carousel]-prefixed message; a
rem succeeding build here is itself the failure.
set "CAROUSEL_INVALID_LOG=%~dp0hugo-build-invalid.log"
pushd "%~dp0fixture-invalid"
hugo --gc --logLevel info --cleanDestinationDir > "%CAROUSEL_INVALID_LOG%" 2>&1
set INVALID_BUILD_ERRORLEVEL=%ERRORLEVEL%
popd
if %INVALID_BUILD_ERRORLEVEL%==0 (
  echo hugo build unexpectedly succeeded for fixture-invalid ^(match+items must errorf^):
  type "%CAROUSEL_INVALID_LOG%"
  exit /b 1
)
findstr /C:"[carousel]" "%CAROUSEL_INVALID_LOG%" >nul 2>&1
if errorlevel 1 (
  echo fixture-invalid build failed as expected, but the error text did not contain "[carousel]":
  type "%CAROUSEL_INVALID_LOG%"
  exit /b 1
)

rem ---- Dev server: the composed fixture ----
rem Exported so specs can grep this log for the alt-less-slide dedup warning
rem (05-a11y-warnings): it is the only build that renders the composed
rem gallery page with the alt-less resource AND the module enabled (the
rem killed overlay renders the same page with enable=false, emitting no
rem warning at all).
set "CAROUSEL_SERVER_LOG=%~dp0.hugo-server.log"
pushd "%~dp0fixture"
start "carousel-fixture" /b hugo server --port %PORT% --bind 127.0.0.1 --logLevel info > "%CAROUSEL_SERVER_LOG%" 2>&1
popd

set READY=0
for /l %%i in (1,1,60) do (
  curl -fsS "http://localhost:%PORT%/" >nul 2>&1 && set READY=1
  if "!READY!"=="1" goto ready
  timeout /t 1 /nobreak >nul
)
:ready
if "%READY%"=="0" (
  echo Fixture server did not become ready on port %PORT%.
  taskkill /F /IM hugo.exe >nul 2>&1
  exit /b 1
)

findstr /I "deprecat" "%~dp0.hugo-server.log" >nul 2>&1
if not errorlevel 1 (
  echo Hugo reported deprecations:
  findstr /I "deprecat" "%~dp0.hugo-server.log"
  taskkill /F /IM hugo.exe >nul 2>&1
  exit /b 1
)

pushd "%~dp0"
set FIXTURE_URL=http://localhost:%PORT%
rem npm rather than npx: npx resolves the binary through its own global
rem cache first, and when that cache holds a Playwright of its own the run
rem loads two copies and dies with "No tests found". npm runs this package's
rem own script, which resolves the binary from this directory's node_modules.
call npm test %*
set EXITCODE=%ERRORLEVEL%
popd

taskkill /F /IM hugo.exe >nul 2>&1
del "%~dp0.hugo-server.log" >nul 2>&1
exit /b %EXITCODE%
