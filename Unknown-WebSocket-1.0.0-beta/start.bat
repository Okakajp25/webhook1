@echo off
setlocal
echo Loading...

if not exist "node_modules" call .\setup.bat


call node .\index.js

pause