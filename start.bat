@echo off
rem ============================================================
rem  Double-click this file to start Pawmail (development build).
rem  To quit: right-click the pet and choose Quit,
rem  or right-click the tray icon at the bottom-right of the screen.
rem  (Chinese instructions are in README.md)
rem ============================================================
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Please install it from https://nodejs.org and try again.
  pause
  exit /b 1
)

if not exist "node_modules\electron\package.json" (
  echo First run: installing components, this can take a few minutes...
  call npm install
  if errorlevel 1 (
    echo Install failed. Please check your network and try again.
    pause
    exit /b 1
  )
)

if not exist "node_modules\electron\dist\electron.exe" (
  echo Downloading the Electron runtime, about 100 MB, please wait...
  call node node_modules\electron\install.js
  if errorlevel 1 (
    echo Download failed. Please check your network and try again.
    pause
    exit /b 1
  )
)

start "" "node_modules\electron\dist\electron.exe" . %*
