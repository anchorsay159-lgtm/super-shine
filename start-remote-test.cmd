@echo off
setlocal
title Super Shine Remote Tester

echo.
echo Starting Super Shine through an Expo tunnel...
echo Your friend can scan this QR code from another Wi-Fi or mobile data.
echo Keep this window open while your friend tests.
echo.

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo Node.js and npm are required.
  echo Install Node.js, then run this file again.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing project packages...
  call npm.cmd install
  if errorlevel 1 (
    echo Package installation failed.
    pause
    exit /b 1
  )
)

set "attempt=1"

:start_tunnel
echo Tunnel attempt %attempt% of 3...
if "%attempt%"=="1" (
  call npm.cmd run start:remote
) else (
  call npm.cmd run start:remote:clear
)

if not errorlevel 1 goto tunnel_stopped
if "%attempt%"=="3" goto tunnel_failed

set /a attempt+=1
echo.
echo Expo could not reach ngrok. Retrying with a cleared Metro cache...
timeout /t 3 /nobreak >nul
goto start_tunnel

:tunnel_failed
echo.
echo The Expo tunnel did not connect after 3 attempts.
echo.
echo Try these fixes:
echo 1. Turn off any VPN or proxy temporarily.
echo 2. Allow Node.js, Expo, and ngrok through Windows Firewall.
echo 3. Try another internet connection or a mobile hotspot.
echo 4. Wait a few minutes, then open this file again.
goto finish

:tunnel_stopped
echo.
echo The Expo remote test has stopped.

:finish
pause
endlocal
