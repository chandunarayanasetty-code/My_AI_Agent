@echo off
setlocal
cd /d "%~dp0"

netstat -ano | findstr /c:":4321" | findstr /c:"LISTENING" >nul
if not errorlevel 1 goto open

echo Starting Course Tracker on http://localhost:4321 ...
start "Course Tracker server" /min cmd /c "node server.js"
timeout /t 2 /nobreak >nul

:open
start "" http://localhost:4321
exit /b
