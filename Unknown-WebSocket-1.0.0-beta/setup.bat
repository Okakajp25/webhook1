@echo off
setlocal

echo Start installation
echo Installing package 'discord.js'
call npm i discord.js

echo:
echo:
echo Installing package 'ws'
call npm i ws

echo:
echo:
echo Installing package 'uuid'
call npm i uuid

echo:
echo:
echo Installing package 'ip'
call npm i ip

echo:
echo:
echo Setting slash commands
call node .\commands.js

echo Installation completed

pause