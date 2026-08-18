@echo off
chcp 65001 >nul
set "APPDIR=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$w=New-Object -ComObject WScript.Shell; $d=[Environment]::GetFolderPath('Desktop'); $s=$w.CreateShortcut((Join-Path $d 'Quasimorph Companion.lnk')); $s.TargetPath=(Join-Path $env:APPDIR 'Quasimorph Companion.vbs'); $s.WorkingDirectory=$env:APPDIR; $s.IconLocation=(Join-Path $env:APPDIR 'assets\icon.ico'); $s.Description='Quasimorph Companion'; $s.Save()"
echo.
echo Yarlyk stvoreno na robochomu stoli / Ярлик створено на робочому столі.
echo.
pause
