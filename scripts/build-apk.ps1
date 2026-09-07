# Builds the Android APK end to end: web bundle -> Capacitor sync -> Gradle.
#
# Everything the toolchain needs is resolved here rather than assumed to be on
# PATH, because the JDK and Android SDK are often installed outside the shell
# profile, and NoDefaultCurrentDirectoryInExePath stops cmd from finding
# gradlew.bat by bare name.
#
#   powershell -ExecutionPolicy Bypass -File scripts\build-apk.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\build-apk.ps1 -Release

param([switch]$Release)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

$jdk = Get-ChildItem 'C:\Program Files\Eclipse Adoptium' -Directory -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -like 'jdk-21*' } | Select-Object -First 1
if (-not $jdk) { throw 'Temurin JDK 21 not found under C:\Program Files\Eclipse Adoptium' }

$env:JAVA_HOME = $jdk.FullName
$env:ANDROID_HOME = 'C:\Android\sdk'
$env:ANDROID_SDK_ROOT = 'C:\Android\sdk'
$env:Path = "$env:JAVA_HOME\bin;C:\Program Files\nodejs;$env:Path"

$env:GRADLE_OPTS = '-Xmx1536m -Dfile.encoding=UTF-8'

Write-Host "JAVA_HOME    $env:JAVA_HOME"
Write-Host "ANDROID_HOME $env:ANDROID_HOME"

# Preflight: Gradle's daemon IPC needs java.nio Selector.open(), which on Windows
# builds its internal pipe over an AF_UNIX socket. Where AF_UNIX is unavailable that
# fails with a misleading "Unable to establish loopback connection" thrown from deep
# inside Gradle. Check it up front and say so plainly instead.
$probe = Join-Path $env:TEMP 'SelectorProbe.java'
@'
import java.nio.channels.Selector;
public class SelectorProbe {
  public static void main(String[] a) {
    try (Selector s = Selector.open()) { System.out.println("OK"); }
    catch (Throwable t) { System.out.println("FAIL"); }
  }
}
'@ | Set-Content -Path $probe -Encoding ascii
$probeResult = & "$env:JAVA_HOME\bin\java.exe" $probe 2>$null
if ($probeResult -notcontains 'OK') {
  throw @"
Gradle cannot start here.

java.nio Selector.open() fails because AF_UNIX sockets are not functional on this
system, and Gradle needs it to launch its build process. No JDK version avoids it.

Build the APK either:
  * on a machine where that works, or in Android Studio, or
  * by pushing to GitHub - .github/workflows/android.yml builds it on a Linux
    runner and uploads the APK as a build artifact.
"@
}

Set-Location $root

Write-Host "`n== building web bundle ==" -ForegroundColor Cyan
& npm run build
if ($LASTEXITCODE -ne 0) { throw "web build failed ($LASTEXITCODE)" }

Write-Host "`n== syncing into android project ==" -ForegroundColor Cyan
& npx cap sync android
if ($LASTEXITCODE -ne 0) { throw "cap sync failed ($LASTEXITCODE)" }

$task = if ($Release) { 'assembleRelease' } else { 'assembleDebug' }
Write-Host "`n== gradle $task ==" -ForegroundColor Cyan
$gradlew = Join-Path $root 'android\gradlew.bat'
& cmd /c "`"$gradlew`" -p `"$root\android`" $task --no-daemon"
if ($LASTEXITCODE -ne 0) { throw "gradle $task failed ($LASTEXITCODE)" }

$apk = Get-ChildItem "$root\android\app\build\outputs\apk" -Recurse -Filter '*.apk' |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $apk) { throw 'build reported success but no APK was produced' }

$dest = Join-Path $root ('payday-' + $(if ($Release) { 'release' } else { 'debug' }) + '.apk')
Copy-Item $apk.FullName $dest -Force

Write-Host "`nAPK: $dest" -ForegroundColor Green
Write-Host ("size: {0} MB" -f [math]::Round((Get-Item $dest).Length / 1MB, 2))
