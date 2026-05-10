@echo off
rem Hugo PWA module validation matrix orchestrator (Windows).
rem
rem Three-pass orchestration:
rem   Pass 1 (default):  rows 1, 2, 3, 5, 6, 7, 9 against the unmodified fixture.
rem                      --grep-invert "Row 4:|Row 8:".
rem   Pass 2 (legacy):   row 4 only, against a fixture rebuilt with mode=legacy.
rem                      LEGACY_FIXTURE=1, --grep "Row 4:".
rem   Pass 3 (v1->v2):   row 8 only, with concurrent v1->v2 fixture swap watcher.
rem                      MATRIX_PASS3_PERSISTENT=1, --grep "Row 8:".
rem
rem Hugo Process Lifecycle Management uses tasklist + taskkill per
rem ~/.claude/aegis/rules/hugo-development.md Section 3.1 / 3.2.
rem
rem Aggregate target: 9 PASS / 0 SKIPPED / 0 FAIL.
rem
rem Usage:
rem   run-matrix.cmd                              :: full triple-pass; default port 1313
rem   set HUGO_PORT=4000 ^&^& run-matrix.cmd          :: custom port
rem   set MATRIX_PASS=default ^&^& run-matrix.cmd     :: pass 1 only
rem   set MATRIX_PASS=legacy ^&^& run-matrix.cmd      :: pass 2 only
rem   set MATRIX_PASS=v2 ^&^& run-matrix.cmd          :: pass 3 only
rem
rem Internal: this script self-invokes with `--watcher` to run the Pass 3
rem v1->v2 sentinel watcher in a backgrounded shell.

setlocal enabledelayedexpansion

set "SCRIPT_DIR=%~dp0"
set "FIXTURE_DIR=%SCRIPT_DIR%fixture"
set "TESTS_DIR=%SCRIPT_DIR%"

set "SENTINEL_TRIGGER=%SCRIPT_DIR%.matrix-v2-trigger"
set "SENTINEL_READY=%SCRIPT_DIR%.matrix-v2-ready"

if not defined HUGO_PORT set "HUGO_PORT=1313"
if not defined MATRIX_PASS set "MATRIX_PASS=all"

rem ----- Watcher self-invocation entrypoint ----------------------------------------
rem When invoked with `--watcher`, this script becomes the Pass 3 v1->v2 watcher
rem (polls SENTINEL_TRIGGER, mutates fixture, restarts hugo, writes SENTINEL_READY).
rem The main path (no `--watcher` arg) runs the three-pass matrix.

if /I "%~1"=="--watcher" goto :watcher_main

set "PASS1_EXIT=-1"
set "PASS2_EXIT=-1"
set "PASS3_EXIT=-1"
set "HUGO_LOG="

rem ----- Pre-launch (Hugo Development Rule R3 Section 3.1) -------------------------

tasklist /FI "IMAGENAME eq hugo.exe" 2>nul | find /I "hugo.exe" >nul
if %errorlevel% equ 0 (
  echo ERROR: a hugo.exe process is already running. Terminate it before re-running the matrix.
  echo        taskkill /F /IM hugo.exe
  exit /b 1
)
netstat -ano | findstr ":%HUGO_PORT% " | findstr "LISTENING" >nul
if %errorlevel% equ 0 (
  echo ERROR: port %HUGO_PORT% is already bound. Set HUGO_PORT to a free port.
  exit /b 1
)

call :remove_sentinels

rem ----- Pass 1: default fixture ---------------------------------------------------

set "RUN_PASS1=0"
if /I "%MATRIX_PASS%"=="all" set "RUN_PASS1=1"
if /I "%MATRIX_PASS%"=="default" set "RUN_PASS1=1"
if "!RUN_PASS1!"=="1" (
  echo INFO: ===== Pass 1/3 ^(default fixture; rows 1-3, 5-7, 9^) =====
  call :start_hugo
  if errorlevel 1 (
    call :final_cleanup
    exit /b 1
  )
  pushd "%TESTS_DIR%"
  set "FIXTURE_URL=http://127.0.0.1:%HUGO_PORT%"
  call npx playwright test --reporter=list --grep-invert "Row 4:|Row 8:"
  set "PASS1_EXIT=!errorlevel!"
  popd
  call :stop_hugo
)

rem ----- Pass 2: legacy fixture ----------------------------------------------------

set "RUN_PASS2=0"
if /I "%MATRIX_PASS%"=="all" set "RUN_PASS2=1"
if /I "%MATRIX_PASS%"=="legacy" set "RUN_PASS2=1"
if "!RUN_PASS2!"=="1" (
  echo INFO: ===== Pass 2/3 ^(legacy RFG fixture; row 4^) =====
  pushd "%FIXTURE_DIR%"
  copy /Y hugo.toml hugo.toml.bak >nul
  powershell -NoProfile -Command "(Get-Content hugo.toml) -replace 'mode = \"modern\"','mode = \"legacy\"' | Set-Content hugo.toml"
  popd
  call :start_hugo
  if errorlevel 1 (
    call :final_cleanup
    exit /b 1
  )
  pushd "%TESTS_DIR%"
  set "FIXTURE_URL=http://127.0.0.1:%HUGO_PORT%"
  set "LEGACY_FIXTURE=1"
  call npx playwright test --reporter=list --grep "Row 4:"
  set "PASS2_EXIT=!errorlevel!"
  set "LEGACY_FIXTURE="
  popd
  call :stop_hugo
  call :restore_fixture
)

rem ----- Pass 3: v1->v2 transition (row 8) -----------------------------------------

set "RUN_PASS3=0"
if /I "%MATRIX_PASS%"=="all" set "RUN_PASS3=1"
if /I "%MATRIX_PASS%"=="v2" set "RUN_PASS3=1"
if "!RUN_PASS3!"=="1" (
  echo INFO: ===== Pass 3/3 ^(v1-^>v2 fixture transition; row 8^) =====
  call :remove_sentinels
  call :start_hugo
  if errorlevel 1 (
    call :final_cleanup
    exit /b 1
  )
  rem Spawn the v1->v2 watcher in a backgrounded shell.
  start "" /B cmd /c ""%~f0" --watcher"
  pushd "%TESTS_DIR%"
  set "FIXTURE_URL=http://127.0.0.1:%HUGO_PORT%"
  set "MATRIX_PASS3_PERSISTENT=1"
  call npx playwright test --reporter=list --grep "Row 8:"
  set "PASS3_EXIT=!errorlevel!"
  set "MATRIX_PASS3_PERSISTENT="
  popd
  rem Best-effort wait for watcher completion (it exits when SENTINEL_READY exists
  rem or when the deadline elapses). Give it up to 5 seconds to settle.
  for /L %%i in (1,1,10) do (
    if exist "!SENTINEL_READY!" goto :pass3_watcher_done
    ping -n 2 127.0.0.1 >nul
  )
  :pass3_watcher_done
  call :stop_hugo
  call :restore_fixture
  call :remove_sentinels
)

rem ----- Aggregate verdict ---------------------------------------------------------

echo INFO: ===== Matrix complete =====
echo INFO: Pass 1 ^(default^): exit=!PASS1_EXIT!
echo INFO: Pass 2 ^(legacy^):  exit=!PASS2_EXIT!
echo INFO: Pass 3 ^(v2^):      exit=!PASS3_EXIT!

set "AGG=0"
if not "!PASS1_EXIT!"=="-1" if not "!PASS1_EXIT!"=="0" set "AGG=1"
if not "!PASS2_EXIT!"=="-1" if not "!PASS2_EXIT!"=="0" set "AGG=1"
if not "!PASS3_EXIT!"=="-1" if not "!PASS3_EXIT!"=="0" set "AGG=1"

if "!AGG!"=="0" (
  echo INFO: aggregate matrix verdict: PASS
) else (
  echo INFO: aggregate matrix verdict: FAIL
)
call :final_cleanup
exit /b !AGG!

rem ===== Subroutines ===============================================================

:start_hugo
set "HUGO_LOG=%TEMP%\hugo-matrix-%RANDOM%.log"
pushd "%FIXTURE_DIR%"
start /B "" cmd /c "hugo server --port %HUGO_PORT% --bind 127.0.0.1 --logLevel info > %HUGO_LOG% 2>&1"
popd
set "ready=0"
for /L %%i in (1,1,30) do (
  if "!ready!"=="0" (
    powershell -NoProfile -Command "try { (Invoke-WebRequest -Uri 'http://127.0.0.1:%HUGO_PORT%/' -UseBasicParsing -TimeoutSec 1).StatusCode } catch { exit 1 }" >nul 2>&1
    if !errorlevel! equ 0 set "ready=1"
    if "!ready!"=="0" ping -n 2 127.0.0.1 >nul
  )
)
if "!ready!"=="0" (
  echo ERROR: hugo server did not become ready within 30s. Log:
  type "%HUGO_LOG%"
  exit /b 1
)
findstr /I "deprecate" "%HUGO_LOG%" >nul
if %errorlevel% equ 0 (
  echo ERROR: deprecation warnings detected in hugo log:
  findstr /I "deprecate" "%HUGO_LOG%"
  exit /b 1
)
exit /b 0

:stop_hugo
taskkill /F /IM hugo.exe >nul 2>&1
rem Wait for the port to be released (up to 5s).
for /L %%i in (1,1,10) do (
  netstat -ano | findstr ":%HUGO_PORT% " | findstr "LISTENING" >nul
  if errorlevel 1 goto :stop_hugo_done
  ping -n 2 127.0.0.1 >nul
)
:stop_hugo_done
exit /b 0

:restore_fixture
if exist "%FIXTURE_DIR%\hugo.toml.bak" (
  move /Y "%FIXTURE_DIR%\hugo.toml.bak" "%FIXTURE_DIR%\hugo.toml" >nul
)
if exist "%FIXTURE_DIR%\content\blog\post-1.md.bak" (
  move /Y "%FIXTURE_DIR%\content\blog\post-1.md.bak" "%FIXTURE_DIR%\content\blog\post-1.md" >nul
)
exit /b 0

:remove_sentinels
if exist "%SENTINEL_TRIGGER%" del /Q "%SENTINEL_TRIGGER%" >nul 2>&1
if exist "%SENTINEL_READY%" del /Q "%SENTINEL_READY%" >nul 2>&1
exit /b 0

:final_cleanup
call :stop_hugo
call :restore_fixture
call :remove_sentinels
if defined HUGO_LOG if exist "%HUGO_LOG%" del /Q "%HUGO_LOG%" >nul 2>&1
exit /b 0

rem ===== Watcher entrypoint =========================================================
rem Polls SENTINEL_TRIGGER for up to 90s. On appearance: stop hugo, mutate fixture
rem to v2 (version + post-1.md date), restart hugo on the same port, write
rem SENTINEL_READY. Used as a backgrounded subprocess of the main matrix run.

:watcher_main
set "DEADLINE=90"
for /L %%i in (1,1,%DEADLINE%) do (
  if exist "!SENTINEL_TRIGGER!" goto :watcher_swap
  ping -n 2 127.0.0.1 >nul
)
echo ERROR: Pass 3 watcher timeout: spec did not write !SENTINEL_TRIGGER! within %DEADLINE%s. 1>&2
exit /b 1

:watcher_swap
del /Q "!SENTINEL_TRIGGER!" >nul 2>&1
taskkill /F /IM hugo.exe >nul 2>&1
rem Wait for port release.
for /L %%i in (1,1,10) do (
  netstat -ano | findstr ":%HUGO_PORT% " | findstr "LISTENING" >nul
  if errorlevel 1 goto :watcher_mutate
  ping -n 2 127.0.0.1 >nul
)
:watcher_mutate
pushd "%FIXTURE_DIR%"
copy /Y hugo.toml hugo.toml.bak >nul
powershell -NoProfile -Command "(Get-Content hugo.toml) -replace 'version = \"v1\"','version = \"v2\"' | Set-Content hugo.toml"
copy /Y "content\blog\post-1.md" "content\blog\post-1.md.bak" >nul
powershell -NoProfile -Command "(Get-Content content\blog\post-1.md) -replace '^date: 2026-01-02$','date: 2026-05-10' | Set-Content content\blog\post-1.md"
popd
set "WATCHER_HUGO_LOG=%TEMP%\hugo-matrix-watcher-%RANDOM%.log"
pushd "%FIXTURE_DIR%"
start /B "" cmd /c "hugo server --port %HUGO_PORT% --bind 127.0.0.1 --logLevel info > %WATCHER_HUGO_LOG% 2>&1"
popd
rem Wait for hugo to be ready (up to 30s).
set "wready=0"
for /L %%i in (1,1,30) do (
  if "!wready!"=="0" (
    powershell -NoProfile -Command "try { (Invoke-WebRequest -Uri 'http://127.0.0.1:%HUGO_PORT%/' -UseBasicParsing -TimeoutSec 1).StatusCode } catch { exit 1 }" >nul 2>&1
    if !errorlevel! equ 0 set "wready=1"
    if "!wready!"=="0" ping -n 2 127.0.0.1 >nul
  )
)
if "!wready!"=="0" (
  echo ERROR: watcher hugo restart did not become ready within 30s. 1>&2
  exit /b 1
)
type nul > "!SENTINEL_READY!"
exit /b 0
