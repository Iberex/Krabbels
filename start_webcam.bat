@echo off
rem ---------------------------------------------------------------------------
rem  TEST 2 - Webcam: de kleurcamera van de Femto + MediaPipe in Chrome (?bron=webcam).
rem  De camera-brug is hier NIET nodig. Draait ze nog, dan rekent ze mee op dezelfde
rem  camera en videokaart: stop ze dan eerst voor een eerlijke vergelijking.
rem ---------------------------------------------------------------------------
cd /d "%~dp0"
set PORT=8090
set URL=http://localhost:%PORT%/?bron=webcam

call :listening 8765
if not errorlevel 1 (
  echo.
  echo LET OP: de camera-brug draait nog. Voor een eerlijke test: sluit het zwarte venster
  echo "Femto skeleton bridge" en druk dan hier op een toets.
  echo.
  pause
)

call :webserver
timeout /t 2 /nobreak >nul
call :chrome
exit /b 0

rem ---------------- hulpjes (zelfde als in start_femto.bat) ----------------
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
