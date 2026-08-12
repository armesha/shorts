@echo off
setlocal
cd /d "%~dp0"

if not exist "ffmpeg\ffmpeg.exe" goto broken
if not exist "MgsVideoRenderer.ps1" goto broken

start "" powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "%~dp0MgsVideoRenderer.ps1"
exit /b 0

:broken
echo.
echo   ARHIV RASPAKOVAN NE POLNOSTYU.
echo   Raspakuyte ves ZIP-arhiv i zapustite programmu snova.
echo.
pause
exit /b 1

