param(
  [switch]$Clean = $true
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

Write-Host '[1/5] Python build dependencies' -ForegroundColor Cyan
python -m pip install --upgrade pip
python -m pip install -r backend/requirements-build.txt

if ($Clean) {
  Write-Host '[2/5] Cleaning old build' -ForegroundColor Cyan
  Remove-Item -Recurse -Force build -ErrorAction SilentlyContinue
  Remove-Item -Recurse -Force dist -ErrorAction SilentlyContinue
} else {
  Write-Host '[2/5] Keeping old build cache' -ForegroundColor Cyan
}

Write-Host '[3/5] Running regression tests' -ForegroundColor Cyan
Push-Location backend
python -m pytest -q
Pop-Location

Write-Host '[4/5] Building one-folder portable app' -ForegroundColor Cyan
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
- 내부 포트는 실행할 때 자동 배정
- 실제 업무 데이터는 이 폴더의 data\ 아래에 저장
- 프로그램 업데이트 시 data\ 폴더를 보존

권장 배포 방식
1. 학습클리닉_V13 폴더 전체를 복사
2. 네트워크 공유폴더에서 직접 실행하지 말고 PC 로컬 폴더에 복사 후 실행
3. 백업 JSON을 정기적으로 별도 보관
'@
Set-Content -Path (Join-Path $distDir '사용안내.txt') -Value $readme -Encoding UTF8

Write-Host '[5/5] Build completed' -ForegroundColor Green
Write-Host "Output: $distDir"
