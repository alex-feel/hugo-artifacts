@echo off
rem Serves the fixture site with hugo and runs the Playwright suite against
rem it. Windows mirror of run-tests.sh: pre-launch process check, nine static
rem overlay builds (each logged to <dir>.log), deprecation gate on the server
rem log, and forced hugo cleanup afterward.
rem
rem The static builds reach states the single served fixture cannot be in at
rem once: a hostile site title, which proves the OpenSearch document escapes
rem what it interpolates; the default-off gate; a subpath baseURL, the only
rem place a discarded baseURL path is visible; scalar values written for the
rem table-valued config keys, whose warnings the suite counts from the
rem captured build log; a single-page corpus of edge-case front matter, which
rem proves the index round-trips the authored characters; the three
rem list-valued keys written as tables, as booleans and as lists, which is the
rem shape matrix the resolver degrades over; and a per-language override of
rem two site-scoped keys.
setlocal enabledelayedexpansion
if "%PORT%"=="" set PORT=1515

tasklist /FI "IMAGENAME eq hugo.exe" | find /I "hugo.exe" >nul
if not errorlevel 1 (
  echo A hugo process is already running; stop it first: taskkill /F /IM hugo.exe
  exit /b 1
)

set OPENSEARCH_HOSTILE_DIR=%~dp0.opensearch-hostile
set OPENSEARCH_OFF_DIR=%~dp0.opensearch-off
set SUBPATH_DIR=%~dp0.subpath
set SCALAR_TABLES_DIR=%~dp0.scalar-tables
set SERIALIZATION_DIR=%~dp0.serialization
set SHAPE_TABLES_DIR=%~dp0.shape-tables
set SHAPE_BOOLS_DIR=%~dp0.shape-bools
set SHAPE_LISTS_DIR=%~dp0.shape-lists
set MULTILINGUAL_DIR=%~dp0.multilingual

pushd "%~dp0fixture"
hugo --config hugo.toml,config-opensearch-hostile.toml --cleanDestinationDir --destination "%OPENSEARCH_HOSTILE_DIR%" > "%OPENSEARCH_HOSTILE_DIR%.log" 2>&1
if errorlevel 1 (
  echo Static overlay build failed ^(hostile title^).
  type "%OPENSEARCH_HOSTILE_DIR%.log"
  popd
  exit /b 1
)
hugo --config hugo.toml,config-opensearch-off.toml --cleanDestinationDir --destination "%OPENSEARCH_OFF_DIR%" > "%OPENSEARCH_OFF_DIR%.log" 2>&1
if errorlevel 1 (
  echo Static overlay build failed ^(opensearch off^).
  type "%OPENSEARCH_OFF_DIR%.log"
  popd
  exit /b 1
)
hugo --config hugo.toml,config-subpath.toml --cleanDestinationDir --destination "%SUBPATH_DIR%" > "%SUBPATH_DIR%.log" 2>&1
if errorlevel 1 (
  echo Static overlay build failed ^(subpath^).
  type "%SUBPATH_DIR%.log"
  popd
  exit /b 1
)
hugo --config hugo.toml,config-scalar-tables.toml --cleanDestinationDir --destination "%SCALAR_TABLES_DIR%" > "%SCALAR_TABLES_DIR%.log" 2>&1
if errorlevel 1 (
  echo Static overlay build failed ^(scalar tables^).
  type "%SCALAR_TABLES_DIR%.log"
  popd
  exit /b 1
)
hugo --config hugo.toml,config-serialization.toml --cleanDestinationDir --destination "%SERIALIZATION_DIR%" > "%SERIALIZATION_DIR%.log" 2>&1
if errorlevel 1 (
  echo Static overlay build failed ^(serialization^).
  type "%SERIALIZATION_DIR%.log"
  popd
  exit /b 1
)
hugo --config hugo.toml,config-shape-tables.toml --cleanDestinationDir --destination "%SHAPE_TABLES_DIR%" > "%SHAPE_TABLES_DIR%.log" 2>&1
if errorlevel 1 (
  echo Static overlay build failed ^(shape tables^).
  type "%SHAPE_TABLES_DIR%.log"
  popd
  exit /b 1
)
hugo --config hugo.toml,config-shape-bools.toml --cleanDestinationDir --destination "%SHAPE_BOOLS_DIR%" > "%SHAPE_BOOLS_DIR%.log" 2>&1
if errorlevel 1 (
  echo Static overlay build failed ^(shape booleans^).
  type "%SHAPE_BOOLS_DIR%.log"
  popd
  exit /b 1
)
hugo --config hugo.toml,config-shape-lists.toml --cleanDestinationDir --destination "%SHAPE_LISTS_DIR%" > "%SHAPE_LISTS_DIR%.log" 2>&1
if errorlevel 1 (
  echo Static overlay build failed ^(shape lists^).
  type "%SHAPE_LISTS_DIR%.log"
  popd
  exit /b 1
)
hugo --config hugo.toml,config-multilingual.toml --cleanDestinationDir --destination "%MULTILINGUAL_DIR%" > "%MULTILINGUAL_DIR%.log" 2>&1
if errorlevel 1 (
  echo Static overlay build failed ^(multilingual^).
  type "%MULTILINGUAL_DIR%.log"
  popd
  exit /b 1
)
popd

for %%d in ("%OPENSEARCH_HOSTILE_DIR%" "%OPENSEARCH_OFF_DIR%" "%SUBPATH_DIR%" "%SCALAR_TABLES_DIR%" "%SERIALIZATION_DIR%" "%SHAPE_TABLES_DIR%" "%SHAPE_BOOLS_DIR%" "%SHAPE_LISTS_DIR%" "%MULTILINGUAL_DIR%") do (
  findstr /I "deprecat" "%%~d.log" >nul 2>&1
  if not errorlevel 1 (
    echo Hugo reported deprecations in the overlay build logged at %%~d.log:
    findstr /I "deprecat" "%%~d.log"
    exit /b 1
  )
)

pushd "%~dp0fixture"
start "search-fixture" /b hugo server --port %PORT% --bind 127.0.0.1 --logLevel info > "%~dp0.hugo-server.log" 2>&1
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
call npx playwright test %*
set EXITCODE=%ERRORLEVEL%
popd

taskkill /F /IM hugo.exe >nul 2>&1
del "%~dp0.hugo-server.log" >nul 2>&1
for %%d in ("%OPENSEARCH_HOSTILE_DIR%" "%OPENSEARCH_OFF_DIR%" "%SUBPATH_DIR%" "%SCALAR_TABLES_DIR%" "%SERIALIZATION_DIR%" "%SHAPE_TABLES_DIR%" "%SHAPE_BOOLS_DIR%" "%SHAPE_LISTS_DIR%" "%MULTILINGUAL_DIR%") do (
  rd /s /q "%%~d" >nul 2>&1
  del "%%~d.log" >nul 2>&1
)
exit /b %EXITCODE%
