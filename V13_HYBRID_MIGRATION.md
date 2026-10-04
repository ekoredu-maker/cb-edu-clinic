# V13 Hybrid Migration

## 목표
기존 V12.3.x의 사용자 화면과 PWA 호환성을 유지하면서 계산·검증·정산·문서출력·저장을 Python 업무엔진으로 단계적으로 이전한다.

## 원칙
1. 기존 `main`은 안정판으로 유지한다.
2. `v13-hybrid-migration` 브랜치에서 단계적으로 이식한다.
3. Python으로 이전한 계산은 즉시 교체하지 않고 기존 JS 결과와 회귀대조한다.
4. 통계·검증·정산이 일치한 뒤 Python을 단일 계산원본으로 승격한다.
5. 문서출력은 실제 기관 HWPX 원본 템플릿을 보존하고 값만 주입하는 방식으로 구현한다.
6. Windows 하이브리드는 고정 포트를 사용하지 않고 실행 시 빈 포트를 자동 배정한다.
7. Python이 없는 GitHub/PWA 환경에서는 기존 기능을 계속 사용할 수 있어야 한다.
8. 데이터 저장소 전환은 브라우저 저장소 → SQLite 병행 → 검증 후 SQLite 원본 승격 순으로 진행한다.

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

### 5단계 — SQLite 안전 이관
- `records` JSON 레코드 저장층: `stf`, `stu`, `mat`, `trn`
- `state_singletons`: `cfg` 및 호환용 추가 상태 보존
- `migration_history`: 이관 일시·원본·방식·건수 기록
- `audit_log`: 상태 이관 감사기록
- WAL 모드 적용
- 전체 교체 시 `BEGIN IMMEDIATE` 트랜잭션 사용
- 중복 ID/잘못된 데이터 구조 사전 검증
- 실패 시 전체 rollback
- V12 현재 상태 → SQLite 이관 API
- SQLite → JSON 재구성 API
- SQLite 백업 JSON 다운로드 API
- 설정 화면에 이관/상태확인/백업 버튼 제공
- 현재 단계에서는 브라우저 저장소를 원본으로 유지하고 SQLite는 병행 저장소로 운용

## HWPX 템플릿
`backend/templates/` 아래에 실제 기관 원본 서식을 둔다.

- `pay_slip.hwpx`
- `execution_report.hwpx`
- `manager_book.hwpx`
- `operation_report.hwpx`

현재 공통 HWPX 엔진은 기관명, 월, 확인자, 지원단명, 회수, 금액, 세전/공제/실수령액 등의 고정 셀 치환을 지원한다. 상세내역 행 반복은 실제 원본 HWPX 구조를 확보한 뒤 서식별 table mapper로 구현한다.

## SQLite 전환 원칙
V12의 현재 구조를 처음부터 완전 정규화하면 호환성 손실 위험이 크므로, 1차 SQLite 저장층은 JSON 레코드 방식으로 V12 객체를 그대로 보존한다. 이후 도메인 규칙이 확정된 학생·지원단·매칭·실적부터 관계형 테이블로 점진 정규화한다.

전환 순서:
1. 기존 브라우저 상태를 SQLite에 복제
2. 레코드 수와 JSON round-trip 검증
3. 일정 기간 병행 운용
4. 쓰기 이중화(브라우저 + SQLite)
5. SQLite를 읽기 원본으로 전환
6. 브라우저 저장소를 호환/비상 복구 용도로 축소

## 다음 단계
1. SQLite 쓰기 이중화 및 자동 동기화
2. 실데이터 대량 round-trip/회귀검증
3. 통과 영역을 Python 단일 계산원본으로 승격
4. 실제 지급명세서/집행내역/관리부 HWPX 원본 연결 및 표 행 반복 매퍼 구현
5. PyInstaller 포터블 배포
