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
if not errorlevel 1 goto dockerok
echo  Starting Docker Desktop, please wait 1-3 minutes...
set "DD="
if exist "%ProgramFiles%\Docker\Docker\Docker Desktop.exe" set "DD=%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
if exist "%LOCALAPPDATA%\Programs\Docker\Docker\Docker Desktop.exe" set "DD=%LOCALAPPDATA%\Programs\Docker\Docker\Docker Desktop.exe"
if defined DD start "" "%DD%"
if not defined DD echo  Please open Docker Desktop from the Start menu.
set /a TRIES=0
:waitdocker
timeout /t 5 >nul
set /a TRIES+=1
docker info >nul 2>&1
if not errorlevel 1 goto dockerok
if %TRIES%==36 echo  Docker is taking long. Open Docker Desktop and wait for "Engine running".
if %TRIES%==36 echo  If it stays on "Engine starting": Start - type PowerShell - right click - Run as administrator - type: wsl --update
goto waitdocker
:dockerok

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
