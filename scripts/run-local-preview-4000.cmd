@echo off
cd /d C:\Users\Administrator\Desktop\Toni\kemo
set KEMO_LOCAL_PREVIEW=1
"C:\Users\Administrator\Tools\node-v24.14.0-win-x64\node.exe" "C:\Users\Administrator\Desktop\Toni\kemo\node_modules\next\dist\bin\next" start -p 4000 1>.prod-server.log 2>.prod-server.err.log
