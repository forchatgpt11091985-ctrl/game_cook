@echo off
set "GAME_COOK_ROOT=%~dp0"
powershell.exe -NoProfile -Command "& ([ScriptBlock]::Create([System.IO.File]::ReadAllText((Join-Path $env:GAME_COOK_ROOT 'server.ps1'))))"
pause
