@echo off
rem Builds the fixture site as three static overlays, then serves it and
rem runs the Playwright suite against all three trees. Windows mirror of
rem run-tests.sh: pre-launch process check, deprecation gate on every hugo
rem log, and forced hugo cleanup afterward.
setlocal enabledelayedexpansion
if "%PORT%"=="" set PORT=1414

rem findstr, not find: a caller inheriting Git Bash's PATH resolves find to
rem GNU find (usr\bin precedes System32), which rejects /I and exits 1 -- a
rem find-based check silently passes over a live hugo, and this run's own
rem cleanup taskkill would then kill the process the check exists to protect.
tasklist /FI "IMAGENAME eq hugo.exe" | findstr /I "hugo.exe" >nul
if not errorlevel 1 (
  echo A hugo process is already running; stop it first: taskkill /F /IM hugo.exe
  exit /b 1
)

rem ---- Static overlays: the three subpath deployment shapes ----
rem Built before the server starts, because the served fixture sits at a
rem domain root and a domain root CANNOT tell a correct URL absolutization
rem from a broken one: absURL discards the baseURL's path for a value that
rem starts with "/", so both forms emit identical bytes there. Each overlay
rem differs from hugo.toml in exactly one respect, its baseURL, and
rem tests\04-subpath.spec.js reads both trees off disk:
rem   subpath     baseURL = "http://localhost:1414/docs/" -- catches a value
rem               that LOST the baseURL path.
rem   schemeless  baseURL = "/docs/" -- catches a Hugo-resolved value that
rem               GAINED it twice; under subpath every .Permalink carries a
rem               scheme and is waved through untouched, hiding that mistake.
rem Each build is finite and binds no port. The logs are retained and
rem gitignored (hugo-build*.log). Convention: overlay NAME reads
rem fixture\NAME.toml, writes fixture\public\NAME, and logs to
rem hugo-build-NAME.log. See the :build_overlay subroutine at the end.
call :build_overlay subpath
if errorlevel 1 exit /b 1
call :build_overlay schemeless
if errorlevel 1 exit /b 1
rem Layered on the subpath overlay rather than restating it: canonifyURLs is
rem the one setting under which a share target derived through the relURL
rem family loses the baseURL path, with nothing to repair it.
rem The chain is quoted because cmd splits call arguments on commas: unquoted,
rem %~2 receives only "hugo.toml", the rest of the chain lands in arguments
rem nothing reads, and the overlay silently builds the base config alone.
call :build_overlay subpath-canonify "hugo.toml,subpath.toml,canonify.toml"
if errorlevel 1 exit /b 1

pushd "%~dp0fixture"
start "social-share-fixture" /b hugo server --port %PORT% --bind 127.0.0.1 --logLevel info > "%~dp0.hugo-server.log" 2>&1
popd

rem ping, not timeout: under that same inherited PATH, timeout resolves to
rem GNU timeout, which rejects /t and exits at once, collapsing this wait
rem into a fast-failing burst that aborts before hugo can bind; only
rem System32 ships a ping, and -n 2 against the loopback sleeps one second.
set READY=0
for /l %%i in (1,1,60) do (
  curl -fsS "http://localhost:%PORT%/" >nul 2>&1 && set READY=1
  if "!READY!"=="1" goto ready
  ping -n 2 127.0.0.1 >nul
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
set FIXTURE_PUBLIC_SUBPATH=%~dp0fixture\public\subpath
set FIXTURE_PUBLIC_SCHEMELESS=%~dp0fixture\public\schemeless
set FIXTURE_PUBLIC_SUBPATH_CANONIFY=%~dp0fixture\public\subpath-canonify
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

rem ---- Subroutine: build one static overlay and gate its log ----
rem Reached only via CALL, never fallen into: the run above ends at the
rem unconditional "exit /b" immediately preceding this line.
:build_overlay
set OVERLAY=%~1
set CHAIN=%~2
if "%CHAIN%"=="" set CHAIN=hugo.toml,%OVERLAY%.toml
rem hugo drops a nonexistent entry from a --config list and still exits 0, so
rem without this a mistyped overlay name would quietly build the domain-root
rem config and surface as a baffling assertion mismatch instead of a missing
rem file.
for %%C in ("%CHAIN:,=" "%") do (
  if not exist "%~dp0fixture\%%~C" (
    echo Missing overlay config: %~dp0fixture\%%~C
    exit /b 1
  )
)
pushd "%~dp0fixture"
hugo --gc --logLevel info --cleanDestinationDir --config %CHAIN% --destination public\%OVERLAY% > "%~dp0hugo-build-%OVERLAY%.log" 2>&1
if errorlevel 1 (
  echo hugo build failed ^(%OVERLAY% overlay^):
  type "%~dp0hugo-build-%OVERLAY%.log"
  popd
  exit /b 1
)
popd
findstr /I "deprecat" "%~dp0hugo-build-%OVERLAY%.log" >nul 2>&1
if not errorlevel 1 (
  echo Hugo reported deprecations ^(%OVERLAY% overlay^):
  findstr /I "deprecat" "%~dp0hugo-build-%OVERLAY%.log"
  exit /b 1
)
findstr /C:"ERROR" "%~dp0hugo-build-%OVERLAY%.log" >nul 2>&1
if not errorlevel 1 (
  echo Hugo reported errors ^(%OVERLAY% overlay^):
  findstr /C:"ERROR" "%~dp0hugo-build-%OVERLAY%.log"
  exit /b 1
)
exit /b 0
