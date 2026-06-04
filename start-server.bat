@echo off
chcp 65001 >nul
title Fuel2 Backend Server

echo ========================================
echo   Fuel2 Backend Server
echo ========================================
echo(

:: Environment Check

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found. Please install Node.js from https://nodejs.org
    pause
    exit /b 1
)

where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] npm not found. Please reinstall Node.js.
    pause
    exit /b 1
)

echo [INFO] Node.js:
node --version
echo [INFO] npm:
call npm --version
echo(

:: Enter project directory

cd /d "%~dp0server" || (
    echo [ERROR] Cannot find server/ directory.
    echo         Make sure start-server.bat is in the project root folder.
    pause
    exit /b 1
)

echo [INFO] Working directory: %CD%
echo(

:: Kill any existing process on port 3000
powershell -NoLogo -NoProfile -Command "netstat -ano | Select-String ':3000 ' | ForEach-Object { $p = ($_.Line -split '\s+', 6 | Select-Object -Last 1); Write-Host ('[INFO] Killing process PID ' + $p + ' (port 3000)...'); Stop-Process -Id $p -Force -ErrorAction SilentlyContinue }"
echo(

:: Install dependencies if needed
if not exist "node_modules" (
    echo [INFO] Installing dependencies...
    echo(
    call npm install
    if %errorlevel% neq 0 (
        echo(
        echo [ERROR] npm install failed. Check your network.
        pause
        exit /b 1
    )
    echo(
)

:: Start server
echo [INFO] Starting dev server...
echo(
echo --------------------------------------------------
echo   After startup, visit: http://localhost:3000/health
echo   Press Ctrl + C to stop
echo --------------------------------------------------
echo(

call npm run dev

:: On exit
echo(
echo [INFO] Server stopped (exit code: %errorlevel%).
echo(
pause
