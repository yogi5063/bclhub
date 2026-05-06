@echo off
title FIP MIS Dashboard
color 0B
echo.
echo ============================================
echo   FIP MIS Dashboard - Perk Labs
echo ============================================
echo.
echo  Starting server...

cd /d "%~dp0"

:: Kill anything already on port 3000
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000 " ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)

:: Start the server in the background, log to file
start /B node server/index.js > server.log 2>&1

:: Poll port 3000 until accepting connections (max 20s)
set /a tries=0
:wait_loop
set /a tries+=1
if %tries% gtr 20 goto :failed
powershell -NoProfile -Command "try { (New-Object Net.Sockets.TcpClient('localhost', 3000)).Close(); exit 0 } catch { exit 1 }" >nul 2>&1
if errorlevel 1 (
    timeout /t 1 /nobreak >nul
    goto :wait_loop
)

:: Open default browser
start "" http://localhost:3000

echo.
echo ============================================
echo   READY!
echo   URL    : http://localhost:3000
echo   Login  : admin  (or leon, or yogi)
echo   Pass   : PerkLabs2026!
echo ============================================
echo.
echo  This window stays open - server keeps running.
echo  Press any key to STOP the server and close.
pause >nul

:: Stop the server
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000 " ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)
echo  Server stopped. Goodbye.
timeout /t 2 /nobreak >nul
exit

:failed
echo.
echo  ERROR: Server failed to start within 20s. Check server.log for details:
echo.
type server.log
echo.
pause
