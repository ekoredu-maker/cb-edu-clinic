param(
  [switch]$Clean = $true
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

$buildRoot = Join-Path $repo '.build'
$offlineFrontend = Join-Path $buildRoot 'offline_frontend'
$stage = Join-Path $buildRoot 'embedded_portable\학습클리닉_V13_Embedded'
$runtime = Join-Path $stage 'runtime'
$dist = Join-Path $repo 'dist'
$zipPath = Join-Path $dist '학습클리닉_V13_Windows_Portable_Embedded.zip'

if ($Clean) {
  Remove-Item -Recurse -Force (Join-Path $buildRoot 'embedded_portable') -ErrorAction SilentlyContinue
  Remove-Item -Force $zipPath -ErrorAction SilentlyContinue
}

if (!(Test-Path $offlineFrontend)) {
  Write-Host '[1/8] Preparing offline frontend' -ForegroundColor Cyan
  python packaging/prepare_offline_bundle.py
} else {
  Write-Host '[1/8] Reusing prepared offline frontend' -ForegroundColor Cyan
}

New-Item -ItemType Directory -Force $stage | Out-Null
New-Item -ItemType Directory -Force $runtime | Out-Null
New-Item -ItemType Directory -Force $dist | Out-Null

Write-Host '[2/8] Downloading official Python embedded runtime' -ForegroundColor Cyan
$pyver = (python -c "import sys; print('.'.join(map(str, sys.version_info[:3])))").Trim()
$pyminor = (python -c "import sys; print(f'{sys.version_info.major}{sys.version_info.minor}')").Trim()
$embedUrl = "https://www.python.org/ftp/python/$pyver/python-$pyver-embed-amd64.zip"
$embedZip = Join-Path $buildRoot "python-$pyver-embed-amd64.zip"
if (!(Test-Path $embedZip)) {
  Invoke-WebRequest -Uri $embedUrl -OutFile $embedZip
}
Expand-Archive -Path $embedZip -DestinationPath $runtime -Force

$pth = Get-ChildItem $runtime -Filter "python$pyminor._pth" | Select-Object -First 1
if (!$pth) { throw "Python embedded _pth 파일을 찾을 수 없습니다." }
@"
python$pyminor.zip
.
Lib\site-packages
..\backend
import site
"@ | Set-Content -Path $pth.FullName -Encoding ASCII

Write-Host '[3/8] Installing runtime libraries inside portable folder' -ForegroundColor Cyan
$site = Join-Path $runtime 'Lib\site-packages'
New-Item -ItemType Directory -Force $site | Out-Null
python -m pip install --disable-pip-version-check --no-compile --target $site -r backend/requirements.txt

Write-Host '[4/8] Copying application and offline frontend' -ForegroundColor Cyan
foreach ($name in @('index.html','manifest.webmanifest','sw.js')) {
  $src = Join-Path $offlineFrontend $name
  if (Test-Path $src) { Copy-Item $src (Join-Path $stage $name) -Force }
}
foreach ($name in @('assets','icons')) {
  $src = Join-Path $offlineFrontend $name
  if (Test-Path $src) { Copy-Item $src (Join-Path $stage $name) -Recurse -Force }
}

$backendOut = Join-Path $stage 'backend'
New-Item -ItemType Directory -Force $backendOut | Out-Null
foreach ($name in @('app.py','launcher.py','runtime_paths.py')) {
  Copy-Item (Join-Path $repo "backend\$name") (Join-Path $backendOut $name) -Force
}
foreach ($name in @('database','domain','services','templates')) {
  Copy-Item (Join-Path $repo "backend\$name") (Join-Path $backendOut $name) -Recurse -Force
}

New-Item -ItemType File -Force (Join-Path $stage 'portable.flag') | Out-Null
New-Item -ItemType Directory -Force (Join-Path $stage 'data') | Out-Null

$runCmd = @'
@echo off
setlocal
cd /d "%~dp0"
set "CB_CLINIC_PORTABLE=1"
if exist "%~dp0data\startup_error.log" del /q "%~dp0data\startup_error.log"
echo [Clinic V13] Starting Python engine...
echo Keep this window open while using the program.
"%~dp0runtime\python.exe" "%~dp0backend\launcher.py" --browser
if errorlevel 1 (
  echo.
  echo [FAIL] Program startup failed.
  echo Error log: "%~dp0data\startup_error.log"
  if exist "%~dp0data\startup_error.log" type "%~dp0data\startup_error.log"
  pause
)
'@
Set-Content -Path (Join-Path $stage '실행.cmd') -Value $runCmd -Encoding ASCII

$browserCmd = @'
@echo off
setlocal
cd /d "%~dp0"
set "CB_CLINIC_PORTABLE=1"
echo [Clinic V13] Starting Python engine in browser fallback mode...
echo Keep this window open while using the program.
"%~dp0runtime\python.exe" "%~dp0backend\launcher.py" --browser
if errorlevel 1 (
  echo.
  echo [FAIL] Browser fallback mode failed.
  echo Check: "%~dp0data\startup_error.log"
  pause
)
'@
Set-Content -Path (Join-Path $stage '실행_브라우저모드.cmd') -Value $browserCmd -Encoding ASCII

$windowCmd = @'
@echo off
setlocal
cd /d "%~dp0"
set "CB_CLINIC_PORTABLE=1"
if exist "%~dp0data\startup_error.log" del /q "%~dp0data\startup_error.log"
start "" "%~dp0runtime\pythonw.exe" "%~dp0backend\launcher.py"
timeout /t 3 /nobreak >nul
if exist "%~dp0data\startup_error.log" (
  echo.
  echo [FAIL] Window mode startup failed.
  echo Use the standard 실행.cmd instead.
  type "%~dp0data\startup_error.log"
  pause
)
'@
Set-Content -Path (Join-Path $stage '실행_창모드_선택.cmd') -Value $windowCmd -Encoding ASCII

$diagCmd = @'
@echo off
setlocal
cd /d "%~dp0"
set "CB_CLINIC_PORTABLE=1"
echo [Clinic V13] Diagnostic launch...
"%~dp0runtime\python.exe" "%~dp0backend\launcher.py"
echo.
echo Exit code: %errorlevel%
echo Error log: "%~dp0data\startup_error.log"
pause
'@
Set-Content -Path (Join-Path $stage '실행_진단.cmd') -Value $diagCmd -Encoding ASCII

$selfCmd = @'
@echo off
setlocal
cd /d "%~dp0"
set "CB_CLINIC_PORTABLE=1"
"%~dp0runtime\python.exe" "%~dp0backend\launcher.py" --self-test
if errorlevel 1 (
  echo.
  echo [FAIL] 포터블 자가진단에 실패했습니다.
  pause
  exit /b 1
)
echo.
echo [PASS] V14 연계 / Python 정산 / HWPX / 오프라인 자산 자가진단을 통과했습니다.
pause
'@
Set-Content -Path (Join-Path $stage '자가진단.cmd') -Value $selfCmd -Encoding ASCII

$readme = @'
충북종합학습클리닉 업무관리 프로그램 V13 - Python Embedded Portable

[실행]
1. ZIP 파일을 PC 로컬 폴더에 완전히 압축 해제합니다.
2. "실행.cmd"를 실행합니다.
3. 별도의 Python 설치가 필요하지 않습니다.
4. 명령창이 열린 뒤 기본 브라우저에서 프로그램 화면이 자동으로 열립니다.
5. 프로그램을 사용하는 동안 실행 명령창은 닫지 마십시오.
6. 실행이 실패하면 실행_진단.cmd를 실행하여 오류를 확인하십시오.

[중요]
- index.html을 직접 더블클릭하면 화면은 열릴 수 있지만 Python 엔진이 연결되지 않은 브라우저 단독모드입니다.
- 정산, V14 실적 투영, SQLite, HWPX 등 하이브리드 기능은 실행.cmd 또는 실행_브라우저모드.cmd로 시작해야 합니다.

[V14 실적 가져오기]
1. V14 실시간 운영 프로그램의 행정/장학 대시보드에서 "V13 연계"를 엽니다.
2. 대상 월을 선택하고 "V13 연계파일 만들기"를 눌러 JSON을 저장합니다.
3. 이 V13 프로그램 상단의 "☁ V14 실적 가져오기"에서 JSON을 선택합니다.
4. Python 엔진이 매칭ID를 대조하여 실적을 반영하고 SQLite와 Browser 저장소를 함께 갱신합니다.
5. 같은 파일을 다시 가져와도 세션 ID 기준으로 중복 생성하지 않고 갱신합니다.

[데이터]
- 실제 업무 데이터: data 폴더
- 업데이트할 때는 기존 data 폴더를 반드시 보존하십시오.
- 정기적으로 프로그램의 백업 기능으로 JSON 백업을 별도 보관하십시오.

[오프라인]
- Chart.js / SheetJS는 프로그램 내부에 포함되어 있습니다.
- 핵심 V13 관리·정산·HWPX 기능은 인터넷 연결 없이 사용 가능합니다.
- V14 실시간 사이트에서 연계 JSON을 만드는 작업만 인터넷이 필요합니다.

[문제 발생 시]
- 먼저 "자가진단.cmd"를 실행하십시오.
- PASS가 나오면 Python 엔진, V14 투영, 정산, HWPX, 오프라인 자산은 정상입니다.
- 실행.cmd만 실패하고 자가진단이 PASS이면 pywebview/WebView2 구간 문제일 가능성이 높습니다. 이때는 실행_브라우저모드.cmd를 사용하십시오.
- 실행_브라우저모드.cmd는 Python 엔진을 정상 연결한 채 기본 브라우저에서 프로그램을 엽니다.
- 그래도 실패하면 실행_진단.cmd를 실행하고 data\startup_error.log를 확인하십시오.
- 학교/교육청 보안정책이 python.exe/pythonw.exe 실행 자체를 차단하는 경우에는 EXE형 포터블 또는 기관 보안예외가 필요할 수 있습니다.
'@
Set-Content -Path (Join-Path $stage '사용안내.txt') -Value $readme -Encoding UTF8

Write-Host '[5/8] Verifying embedded package structure' -ForegroundColor Cyan
$required = @(
  (Join-Path $runtime 'python.exe'),
  (Join-Path $runtime 'pythonw.exe'),
  (Join-Path $backendOut 'app.py'),
  (Join-Path $backendOut 'domain\realtime_projection.py'),
  (Join-Path $stage 'assets\js\hybrid\realtime-import.js'),
  (Join-Path $stage 'assets\vendor\chart.umd.js'),
  (Join-Path $stage 'assets\vendor\xlsx.full.min.js'),
  (Join-Path $stage '실행.cmd'),
  (Join-Path $stage '실행_브라우저모드.cmd'),
  (Join-Path $stage '실행_창모드_선택.cmd'),
  (Join-Path $stage '실행_진단.cmd'),
  (Join-Path $stage '자가진단.cmd'),
  (Join-Path $stage 'portable.flag')
)
foreach ($path in $required) {
  if (!(Test-Path $path)) { throw "필수 파일 누락: $path" }
}

Write-Host '[6/8] Running embedded portable self-test' -ForegroundColor Cyan
$env:CB_CLINIC_PORTABLE = '1'
& (Join-Path $runtime 'python.exe') (Join-Path $backendOut 'launcher.py') --self-test
if ($LASTEXITCODE -ne 0) { throw "Embedded portable self-test failed: $LASTEXITCODE" }

Write-Host '[7/8] Removing build-test data and creating clean data folder' -ForegroundColor Cyan
$dataDir = Join-Path $stage 'data'
Remove-Item -Recurse -Force $dataDir -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $dataDir | Out-Null
@'
이 폴더에는 실제 업무 데이터(SQLite, 생성 문서)가 저장됩니다.
프로그램 업데이트 시 이 data 폴더를 삭제하거나 덮어쓰지 마십시오.
'@ | Set-Content -Path (Join-Path $dataDir '데이터폴더_보존.txt') -Encoding UTF8

Write-Host '[8/8] Creating ZIP package' -ForegroundColor Cyan
if (Test-Path $zipPath) { Remove-Item -Force $zipPath }
Compress-Archive -Path $stage -DestinationPath $zipPath -CompressionLevel Optimal
if (!(Test-Path $zipPath)) { throw "ZIP 생성 실패: $zipPath" }

Write-Host "Embedded portable output: $stage" -ForegroundColor Green
Write-Host "ZIP: $zipPath" -ForegroundColor Green
