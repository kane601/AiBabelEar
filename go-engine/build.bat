@echo off
cd /d "%~dp0"
setlocal

REM ===== 工具链（官方 64 位 Go + 64 位 MinGW-W64 gcc）=====
set "GO_BIN=D:\Program Files\Go_x64\bin"
set "MINGW_BIN=C:\msys64\mingw64\bin"

if not exist "%GO_BIN%\go.exe" (
  echo [ERROR] %GO_BIN%\go.exe not found
  exit /b 1
)
if not exist "%MINGW_BIN%\gcc.exe" (
  echo [WARN] %MINGW_BIN%\gcc.exe not found, falling back to PATH gcc
) else (
  set "PATH=%MINGW_BIN%;%PATH%"
)

REM 官方 Go 完整路径调用，避免误用 MSYS2 的 trimmed go
set "GOROOT=D:\Program Files\Go_x64"
set CGO_ENABLED=1
set GOARCH=amd64
set "PATH=%GO_BIN%;%PATH%"

REM ===== Vosk 预编译库（由 setup_vosk.ps1 准备：libvosk.dll + vosk_api.h + 导入库）=====
set "VOSK_LIB=%~dp0vosk_lib"
if not exist "%VOSK_LIB%\vosk_api.h" (
  echo [ERROR] %VOSK_LIB%\vosk_api.h missing. Run setup_vosk.ps1 first.
  exit /b 1
)
if not exist "%VOSK_LIB%\libvosk.dll.a" (
  echo [ERROR] %VOSK_LIB%\libvosk.dll.a missing. Run setup_vosk.ps1 first.
  exit /b 1
)
set CGO_CFLAGS=-I%VOSK_LIB%
set CGO_LDFLAGS=-L%VOSK_LIB% -lvosk

echo go:   & "%GO_BIN%\go.exe" version
echo gcc:  & "%MINGW_BIN%\gcc.exe" -dumpmachine
echo.

echo Building FULL engine (SOSV + Vosk + GLM + Gummy)...
"%GO_BIN%\go.exe" build -o dist/engine.exe ./cmd/engine/
if errorlevel 1 (
  echo BUILD FAILED.
  exit /b 1
)
echo BUILD OK ^(SOSV + Vosk + GLM + Gummy^): dist/engine.exe

echo Copying libvosk.dll to dist (MinGW runtime DLLs already present in dist)...
copy /Y "%VOSK_LIB%\libvosk.dll" dist\ >nul
echo Done.
endlocal
