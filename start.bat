@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js was not found on this computer.
  echo.
  echo You can still use PDF Loves You by double-clicking index.html.
  echo A local server is only recommended so the built-in PDF previews load faster.
  echo.
  pause
  exit /b 1
)

echo Starting PDF Loves You at http://127.0.0.1:5173
start "" "http://127.0.0.1:5173"
node server.js
pause
