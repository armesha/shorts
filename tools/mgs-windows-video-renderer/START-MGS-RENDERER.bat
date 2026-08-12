@echo off
setlocal
cd /d "%~dp0"

if not exist "ffmpeg\ffmpeg.exe" (
  echo ERROR: ffmpeg\ffmpeg.exe is missing.
  echo Extract the complete ZIP archive again and retry.
  pause
  exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0MgsVideoRenderer.ps1"
if errorlevel 1 (
  echo.
  echo The renderer stopped with an error.
  pause
)

