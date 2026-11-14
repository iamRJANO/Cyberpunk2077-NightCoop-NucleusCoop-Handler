@echo off
setlocal
if "%~1"=="" (
    echo Usage: %~nx0 "path to Nucleus Co-op"
    exit /b 1
)
set "source=%~dp0"
set "assets=%source%..\Cyberpunk2077NightCoopRC"
set "nucleus=%~1"
"%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe" /nologo /target:library /platform:anycpu /optimize+ /warnaserror /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:"%nucleus%\NucleusCoop.exe" /r:"%nucleus%\Nucleus.Gaming.dll" /out:"%assets%\NightCoopOptionsNotes.dll" "%source%NightCoopOptionsNotes.cs"
exit /b %errorlevel%
