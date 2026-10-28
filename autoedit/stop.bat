@echo off
cd /d "%~dp0"
docker compose down
echo AutoEdit stopped.
pause
