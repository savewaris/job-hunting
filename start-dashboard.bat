@echo off
setlocal EnableDelayedExpansion
title CareerPulse AI — Job Hunting Dashboard
cd /d "%~dp0"

set "PORT=3000"
set "URL=http://localhost:%PORT%"

REM Use DATABASE_URL from .env.local if configured; otherwise fall back to local .dev-db store
set "HAS_DB_URL=0"
if defined DATABASE_URL set "HAS_DB_URL=1"
if exist ".env.local" (
    findstr /R /C:"^DATABASE_URL=." ".env.local" >nul 2>&1
    if !errorlevel! equ 0 set "HAS_DB_URL=1"
)

if "!HAS_DB_URL!"=="0" (
    set "DEV_DB_DIR=.dev-db"
    if not exist ".dev-db" (
        echo [CareerPulse] Initializing and seeding local dev database ^(.dev-db^)...
        call npm run db:seed-dev
    )
)

REM Check if server is already listening on PORT
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri '%URL%' -UseBasicParsing -TimeoutSec 2; exit 0 } catch { exit 1 }"
if %errorlevel% equ 0 (
    echo [CareerPulse] Server is already running at %URL%. Opening browser...
    start "" "%URL%"
    exit /b 0
)

echo [CareerPulse] Starting Next.js server at %URL%...
echo [CareerPulse] Your browser will open automatically as soon as the server is ready.
start "" /b powershell -NoProfile -WindowStyle Hidden -Command "for ($i = 0; $i -lt 60; $i++) { Start-Sleep -Seconds 1; try { $r = Invoke-WebRequest -Uri '%URL%' -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -eq 200) { Start-Process '%URL%'; break } } catch {} }"

call npm run dev
