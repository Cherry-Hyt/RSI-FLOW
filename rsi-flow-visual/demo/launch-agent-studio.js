'use strict';

const { spawn } = require('node:child_process');
const { server } = require('./agent-local-server');

const url = 'http://127.0.0.1:1234/agent-studio.html';
server.once('listening', () => {
  console.log(`Open ${url} if the browser does not open automatically.`);
  if (process.platform !== 'win32') return;
  const browser = spawn('cmd.exe', ['/d', '/c', `start "" "${url}"`], {
    windowsHide: true,
    stdio: 'ignore'
  });
  browser.on('error', (error) => console.error(`Could not open browser: ${error.message}`));
});
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error('Port 1234 is already in use. Close the other Agent Studio window or application and try again.');
  } else {
    console.error(`Local server failed: ${error.message}`);
  }
  process.exitCode = 1;
});
