@echo off
setlocal
where cl >nul 2>nul
if errorlevel 1 (
  echo Run this script from an x64 Native Tools Command Prompt for Visual Studio.
  exit /b 1
)
set "source=%~dp0"
set "assets=%~dp0..\Cyberpunk2077NightCoopRC\SaveIsolation"
if not exist "%source%build" mkdir "%source%build"
pushd "%source%build"
cl /nologo /W4 /O2 /MT /LD /Fe:winmm.dll /FI"%source%NightCoopWinmmForwarders.h" "%source%NightCoopEarlySaveRedirect.cpp" ole32.lib uuid.lib /link /IMPLIB:NightCoopWinmm.lib
if errorlevel 1 goto failed
cl /nologo /W4 /O2 /MT /c /I"%source%minhook\include" "%source%minhook\src\buffer.c" "%source%minhook\src\hook.c" "%source%minhook\src\trampoline.c" "%source%minhook\src\hde\hde64.c"
if errorlevel 1 goto failed
cl /nologo /W4 /O2 /MT /EHsc /std:c++17 /LD /I"%source%sdk" /I"%source%minhook\include" "%source%NightCoopSaveIsolation.cpp" buffer.obj hook.obj trampoline.obj hde64.obj ole32.lib uuid.lib
if errorlevel 1 goto failed
copy /Y winmm.dll "%assets%\winmm.dll" >nul
if errorlevel 1 goto failed
copy /Y NightCoopSaveIsolation.dll "%assets%\NightCoopSaveIsolation.dll" >nul
if errorlevel 1 goto failed
cl /nologo /W4 /O2 /MT /EHsc /std:c++17 /LD /I"%source%sdk" /I"%source%minhook\include" "%source%NightCoopSplitResolution.cpp" buffer.obj hook.obj trampoline.obj hde64.obj
if errorlevel 1 goto failed
copy /Y NightCoopSplitResolution.dll "%assets%\..\NightCoopSplitResolution.dll" >nul
if errorlevel 1 goto failed
popd
exit /b 0
:failed
popd
exit /b 1
