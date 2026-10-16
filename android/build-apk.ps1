# FileDNA Android Native APK Build Script
$ErrorActionPreference = "Stop"

$sdkDir = "C:\Users\ASUS\AppData\Local\Android\Sdk"
$buildToolsVersion = "36.0.0"
$platformVersion = "android-37.0"
$jdkBin = "F:\udaysssssssss\jbr\bin"
$env:JAVA_HOME = "F:\udaysssssssss\jbr"
$env:PATH = "$jdkBin;$env:PATH"

$aapt2 = Join-Path $sdkDir "build-tools\$buildToolsVersion\aapt2.exe"
$d8 = Join-Path $sdkDir "build-tools\$buildToolsVersion\d8.bat"
$zipalign = Join-Path $sdkDir "build-tools\$buildToolsVersion\zipalign.exe"
$apksigner = Join-Path $sdkDir "build-tools\$buildToolsVersion\apksigner.bat"
$androidJar = Join-Path $sdkDir "platforms\$platformVersion\android.jar"
$javac = Join-Path $jdkBin "javac.exe"
$keytool = Join-Path $jdkBin "keytool.exe"
$jar = Join-Path $jdkBin "jar.exe"

$projectDir = $PSScriptRoot
$appDir = Join-Path $projectDir "app"
$srcDir = Join-Path $appDir "src\main"
$resDir = Join-Path $srcDir "res"
$manifest = Join-Path $srcDir "AndroidManifest.xml"
$javaSrcDir = Join-Path $srcDir "java"

$buildDir = Join-Path $appDir "build"
$compiledRes = Join-Path $buildDir "compiled_res.zip"
$genDir = Join-Path $buildDir "gen"
$classesDir = Join-Path $buildDir "classes"
$dexDir = Join-Path $buildDir "dex"
$unalignedApk = Join-Path $buildDir "unaligned.apk"
$alignedApk = Join-Path $buildDir "aligned.apk"
$outDir = Join-Path $projectDir "release"
$finalApk = Join-Path $outDir "FileDNA-debug.apk"
$keystore = Join-Path $buildDir "debug.keystore"

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "       FILEDNA ANDROID APK BUILDER          " -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan

# Prepare directories
Remove-Item -Path $buildDir -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $buildDir -Force | Out-Null
New-Item -ItemType Directory -Path $genDir -Force | Out-Null
New-Item -ItemType Directory -Path $classesDir -Force | Out-Null
New-Item -ItemType Directory -Path $dexDir -Force | Out-Null
New-Item -ItemType Directory -Path $outDir -Force | Out-Null

Write-Host "[1/6] Compiling resources with aapt2..."
& $aapt2 compile --dir $resDir -o $compiledRes
if ($LASTEXITCODE -ne 0) { throw "aapt2 compile failed" }

Write-Host "[2/6] Linking resources & generating R.java..."
& $aapt2 link -I $androidJar --manifest $manifest --java $genDir -o $unalignedApk $compiledRes --auto-add-overlay --min-sdk-version 24 --target-sdk-version 34 --version-code 1 --version-name "2.0.0"
if ($LASTEXITCODE -ne 0) { throw "aapt2 link failed" }

Write-Host "[3/6] Compiling Java source files with javac..."
$javaFiles = Get-ChildItem -Path $genDir, $javaSrcDir -Filter "*.java" -Recurse | Select-Object -ExpandProperty FullName
& $javac -encoding UTF-8 -source 17 -target 17 -cp $androidJar -d $classesDir $javaFiles
if ($LASTEXITCODE -ne 0) { throw "javac compilation failed" }

Write-Host "[4/6] Converting bytecode to DEX with d8..."
$classFiles = Get-ChildItem -Path $classesDir -Filter "*.class" -Recurse | Select-Object -ExpandProperty FullName
& $d8 --min-api 24 --output $dexDir --lib $androidJar $classFiles
if ($LASTEXITCODE -ne 0) { throw "d8 compilation failed" }

Write-Host "[5/6] Adding classes.dex to APK package..."
Copy-Item (Join-Path $dexDir "classes.dex") -Destination $buildDir
Push-Location $buildDir
& $jar uf $unalignedApk "classes.dex"
Pop-Location
if ($LASTEXITCODE -ne 0) { throw "jar packaging failed" }

Write-Host "[6/6] Aligning and signing APK..."
& $zipalign -v -p 4 $unalignedApk $alignedApk | Out-Null
if ($LASTEXITCODE -ne 0) { throw "zipalign failed" }

# Generate debug keystore if not exists
if (!(Test-Path $keystore)) {
    & $keytool -genkeypair -alias androiddebugkey -keypass android -keystore $keystore -storepass android -dname "CN=Android Debug,O=Android,C=US" -keyalg RSA -keysize 2048 -validity 10000 | Out-Null
}

& $apksigner sign --ks $keystore --ks-pass pass:android --key-pass pass:android --out $finalApk $alignedApk
if ($LASTEXITCODE -ne 0) { throw "apksigner failed" }

$apkHash = (Get-FileHash -Path $finalApk -Algorithm SHA256).Hash
$apkSize = (Get-Item $finalApk).Length

Write-Host "=============================================" -ForegroundColor Green
Write-Host "SUCCESS! Android APK built successfully!" -ForegroundColor Green
Write-Host "APK Location: $finalApk" -ForegroundColor Green
Write-Host "APK Size: $([math]::Round($apkSize / 1024, 2)) KB" -ForegroundColor Green
Write-Host "SHA-256 Checksum: $apkHash" -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Green
