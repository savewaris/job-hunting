@echo off
title Facebook Chrome Login Launcher
echo ========================================================
echo   Launching Google Chrome with Job-Hunting Profile...
echo ========================================================
echo.

set PROFILE_DIR=%~dp0user_data\chrome_profile
if not exist "%PROFILE_DIR%" mkdir "%PROFILE_DIR%"

if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --user-data-dir="%PROFILE_DIR%" --start-maximized "https://www.facebook.com/"
    echo Chrome launched! Log into Facebook in the Chrome window.
    goto end
)

if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" (
    start "" "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" --user-data-dir="%PROFILE_DIR%" --start-maximized "https://www.facebook.com/"
    echo Chrome launched! Log into Facebook in the Chrome window.
    goto end
)

if exist "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" (
    start "" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --user-data-dir="%PROFILE_DIR%" --start-maximized "https://www.facebook.com/"
    echo Edge launched! Log into Facebook in the Edge window.
    goto end
)

echo No Chrome or Edge found. Opening default browser...
start "" "https://www.facebook.com/"

:end
echo.
echo Once you finish logging in, return to the dashboard (http://localhost:3000) and click 'Check Session Status'.
timeout /t 5
