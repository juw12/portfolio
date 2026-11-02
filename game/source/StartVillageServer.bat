@echo off
title Cozy Island village server
cd /d "%~dp0"
where py >nul 2>nul && (set PY=py -3) || (set PY=python)
%PY% app\build.py
start "" http://localhost:8787
%PY% server\village_server.py
pause
