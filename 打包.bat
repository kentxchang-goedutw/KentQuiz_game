@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js not found. Please install the LTS version from https://nodejs.org and run this file again.
  start https://nodejs.org
  pause
  exit /b 1
)
node tools\build.js %*
pause
