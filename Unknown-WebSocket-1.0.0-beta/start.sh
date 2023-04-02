#!/bin/sh
echo Loading...

if [ ! -d "./node_modules" ]; then
    ./setup.sh
    echo Loading...
    node index.js
else
    node index.js
fi



echo Press [Enter] key to resume.
read Wait