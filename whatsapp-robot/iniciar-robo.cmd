@echo off
cd /d "%~dp0"

if not exist node_modules (
  echo Dependencias ainda nao instaladas.
  echo Execute npm install nesta pasta antes da primeira inicializacao.
  pause
  exit /b 1
)

npm start
pause
