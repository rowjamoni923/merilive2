@echo off
setlocal enabledelayedexpansion
for /r "lib" %%f in (*.dart) do (
    powershell -Command "(Get-Content '%%f' -Raw) -replace 'blursize:', 'blurRadius:' -replace 'spreadsize:', 'spreadRadius:' -replace 'bordersize:', 'borderWidth:' -replace 'thumbsize:', 'thumbRadius:' -replace 'enabledThumbsize', 'enabledThumbRadius' -replace 'CircleAvatar\(size: 24', 'CircleAvatar(radius: 12' | Set-Content '%%f'"
)
