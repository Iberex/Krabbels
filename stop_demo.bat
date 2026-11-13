@echo off
rem Stopt de Femto-brug en de webserver van de demo (Chrome sluit je zelf).
taskkill /fi "WINDOWTITLE eq Femto skeleton bridge*" /t /f >nul 2>nul
taskkill /fi "WINDOWTITLE eq Krabbels demo webserver*" /t /f >nul 2>nul
echo Demo gestopt.
timeout /t 2 >nul
