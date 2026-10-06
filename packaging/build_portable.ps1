param(
  [switch]$Clean = $true
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

Write-Host '[1/7] Python build dependencies' -ForegroundColor Cyan
python -m pip install --upgrade pip
python -m pip install -r backend/requirements-build.txt

if ($Clean) {
  Write-Host '[2/7] Cleaning old build' -ForegroundColor Cyan
  Remove-Item -Recurse -Force build -ErrorAction SilentlyContinue
  Remove-Item -Recurse -Force dist -ErrorAction SilentlyContinue
  Remove-Item -Recurse -Force .build -ErrorAction SilentlyContinue
} else {
  Write-Host '[2/7] Keeping old build cache' -ForegroundColor Cyan
}

Write-Host '[3/7] Running regression tests' -ForegroundColor Cyan
Push-Location backend
python -m pytest -q
Pop-Location

Write-Host '[4/7] Preparing complete offline frontend' -ForegroundColor Cyan
python packaging/prepare_offline_bundle.py
$offlineFrontend = (Resolve-Path '.build/offline_frontend').Path
$env:CB_CLINIC_FRONTEND_ROOT = $offlineFrontend

Write-Host '[5/7] Building one-folder portable app' -ForegroundColor Cyan
python -m PyInstaller --noconfirm packaging/clinic_v13.spec

$distDir = Join-Path $repo 'dist/학습클리닉_V13'
if (-not (Test-Path $distDir)) { throw "빌드 결과 폴더를 찾을 수 없습니다: $distDir" }

# portable.flag => SQLite/generated files remain beside the executable under data\
New-Item -ItemType File -Force (Join-Path $distDir 'portable.flag') | Out-Null
New-Item -ItemType Directory -Force (Join-Path $distDir 'data') | Out-Null

$readme = @'
충북종합학습클리닉 업무관리 프로그램 V13

실행: 학습클리닉_V13.exe
- Python 별도 설치 불필요
- 브라우저 별도 실행 불필요
- 인터넷 연결 없이 핵심 UI/차트/엑셀 기능 사용 가능
- Chart.js / SheetJS는 배포 폴더 내부 로컬 자산 사용
- Pretendard 외부 웹폰트는 사용하지 않고 Windows 시스템 글꼴 사용
- 내부 포트는 실행할 때 자동 배정
- 실제 업무 데이터는 이 폴더의 data\ 아래에 저장
- 프로그램 업데이트 시 data\ 폴더를 보존

권장 배포 방식
1. 학습클리닉_V13 폴더 전체를 복사
2. 네트워크 공유폴더에서 직접 실행하지 말고 PC 로컬 폴더에 복사 후 실행
3. 백업 JSON을 정기적으로 별도 보관
'@
Set-Content -Path (Join-Path $distDir '사용안내.txt') -Value $readme -Encoding UTF8

Write-Host '[6/7] Verifying offline package structure' -ForegroundColor Cyan
$internal = Join-Path $distDir '_internal'
$required = @(
  (Join-Path $distDir '학습클리닉_V13.exe'),
  (Join-Path $internal 'index.html'),
  (Join-Path $internal 'assets/js/bootstrap.js'),
  (Join-Path $internal 'assets/vendor/chart.umd.js'),
  (Join-Path $internal 'assets/vendor/xlsx.full.min.js'),
  (Join-Path $distDir 'portable.flag')
)
foreach ($path in $required) {
  if (-not (Test-Path $path)) { throw "필수 배포 파일 누락: $path" }
}
$indexText = Get-Content -Raw -Encoding UTF8 (Join-Path $internal 'index.html')
if ($indexText -match 'https?://(cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|unpkg\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)') {
  throw '배포 index.html에 외부 CDN 참조가 남아 있습니다.'
}
if ($indexText -notmatch 'assets/vendor/chart\.umd\.js') { throw '로컬 Chart.js 참조 누락' }
if ($indexText -notmatch 'assets/vendor/xlsx\.full\.min\.js') { throw '로컬 SheetJS 참조 누락' }

Write-Host '[7/7] Running packaged self-test and creating clean ZIP' -ForegroundColor Cyan
$p = Start-Process -FilePath (Join-Path $distDir '학습클리닉_V13.exe') -ArgumentList '--self-test' -Wait -PassThru
if ($p.ExitCode -ne 0) { throw "포터블 자가진단 실패: exit $($p.ExitCode)" }

$dataDir = Join-Path $distDir 'data'
Remove-Item -Recurse -Force $dataDir -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $dataDir | Out-Null
@'
이 폴더에는 실제 업무 데이터(SQLite, 생성 문서)가 저장됩니다.
프로그램 업데이트 시 이 data 폴더를 삭제하거나 덮어쓰지 마십시오.
'@ | Set-Content -Path (Join-Path $dataDir '데이터폴더_보존.txt') -Encoding UTF8

$zipPath = Join-Path $repo 'dist/학습클리닉_V13_Windows_Portable_EXE.zip'
Remove-Item -Force $zipPath -ErrorAction SilentlyContinue
Compress-Archive -Path $distDir -DestinationPath $zipPath -CompressionLevel Optimal

Write-Host '[PASS] V14 투영 / Python 정산 / HWPX / 오프라인 자가진단 완료' -ForegroundColor Green
Write-Host "Output: $distDir"
Write-Host "ZIP: $zipPath"
Write-Host 'Offline runtime dependencies: PASS' -ForegroundColor Green
