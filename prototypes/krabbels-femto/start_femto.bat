@echo off
rem ---------------------------------------------------------------------------
rem  TEST 1 - Femto: start de camera-brug + webserver + Chrome (?bron=femto).
rem  Sluit eerst de webcam-test (Chrome-tabblad) voor een eerlijke vergelijking.
rem ---------------------------------------------------------------------------
cd /d "%~dp0"
set PORT=8090
set URL=http://localhost:%PORT%/?bron=femto

rem 1) Camera-brug starten, maar alleen als ze nog niet draait (poort 8765).
rem    --no-preview: geen debugvenster, dat kost rekentijd (het spel toont zelf het camerabeeld).
call :listening 8765
if errorlevel 1 (
  echo Camera-brug starten zonder debugvenster...
  start "Femto skeleton bridge" "%~dp0bridge\start_bridge.bat" --no-preview
) else (
  echo Camera-brug draait al.
)

call :webserver
timeout /t 2 /nobreak >nul
call :chrome
exit /b 0

rem ---------------- hulpjes (zelfde als in start_webcam.bat) ----------------
:listening
powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort %1 -State Listen -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"
exit /b %errorlevel%

:webserver
call :listening %PORT%
if not errorlevel 1 exit /b 0
set "SERVER="
if exist "bridge\venv\Scripts\python.exe" set SERVER="bridge\venv\Scripts\python.exe" serve.py %PORT%
if not defined SERVER where py >nul 2>nul && set SERVER=py -3 serve.py %PORT%
if not defined SERVER (
  echo Geen Python gevonden. Draai eerst setup.bat.
  pause
  exit /b 1
)
start "Krabbels webserver" /min %SERVER%
exit /b 0

:chrome
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
  start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" --new-window "%URL%"
) else if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" (
  start "" "%LocalAppData%\Google\Chrome\Application\chrome.exe" --new-window "%URL%"
) else (
  start "" "%URL%"
)
exit /b 0
