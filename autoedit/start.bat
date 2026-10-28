@echo off
chcp 65001 >nul
title AutoEdit
cd /d "%~dp0"

where docker >nul 2>&1
if errorlevel 1 (
  echo.
  echo  Docker Desktop is not installed.
  echo  Download: https://www.docker.com/products/docker-desktop
  echo  Install it, restart the computer, open Docker Desktop and run start.bat again.
  start https://www.docker.com/products/docker-desktop
  pause
  exit /b 1
)

docker info >nul 2>&1
if errorlevel 1 (
  echo  Starting Docker Desktop, please wait...
  start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
  :waitdocker
  timeout /t 5 >nul
  docker info >nul 2>&1
  if errorlevel 1 goto waitdocker
)

if not exist ".env" copy ".env.example" ".env" >nul

echo.
echo  AutoEdit is starting. The first time takes 10-15 minutes (downloading and building).
echo.
docker compose up -d --build
if errorlevel 1 (
  echo  Startup failed. Copy the error above and send it.
  pause
  exit /b 1
)

echo  Waiting for the app...
:waitapp
timeout /t 3 >nul
powershell -NoProfile -Command "try { (Invoke-WebRequest -UseBasicParsing http://localhost:8765/api/health -TimeoutSec 3) | Out-Null; exit 0 } catch { exit 1 }"
if errorlevel 1 goto waitapp

start http://localhost:8765
echo.
echo  AutoEdit is running:  http://localhost:8765
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
  for /f "tokens=* delims= " %%b in ("%%a") do echo  On your phone (same WiFi):  http://%%b:8765
  goto doneip
)
:doneip
echo.
echo  To stop: double-click stop.bat
pause
