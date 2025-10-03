@echo off
setlocal enabledelayedexpansion
set SCRIPT_DIR=%~dp0
set PROJECT_ROOT=%SCRIPT_DIR%..\
cd /d %PROJECT_ROOT%
where node >nul 2>&1
if errorlevel 1 (
  echo 未检测到 node，请先安装 Node.js（推荐 18 或 20 版本）。
  exit /b 1
)
node src\server.js
