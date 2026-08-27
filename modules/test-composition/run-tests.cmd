@echo off
rem Builds the composition fixture THREE TIMES with hugo (builds, not servers:
rem no port binding for Hugo itself, and a finite build exits by itself) and
rem runs the Node build-output assertion suite against the three trees. Windows
rem mirror of run-tests.sh: pre-launch process check, then a hard fail on any
rem deprecation or error output in any build log.
rem
rem Every module here is proven alone by its own suite; what none of those
rem fixtures can see is what the modules do in each other's company.
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
rem
rem The URL registry. Four content-side modules publish files belonging to THIS
rem site by reading their URLs, github-profile copies remote avatars at build
rem time, and agent-readiness publishes skill artifacts no walk of the page
rem graph reaches; only a site that also holds url-retirement can show those
rem URLs arriving in /url-manifest.txt with nothing configured for them.
rem
rem WHY THREE BUILDS. `base` configures no skill, which is the only coverage of
rem an unconfigured skills surface; `skills` configures two, so the artifacts
rem exist and the writes hook has something to answer with; `one-url-per-page`
rem repeats that with url_retirement.manifest.output_formats switched off, which
rem is the setting that decides whether a registration placed where the
rem artifacts are copied would have been in time. The artifacts must be listed
rem there too, which is the assertion every push design fails.
rem
rem THE ORIGIN: a skill entry names a REMOTE source with no local form, and a
rem fetch-mode github-profile avatar is likewise a remote image, so the last
rem two builds fetch both from serve-origin.mjs on 127.0.0.1 rather than
rem from anybody else's endpoint. cmd has no trap, so an early `exit /b` here
rem can leave the origin running; that is bounded rather than unhandled -- the
rem server gives up on its own after fifteen minutes, and every run stops a
rem previous one before starting its own.
setlocal

rem findstr, not find: a caller inheriting Git Bash's PATH resolves find to
rem GNU find (usr\bin precedes System32), which rejects /I and exits 1 -- a
rem find-based check silently passes over a live hugo, and this run's own
rem cleanup taskkill would then kill the process the check exists to protect.
tasklist /FI "IMAGENAME eq hugo.exe" | findstr /I "hugo.exe" >nul
if not errorlevel 1 (
  echo A hugo process is already running; stop it first: taskkill /F /IM hugo.exe
  exit /b 1
)

set LOG_BASE=%~dp0hugo-build.log
set LOG_SKILLS=%~dp0hugo-build-skills.log
set LOG_ONE_URL=%~dp0hugo-build-one-url-per-page.log
set ORIGIN_LOG=%~dp0fixture-origin.log

rem Fixed, because a Hugo configuration file cannot learn a port at run time and
rem the fixture's `source` URLs name this one. Kept in step with the value in
rem serve-origin.mjs, run-tests.sh, fixture\skills.toml and
rem fixture\data\github-profile-fetch-origin.json.
set ORIGIN_PORT=1919

rem The destination is REMOVED, not merely cleaned: --cleanDestinationDir only
rem removes files that no longer exist in the static directories, so a document
rem a previous build published and this one does not would survive into the
rem trees these specs read, and a dropped format would assert green off stale
rem bytes. It also never deletes dot-prefixed paths, so a stale .well-known
rem artifact would outlive every rebuild.
if exist "%~dp0fixture\public" rd /s /q "%~dp0fixture\public"

pushd "%~dp0fixture"
hugo --logLevel info --config hugo.toml --cleanDestinationDir --destination public\base > "%LOG_BASE%" 2>&1
if errorlevel 1 (
  echo hugo build failed ^(composition/base^):
  type "%LOG_BASE%"
  popd
  exit /b 1
)
popd
call :gate "%LOG_BASE%" base
if errorlevel 1 exit /b 1

rem ---- The fixture origin ----
call node "%~dp0serve-origin.mjs" stop >nul 2>&1
start "composition-origin" /b node "%~dp0serve-origin.mjs" serve %ORIGIN_PORT% > "%ORIGIN_LOG%" 2>&1
call node "%~dp0serve-origin.mjs" wait %ORIGIN_PORT%
if errorlevel 1 (
  echo The fixture origin did not start on 127.0.0.1:%ORIGIN_PORT%:
  type "%ORIGIN_LOG%"
  call node "%~dp0serve-origin.mjs" stop >nul 2>&1
  exit /b 1
)

pushd "%~dp0fixture"
hugo --logLevel info --config hugo.toml,skills.toml --cleanDestinationDir --destination public\skills > "%LOG_SKILLS%" 2>&1
if errorlevel 1 (
  echo hugo build failed ^(composition/skills^):
  type "%LOG_SKILLS%"
  popd
  call node "%~dp0serve-origin.mjs" stop >nul 2>&1
  exit /b 1
)
hugo --logLevel info --config hugo.toml,skills.toml,one-url-per-page.toml --cleanDestinationDir --destination public\one-url-per-page > "%LOG_ONE_URL%" 2>&1
if errorlevel 1 (
  echo hugo build failed ^(composition/one-url-per-page^):
  type "%LOG_ONE_URL%"
  popd
  call node "%~dp0serve-origin.mjs" stop >nul 2>&1
  exit /b 1
)
popd

call node "%~dp0serve-origin.mjs" stop >nul 2>&1

call :gate "%LOG_SKILLS%" skills
if errorlevel 1 exit /b 1
call :gate "%LOG_ONE_URL%" one-url-per-page
if errorlevel 1 exit /b 1

set FIXTURE_PUBLIC=%~dp0fixture\public\base
set FIXTURE_PUBLIC_SKILLS=%~dp0fixture\public\skills
set FIXTURE_PUBLIC_ONE_URL=%~dp0fixture\public\one-url-per-page
set HUGO_BUILD_LOG=%LOG_BASE%
set HUGO_BUILD_LOG_SKILLS=%LOG_SKILLS%
set HUGO_BUILD_LOG_ONE_URL=%LOG_ONE_URL%

pushd "%~dp0"
call npm test %*
set EXITCODE=%ERRORLEVEL%
popd

rem Belt-and-suspenders cleanup, mirroring the sibling suites.
taskkill /F /IM hugo.exe >nul 2>&1
call node "%~dp0serve-origin.mjs" stop >nul 2>&1

rem The logs are retained (gitignored at the repo root) so the documented re-run
rem recipe can read them without rebuilding.
exit /b %EXITCODE%

:gate
findstr /I "deprecat" %1 >nul 2>&1
if not errorlevel 1 (
  echo Hugo reported deprecations ^(composition/%2^):
  findstr /I "deprecat" %1
  exit /b 1
)
findstr /C:"ERROR" %1 >nul 2>&1
if not errorlevel 1 (
  echo Hugo reported errors ^(composition/%2^):
  findstr /C:"ERROR" %1
  exit /b 1
)
exit /b 0
