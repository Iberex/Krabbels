@echo off
rem ---------------------------------------------------------------------------
rem  EENMALIG: maakt bridge\venv aan en installeert numpy, websockets en opencv.
rem  Daarna kijkt het na of de Orbbec K4A Wrapper en de Body Tracking SDK gevonden worden.
rem ---------------------------------------------------------------------------
cd /d "%~dp0"
where py >nul 2>nul
if errorlevel 1 (
  echo Python niet gevonden. Installeer Python 3.11 via https://www.python.org/ ^(vink "py launcher" aan^).
  pause
  exit /b 1
)
if not exist "bridge\venv\Scripts\python.exe" (
  echo Python-omgeving aanmaken in bridge\venv ...
  py -3.11 -m venv bridge\venv 2>nul || py -3 -m venv bridge\venv
)
"bridge\venv\Scripts\python.exe" -m pip install --upgrade pip
"bridge\venv\Scripts\python.exe" -m pip install -r bridge\requirements.txt
if errorlevel 1 (
  echo Installeren mislukt. Internet?
  pause
  exit /b 1
)
echo.
echo ===== Controle =====
"bridge\venv\Scripts\python.exe" bridge\skeleton_bridge.py --check
echo.
echo Staat hierboven "alles gevonden en geladen"? Dan ben je klaar: start_femto.bat
pause
