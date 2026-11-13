@echo off
rem Start de Femto skeleton bridge. Extra opties worden doorgegeven, bv.:
rem   start_bridge.bat --no-preview
rem   start_bridge.bat --mode directml      (geen NVIDIA)
rem   start_bridge.bat --model lite         (sneller, minder nauwkeurig)
title Femto skeleton bridge
cd /d "%~dp0"
if not exist "venv\Scripts\python.exe" (
  echo bridge\venv bestaat niet. Draai eerst setup.bat in de hoofdmap.
  pause
  exit /b 1
)
"venv\Scripts\python.exe" skeleton_bridge.py %*
if errorlevel 1 pause
