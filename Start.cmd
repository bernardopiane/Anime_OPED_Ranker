@echo off
setlocal enableextensions
title Anime OP/ED Ranker
cd /d "%~dp0"

set "PORT=8000"
set "URL=http://localhost:%PORT%/"

set "LISTENING="
for /f "delims=" %%l in ('netstat -ano ^| findstr /r /c:":%PORT% .*LISTENING"') do set "LISTENING=1"
if defined LISTENING (
  echo The app is already running. Opening %URL%
  start "" "%URL%"
  exit /b 0
)

echo Starting Anime OP/ED Ranker at %URL%
echo Keep this window open while you use the app. Close it to stop the server.
echo.

rem Open the browser once the server has had a moment to start.
start "" /b powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process '%URL%'"

where py >nul 2>&1
if not errorlevel 1 goto :py
where python >nul 2>&1
if not errorlevel 1 goto :python
where node >nul 2>&1
if not errorlevel 1 goto :node

echo Python or Node was not found on this PC.
echo Install Python from python.org or Node.js from nodejs.org, then run this file again.
echo.
pause
exit /b 1

:py
py -m http.server %PORT%
goto :eof

:python
python -m http.server %PORT%
goto :eof

:node
node "%~dp0serve.js" %PORT%
goto :eof
