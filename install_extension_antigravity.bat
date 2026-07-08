@echo off
setlocal EnableExtensions EnableDelayedExpansion
set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%.") do set "SOURCE_DIR=%%~fI"
set "INSTALLER_REF=%LORERELAY_INSTALLER_REF%"
if not defined INSTALLER_REF set "INSTALLER_REF=origin/main"
set "MANAGED_PATH=%LORERELAY_INSTALLER_WORKTREE%"
if not defined MANAGED_PATH set "MANAGED_PATH=C:\AI\wt-lorerelay-installer-current"

echo [LoreRelay] Antigravity installer bootstrap starting...
echo [LoreRelay] Source entrypoint: %~f0
echo [LoreRelay] Source root: %SOURCE_DIR%
echo [LoreRelay] Installer ref: %INSTALLER_REF%
if defined LORERELAY_INSTALLER_REF echo [LoreRelay] Ref override is active for this invocation only.
echo [LoreRelay] Managed installer path: %MANAGED_PATH%

where git.exe >nul 2>nul
if errorlevel 1 (
  echo [LoreRelay] ERROR: git.exe was not found on PATH.
  set "PS_EXIT_CODE=1"
  goto :finish
)

git -C "%SOURCE_DIR%" rev-parse --show-toplevel >nul 2>nul
if errorlevel 1 (
  echo [LoreRelay] ERROR: source directory is not a Git worktree: %SOURCE_DIR%
  set "PS_EXIT_CODE=1"
  goto :finish
)

for /f "usebackq delims=" %%I in (`git -C "%SOURCE_DIR%" rev-parse --git-common-dir`) do set "SOURCE_COMMON=%%I"
if not defined SOURCE_COMMON (
  echo [LoreRelay] ERROR: failed to resolve source Git common directory.
  set "PS_EXIT_CODE=1"
  goto :finish
)
if "!SOURCE_COMMON:~1,1!"==":" (
  for %%I in ("!SOURCE_COMMON!") do set "SOURCE_COMMON=%%~fI"
) else (
  for %%I in ("%SOURCE_DIR%\!SOURCE_COMMON!") do set "SOURCE_COMMON=%%~fI"
)

echo [LoreRelay] Fetching origin in source repository...
git -C "%SOURCE_DIR%" fetch origin
if errorlevel 1 (
  echo [LoreRelay] ERROR: git fetch origin failed.
  set "PS_EXIT_CODE=1"
  goto :finish
)

for /f "usebackq delims=" %%I in (`git -C "%SOURCE_DIR%" rev-parse --verify "%INSTALLER_REF%^{commit}" 2^>nul`) do set "DESIRED_SHA=%%I"
if not defined DESIRED_SHA (
  echo [LoreRelay] ERROR: installer ref could not be resolved: %INSTALLER_REF%
  set "PS_EXIT_CODE=1"
  goto :finish
)
echo [LoreRelay] Desired installer checkout SHA: !DESIRED_SHA!

if exist "%MANAGED_PATH%" (
  echo [LoreRelay] Existing managed path found; validating identity...
  set "MANAGED_TOP="
  set "MANAGED_COMMON="
  for /f "usebackq delims=" %%I in (`git -C "%MANAGED_PATH%" rev-parse --show-toplevel 2^>nul`) do set "MANAGED_TOP=%%I"
  for /f "usebackq delims=" %%I in (`git -C "%MANAGED_PATH%" rev-parse --git-common-dir 2^>nul`) do set "MANAGED_COMMON=%%I"
  if not defined MANAGED_TOP (
    echo [LoreRelay] ERROR: managed path exists but is not a Git worktree: %MANAGED_PATH%
    echo [LoreRelay] Refusing to delete or overwrite it.
    set "PS_EXIT_CODE=1"
    goto :finish
  )
  for %%I in ("%MANAGED_PATH%") do set "MANAGED_EXPECTED=%%~fI"
  for %%I in ("!MANAGED_TOP!") do set "MANAGED_TOP_ABS=%%~fI"
  if "!MANAGED_COMMON:~1,1!"==":" (
    for %%I in ("!MANAGED_COMMON!") do set "MANAGED_COMMON=%%~fI"
  ) else (
    for %%I in ("%MANAGED_PATH%\!MANAGED_COMMON!") do set "MANAGED_COMMON=%%~fI"
  )
  if /I not "!MANAGED_TOP_ABS!"=="!MANAGED_EXPECTED!" (
    echo [LoreRelay] ERROR: managed path is not the root of its Git worktree.
    echo [LoreRelay] Expected: !MANAGED_EXPECTED!
    echo [LoreRelay] Actual:   !MANAGED_TOP_ABS!
    set "PS_EXIT_CODE=1"
    goto :finish
  )
  if /I not "!MANAGED_COMMON!"=="!SOURCE_COMMON!" (
    echo [LoreRelay] ERROR: managed path does not belong to the source repository common dir.
    echo [LoreRelay] Source common:  !SOURCE_COMMON!
    echo [LoreRelay] Managed common: !MANAGED_COMMON!
    echo [LoreRelay] Refusing destructive update.
    set "PS_EXIT_CODE=1"
    goto :finish
  )
  echo [LoreRelay] Managed path identity validated.
  git -C "%MANAGED_PATH%" fetch origin
  if errorlevel 1 (
    echo [LoreRelay] ERROR: managed worktree fetch failed.
    set "PS_EXIT_CODE=1"
    goto :finish
  )
  git -C "%MANAGED_PATH%" reset --hard "!DESIRED_SHA!"
  if errorlevel 1 (
    echo [LoreRelay] ERROR: managed worktree reset failed.
    set "PS_EXIT_CODE=1"
    goto :finish
  )
  git -C "%MANAGED_PATH%" clean -fd -e node_modules -e node_modules/
  if errorlevel 1 (
    echo [LoreRelay] ERROR: managed worktree cleanup failed.
    set "PS_EXIT_CODE=1"
    goto :finish
  )
) else (
  echo [LoreRelay] Creating managed installer worktree...
  for %%I in ("%MANAGED_PATH%") do set "MANAGED_PARENT=%%~dpI"
  if not exist "!MANAGED_PARENT!" mkdir "!MANAGED_PARENT!"
  git -C "%SOURCE_DIR%" worktree add --detach "%MANAGED_PATH%" "!DESIRED_SHA!"
  if errorlevel 1 (
    echo [LoreRelay] ERROR: failed to create managed installer worktree.
    set "PS_EXIT_CODE=1"
    goto :finish
  )
)

for /f "usebackq delims=" %%I in (`git -C "%MANAGED_PATH%" rev-parse HEAD`) do set "MANAGED_SHA=%%I"
echo [LoreRelay] Managed installer checkout SHA: !MANAGED_SHA!
if /I not "!MANAGED_SHA!"=="!DESIRED_SHA!" (
  echo [LoreRelay] ERROR: managed checkout SHA does not match desired SHA.
  set "PS_EXIT_CODE=1"
  goto :finish
)

if "%LORERELAY_BOOTSTRAP_PREPARE_ONLY%"=="1" (
  echo [LoreRelay] Prepare-only mode requested; stopping before dependencies/install.
  set "PS_EXIT_CODE=0"
  goto :finish
)

set "DEPS_READY=1"
if not exist "%MANAGED_PATH%\node_modules\typescript\bin\tsc" set "DEPS_READY=0"
if not exist "%MANAGED_PATH%\node_modules\@vscode\vsce\vsce" set "DEPS_READY=0"
if "%DEPS_READY%"=="1" (
  echo [LoreRelay] Dependencies: reused existing managed node_modules.
) else (
  echo [LoreRelay] Dependencies: installing with npm ci --include=dev...
  pushd "%MANAGED_PATH%"
  npm ci --include=dev
  if errorlevel 1 (
    set "NPM_EXIT_CODE=1"
  ) else (
    set "NPM_EXIT_CODE=0"
  )
  popd
  if not "!NPM_EXIT_CODE!"=="0" (
    echo [LoreRelay] ERROR: npm ci --include=dev failed with exit code !NPM_EXIT_CODE!.
    set "PS_EXIT_CODE=!NPM_EXIT_CODE!"
    goto :finish
  )
)

echo [LoreRelay] Handoff to managed installer...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%MANAGED_PATH%\scripts\install_vscode_extension.ps1" -Target "antigravity"
set "PS_EXIT_CODE=%ERRORLEVEL%"

:finish
echo.
if "%LORERELAY_INSTALLER_NO_PAUSE%"=="1" exit /b %PS_EXIT_CODE%
echo Press any key to exit...
pause >nul
exit /b %PS_EXIT_CODE%
