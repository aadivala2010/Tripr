@echo off
setlocal
title Tripr Launcher

cd /d "%~dp0"

set "NODEJS_DIR=C:\Program Files\nodejs"
set "COREPACK_CMD=corepack"

if exist "%NODEJS_DIR%\node.exe" (
  set "PATH=%NODEJS_DIR%;%PATH%"
)

if exist "%NODEJS_DIR%\corepack.cmd" (
  set "COREPACK_CMD=%NODEJS_DIR%\corepack.cmd"
)

echo =====================================
echo Starting Tripr from:
echo %cd%
echo =====================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed or is not on PATH.
  echo Install Node.js, then try again.
  echo.
  pause
  exit /b 1
)

where corepack >nul 2>nul
if errorlevel 1 (
  if not exist "%NODEJS_DIR%\corepack.cmd" (
    echo Corepack is not available on PATH.
    echo Reinstall or update Node.js, then try again.
    echo.
    pause
    exit /b 1
  )
)

if not exist ".env.local" (
  echo Creating .env.local...
  (
    echo GEMINI_API_KEY=AIzaSyCRYJh9Kk6Pvsq3P9uV8naLMV2XcgYf2E4
  ) > ".env.local"
  echo.
)

set "NEEDS_INSTALL=0"

if not exist "node_modules" (
  set "NEEDS_INSTALL=1"
)

if not exist "node_modules\next\dist\bin\next" (
  set "NEEDS_INSTALL=1"
)

if "%NEEDS_INSTALL%"=="1" (
  echo Repairing dependencies...

  if exist "node_modules" (
    rmdir /s /q "node_modules"
  )

  if exist ".next" (
    rmdir /s /q ".next"
  )

  call "%COREPACK_CMD%" pnpm install
  if errorlevel 1 (
    echo.
    echo Dependency repair failed.
    echo.
    pause
    exit /b 1
  )
  echo.
)

echo Launching Tripr on http://localhost:3000
echo Keep this window open while using the app.
echo.

call "%COREPACK_CMD%" pnpm dev
if errorlevel 1 (
  echo.
  echo Tripr stopped because the dev server exited with an error.
  echo.
  pause
  exit /b 1
)


