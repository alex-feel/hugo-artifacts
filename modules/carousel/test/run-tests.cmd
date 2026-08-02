@echo off
rem Serves the composed fixture site with hugo and runs the Playwright suite
rem against it, after seven static builds (standalone fixture-bare, killed
rem overlay, multilingual overlay, and the subpath and canonifyURLs overlays
rem against BOTH the composed and the standalone fixture) and one
rem intentionally failing build (fixture-invalid). Windows mirror of
rem run-tests.sh: pre-launch process check, deprecation gates on every
rem build/server log, and forced hugo cleanup afterward.
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

rem ---- Static build 4: the composed fixture under a subpath baseURL ----
rem The only shape in which a leading-slash items entry can be proven
rem correct: Hugo resolves a value that already starts with "/" against the
rem protocol and host only, DISCARDING the baseURL path, so at the domain
rem root every other build here uses, a correct resolution and a broken one
rem emit identical bytes. Composed with modules/images, this build also
rem proves the path is applied exactly ONCE (no /docs/docs/).
set "CAROUSEL_SUBPATH_LOG=%~dp0hugo-build-subpath.log"
set "CAROUSEL_SUBPATH_PUBLIC=%~dp0fixture\public\subpath"
pushd "%~dp0fixture"
hugo --gc --logLevel info --cleanDestinationDir --config hugo.toml,../subpath.toml --destination public\subpath > "%CAROUSEL_SUBPATH_LOG%" 2>&1
if errorlevel 1 (
  echo hugo build failed ^(subpath overlay^):
  type "%CAROUSEL_SUBPATH_LOG%"
  popd
  exit /b 1
)
popd
findstr /I "deprecat" "%CAROUSEL_SUBPATH_LOG%" >nul 2>&1
if not errorlevel 1 (
  echo Hugo reported deprecations ^(subpath overlay^):
  findstr /I "deprecat" "%CAROUSEL_SUBPATH_LOG%"
  exit /b 1
)

rem ---- Static build 5: the standalone fixture under a subpath baseURL ----
rem The composed build above exercises images' own resolution; this one is
rem where carousel\slides.html emits the URL itself, in its plain img
rem fallback. Both fixtures also publish the Markdown twin, whose absolute
rem URLs must carry the baseURL path exactly once. Runs AFTER static build 1,
rem whose --cleanDestinationDir over fixture-bare\public would otherwise wipe
rem this tree.
set "CAROUSEL_SUBPATH_BARE_LOG=%~dp0hugo-build-subpath-bare.log"
set "CAROUSEL_SUBPATH_BARE_PUBLIC=%~dp0fixture-bare\public\subpath"
pushd "%~dp0fixture-bare"
hugo --gc --logLevel info --cleanDestinationDir --config hugo.toml,../subpath.toml --destination public\subpath > "%CAROUSEL_SUBPATH_BARE_LOG%" 2>&1
if errorlevel 1 (
  echo hugo build failed ^(subpath overlay, standalone^):
  type "%CAROUSEL_SUBPATH_BARE_LOG%"
  popd
  exit /b 1
)
popd
findstr /I "deprecat" "%CAROUSEL_SUBPATH_BARE_LOG%" >nul 2>&1
if not errorlevel 1 (
  echo Hugo reported deprecations ^(subpath overlay, standalone^):
  findstr /I "deprecat" "%CAROUSEL_SUBPATH_BARE_LOG%"
  exit /b 1
)

rem ---- Static build 6: the composed fixture with canonifyURLs ----
rem The subpath builds above prove the baseURL path is carried; these two
rem prove it survives canonifyURLs, which makes relURL stop emitting that
rem path (Hugo re-adds the whole baseURL to every root-relative URL in HTML
rem afterwards and would otherwise double it). That post-processor runs on
rem HTML only, so the Markdown twin is where a relURL-derived value silently
rem loses the path.
set "CAROUSEL_CANONIFY_LOG=%~dp0hugo-build-canonify.log"
set "CAROUSEL_CANONIFY_PUBLIC=%~dp0fixture\public\canonify"
pushd "%~dp0fixture"
hugo --gc --logLevel info --cleanDestinationDir --config hugo.toml,../subpath.toml,../canonify.toml --destination public\canonify > "%CAROUSEL_CANONIFY_LOG%" 2>&1
if errorlevel 1 (
  echo hugo build failed ^(canonifyURLs overlay^):
  type "%CAROUSEL_CANONIFY_LOG%"
  popd
  exit /b 1
)
popd
findstr /I "deprecat" "%CAROUSEL_CANONIFY_LOG%" >nul 2>&1
if not errorlevel 1 (
  echo Hugo reported deprecations ^(canonifyURLs overlay^):
  findstr /I "deprecat" "%CAROUSEL_CANONIFY_LOG%"
  exit /b 1
)

rem ---- Static build 7: the standalone fixture with canonifyURLs ----
rem Same pairing rationale as the two subpath builds: this is the branch
rem where carousel\slides.html emits the URL itself. Runs AFTER static build
rem 1, whose --cleanDestinationDir over fixture-bare\public would otherwise
rem wipe this tree.
set "CAROUSEL_CANONIFY_BARE_LOG=%~dp0hugo-build-canonify-bare.log"
set "CAROUSEL_CANONIFY_BARE_PUBLIC=%~dp0fixture-bare\public\canonify"
pushd "%~dp0fixture-bare"
hugo --gc --logLevel info --cleanDestinationDir --config hugo.toml,../subpath.toml,../canonify.toml --destination public\canonify > "%CAROUSEL_CANONIFY_BARE_LOG%" 2>&1
if errorlevel 1 (
  echo hugo build failed ^(canonifyURLs overlay, standalone^):
  type "%CAROUSEL_CANONIFY_BARE_LOG%"
  popd
  exit /b 1
)
popd
findstr /I "deprecat" "%CAROUSEL_CANONIFY_BARE_LOG%" >nul 2>&1
if not errorlevel 1 (
  echo Hugo reported deprecations ^(canonifyURLs overlay, standalone^):
  findstr /I "deprecat" "%CAROUSEL_CANONIFY_BARE_LOG%"
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
