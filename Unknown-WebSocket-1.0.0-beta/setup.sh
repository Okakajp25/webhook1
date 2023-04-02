#!/bin/sh

echo Start installation
echo Installing package 'discord.js'
npm i discord.js

echo -e "\n\n\nInstalling package 'ws'"
npm i ws

echo -e "\n\n\nInstalling package 'uuid'"
npm i uuid

echo -e "\n\n\nInstalling package 'ip'"
npm i ip

echo -e "\n\n\nSetting slash commands"
node commands.js

echo Installation completed

echo Press [Enter] key to resume.
read Wait