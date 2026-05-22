@echo off
cd /d "C:\Users\loran\.gemini\antigravity\scratch\moj_law_updater"
echo === Execution Started at %date% %time% === >> updater.log
agy-node fetch_laws.js >> updater.log 2>&1
echo === Execution Finished with exit code %errorlevel% === >> updater.log
