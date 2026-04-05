@echo off
cd /d C:\Users\Administrator\Desktop\Toni\kemo
set KEMO_LOCAL_PREVIEW=1
"C:\Users\Administrator\Tools\node-v24.14.0-win-x64\npm.cmd" run start -- --port 4000 1>.prod-server.log 2>.prod-server.err.log
