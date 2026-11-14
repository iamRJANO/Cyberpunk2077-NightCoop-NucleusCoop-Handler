@echo off
setlocal
set "source=%~dp0"
set "assets=%source%..\Cyberpunk2077NightCoopRC"
"%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe" /nologo /target:winexe /platform:x64 /optimize+ /warnaserror /r:System.Windows.Forms.dll /r:System.Drawing.dll /out:"%assets%\ResetNightCoopWindows.exe" "%source%ResetNightCoopWindows.cs"
exit /b %errorlevel%
