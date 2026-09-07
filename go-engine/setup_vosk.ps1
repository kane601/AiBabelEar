$ErrorActionPreference = 'Stop'
$root = 'G:\AIAudio\VoiceBridge\voice-bridge\go-engine'
$src  = 'D:\Package\Python3.11.5\Lib\site-packages\vosk'
$lib  = Join-Path $root 'vosk_lib'
$mgw  = 'C:\msys64\mingw64\bin'

New-Item -ItemType Directory -Force $lib | Out-Null

# 1) 拷贝预编译 libvosk 及其 MinGW 运行时依赖
foreach ($f in 'libvosk.dll','libgcc_s_seh-1.dll','libstdc++-6.dll','libwinpthread-1.dll') {
    Copy-Item (Join-Path $src $f) (Join-Path $lib $f) -Force
}

# 2) 下载 vosk_api.h 头文件（wheel 不含，需从源码仓库取）
$url = 'https://raw.githubusercontent.com/alphacep/vosk-api/master/src/vosk_api.h'
Invoke-WebRequest -Uri $url -OutFile (Join-Path $lib 'vosk_api.h')
Write-Host "header bytes: $((Get-Item (Join-Path $lib 'vosk_api.h')).Length)"

# 3) 生成 MinGW 导入库 libvosk.dll.a
Set-Location $lib
& (Join-Path $mgw 'gendef.exe') 'libvosk.dll' | Out-Null
& (Join-Path $mgw 'dlltool.exe') '-d','libvosk.def','-D','libvosk.dll','-l','libvosk.dll.a' | Out-Null
Write-Host "dll.a bytes: $((Get-Item (Join-Path $lib 'libvosk.dll.a')).Length)"
Write-Host "DONE"
