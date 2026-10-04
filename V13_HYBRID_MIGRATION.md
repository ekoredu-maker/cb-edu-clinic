# V13 Hybrid Migration

## 목표
기존 V12.3.x의 사용자 화면과 PWA 호환성을 유지하면서 계산·검증·정산·문서출력을 Python 업무엔진으로 단계적으로 이전한다.

## 원칙
1. 기존 `main`은 안정판으로 유지한다.
2. `v13-hybrid-migration` 브랜치에서 단계적으로 이식한다.
3. Python으로 이전한 계산은 즉시 교체하지 않고 기존 JS 결과와 회귀대조한다.
4. 통계·검증·정산이 일치한 뒤 Python을 단일 계산원본으로 승격한다.
5. 문서출력은 실제 기관 HWPX 원본 템플릿을 보존하고 값만 주입하는 방식으로 구현한다.
6. Windows 하이브리드는 고정 포트를 사용하지 않고 실행 시 빈 포트를 자동 배정한다.
7. Python이 없는 GitHub/PWA 환경에서는 기존 기능을 계속 사용할 수 있어야 한다.

## 단계별 진행

### 1단계 — 하이브리드 골격
- FastAPI 엔진
- SQLite 초기화
- JS ↔ Python 브리지
- pywebview 런처
- HWPX 서비스 골격

### 2단계 — 통계·검증
- 학교급/지역별 통계 Python 이식
- 월별 검증 Python 이식
- JS ↔ Python 자동 회귀대조

### 3단계 — 정산·예산
- verified/paid 회기만 지급대상
- 코칭/수업협력/출장비 계산
- 지원단별 월 정산
- 원천징수 및 실수령액
- 월/연간 집행 및 예산잔액
- JS ↔ Python 정산 대조

### 4단계 — Excel/HWPX 출력
- `openpyxl` 기반 지급명세서 Excel
- `openpyxl` 기반 월별 집행내역 Excel
- HWPX 원본 템플릿 검증
- HWPX 내부 XML `{{KEY}}` 자리표시자 치환
- 지급명세서 HWPX API
- 월별 집행내역 HWPX API
- 화면에 HWPX 생성 버튼 자동 연결
- Python Excel 우선 사용 + 실패 시 기존 JS Excel fallback
- Python health에 HWPX 템플릿 준비 상태 표시

## HWPX 템플릿
`backend/templates/` 아래에 실제 기관 원본 서식을 둔다.

- `pay_slip.hwpx`
- `execution_report.hwpx`
- `manager_book.hwpx`
- `operation_report.hwpx`

현재 공통 HWPX 엔진은 기관명, 월, 확인자, 지원단명, 회수, 금액, 세전/공제/실수령액 등의 고정 셀 치환을 지원한다. 상세내역 행 반복은 실제 원본 HWPX 구조를 확보한 뒤 서식별 table mapper로 구현한다.

## 다음 단계
1. 실제 지급명세서/집행내역/관리부 HWPX 원본 연결
2. 표 행 반복 매퍼 구현
3. 통계·검증·정산 PASS 데이터셋 확대
4. 통과 영역을 Python 단일 계산원본으로 승격
5. SQLite 실제 데이터 이전 및 백업/복원
6. PyInstaller 포터블 배포
