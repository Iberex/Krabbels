@echo off
rem ---------------------------------------------------------------------------
rem  Krabbels testdemo met de Femto Bolt.
rem  1) start de Femto-brug (skeletten via de dieptecamera, NVIDIA)
rem  2) start de webserver (poort 8091)
rem  3) opent Chrome volledig scherm
rem  Camera staat ACHTER de spelers (richting de muur). Staat ze ervoor? Zet ACHTER=0.
rem ---------------------------------------------------------------------------
cd /d "%~dp0"
set PORT=8091
set ACHTER=1
set BRIDGE=%~dp0..\krabbels-femto\bridge
set PY=%BRIDGE%\venv\Scripts\python.exe
rem Versie: leeg = gewone demo, "v2" = v2 (start_demo_v2.bat)
set PAGE=
if /i "%~1"=="v2" set PAGE=v2/
set URL=http://localhost:%PORT%/%PAGE%?achter=%ACHTER%

if not exist "%PY%" (
  echo Femto-brug niet gevonden: %BRIDGE%
  echo Draai eerst setup.bat in krabbels-femto.
  pause
  exit /b 1
)

rem 1) Femto-brug (alleen als ze nog niet draait op poort 8765)
call :listening 8765
if errorlevel 1 (
  echo Femto-brug starten...
  start "Femto skeleton bridge" /min "%BRIDGE%\start_bridge.bat" --no-preview
) else (
  echo Femto-brug draait al.
)

rem 2) Webserver
call :listening %PORT%
if errorlevel 1 start "Krabbels demo webserver" /min "%PY%" serve.py %PORT%
timeout /t 2 /nobreak >nul

rem 3) Chrome, volledig scherm
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
  start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" --new-window --start-fullscreen "%URL%"
) else (
  start "" "%URL%"
)
echo.
echo Demo gestart. De body tracker heeft +-10 s nodig. Stoppen: stop_demo.bat
timeout /t 5 >nul
exit /b 0

:listening
powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort %1 -State Listen -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"
exit /b %errorlevel%
