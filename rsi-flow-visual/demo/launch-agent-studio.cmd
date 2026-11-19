@echo off
setlocal
set "NODE_EXE="
where node >nul 2>nul
if not errorlevel 1 set "NODE_EXE=node"
if not defined NODE_EXE if exist "%USERPROFILE%\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe" set "NODE_EXE=%USERPROFILE%\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
if not defined NODE_EXE (
  echo Node.js not found. Install Node.js or set it in PATH.
  pause
  exit /b 1
)
echo Open http://127.0.0.1:1234/agent-studio.html in your browser.
echo Enter Base URL, API Key and model in the page; no hostname setup required.
echo Keep this window open while testing. Press Ctrl+C to stop.
"%NODE_EXE%" "%~dp0agent-local-server.js"
pause
