@echo off
setlocal
cd /d "%~dp0"
if not exist "node.exe" (
  echo Missing node.exe. Extract the entire ZIP before running this file.
  pause
  exit /b 1
)
echo Agent Studio starts only on this computer.
echo Keep this window open while using the app; close it to stop the server.
echo.
"%~dp0node.exe" "%~dp0launch-agent-studio.js"
if errorlevel 1 (
  echo.
  echo Agent Studio could not start. Check the error above.
  pause
)
