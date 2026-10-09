@echo off
setlocal
set "PORT=8000"
set "FOUND="
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:":%PORT% .*LISTENING"') do (
  taskkill /PID %%p /F >nul 2>&1
  if not errorlevel 1 (
    echo Stopped the Krisgo Opening List server ^(PID %%p^).
    set "FOUND=1"
  )
)
if not defined FOUND echo No server was running on port %PORT%.
ping -n 4 127.0.0.1 >nul
