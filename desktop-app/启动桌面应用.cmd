@echo off
cd /d "%~dp0"
call npm run build:desktop
if errorlevel 1 (
  pause
  exit /b 1
)
call npm run start:desktop
if errorlevel 1 (
  pause
  exit /b 1
)
