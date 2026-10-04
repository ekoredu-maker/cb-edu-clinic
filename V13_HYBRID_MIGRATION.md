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
9. 운영 규모 전환 전에는 Windows CI에서 대량 회귀시험을 통과해야 한다.
10. Windows 배포는 one-folder 포터블을 먼저 안정화하고, 데이터 폴더는 프로그램 업데이트와 분리해 보존한다.

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

### 6단계 — 쓰기 이중화
- 최초 SQLite 이관이 완료된 경우에만 이중화 자동 활성화
- 개별 `save()` 성공 후 SQLite `upsert`
- 개별 `removeItem()` 성공 후 SQLite `delete`
- `saveAll()` 성공 후 전체 상태를 SQLite로 재동기화
- V12 전역 `save/removeItem/saveAll` 호출 경로와 `ClinicApp` 호출 경로 모두 래핑
- SQLite 쓰기는 직렬 큐로 처리하여 저장 순서 보존
- SQLite 쓰기 실패가 기존 IndexedDB 저장 성공을 되돌리지는 않음
- 브라우저 상태와 SQLite 레코드별 SHA-256 비교 API 제공
- 저장/삭제/설정 변경에 대한 SQLite audit log 기록

### 7단계 — 운영규모 대량 회귀시험
- 결정적 더미데이터 생성기 추가
- 지원단 50명 / 학생 1,500명 / 매칭 1,500건 / 활동로그 9,000건 / 연수 24건
- 통계·검증·정산 예상값 자동 검증
- SQLite 3,074개 레코드 import/export round-trip 검증
- 대량 수정·삭제 후 parity PASS 검증
- GitHub Actions Windows runner에서 전체 회귀 PASS 확인

### 8단계 — Python 계산원본 승격
- Python 계산결과 캐시/공식 원본 계층 추가
- 통계·검증·정산 Python 결과를 하이브리드 공식 계산원본으로 승격
- 시작 회귀검증 PASS일 때만 자동 승격
- 회귀 DIFF 또는 Python 연결 실패 시 JS 보호모드 유지
- 통계는 Python 피벗을 화면 렌더링 기준값으로 사용
- 검증 화면은 Python 월별 검증 결과로 직접 렌더링
- 정산은 Python 결과를 기존 V12 인터페이스 형태로 호환
- 데이터 저장 이벤트 발생 시 Python 계산 캐시 자동 무효화/재계산

### 9단계 — SQLite 읽기 원본 승격
- 시작 시 브라우저 상태와 SQLite를 먼저 parity 비교
- 레코드 내용뿐 아니라 `stf/stu/mat/trn` 배열 순서까지 일치해야 승격
- 정상일 때 SQLite 상태를 기존 `db` 객체에 in-place 적용해 기존 UI 참조 보존
- 헤더에 `데이터원본 SQLite` 표시
- 불일치, SQLite 오류, export 실패 시 브라우저 상태를 그대로 유지하고 `Browser(복구모드)` 표시
- 브라우저 fallback 중에는 자동 덮어쓰기를 하지 않아 원본 손상 방지
- 설정 화면에 `Browser 기준 SQLite 복구` 버튼 제공
- `loadData()` 재호출 시에도 읽기 원본 선택 로직을 다시 적용
- SQLite 컬렉션 순서를 `collection_order` singleton으로 별도 보존
- 신규 레코드는 순서 끝에 추가하고 삭제 시 순서 목록에서도 제거
- 순서 불일치 검출 및 추가/삭제 순서 유지 계약 테스트 추가
- CI에 `read-source.js` JavaScript 문법 검사 추가

### 10단계 — Windows 포터블 배포
- PyInstaller one-folder 배포 구성
- 최종 사용자 PC에 Python 별도 설치 불필요
- pywebview 창에서 브라우저 주소창 없이 데스크톱 프로그램 형태로 실행
- `file://` 대신 FastAPI가 HTML/JS/CSS까지 같은 동적 포트에서 제공
- 고정 포트를 사용하지 않고 매 실행 시 빈 `127.0.0.1` 포트를 자동 할당
- 서버 준비 완료(`/api/health`)를 확인한 뒤 pywebview 창을 표시
- `runtime_paths.py`로 개발환경/PyInstaller `_MEIPASS`/실행파일 폴더 경로를 통합 관리
- `portable.flag`가 있으면 SQLite·생성문서를 실행 폴더의 `data/` 아래에 저장
- 일반 설치형 모드에서는 `%LOCALAPPDATA%/CB-Edu-Clinic-V13` 사용 가능
- 프로그램 업데이트 시 `data/` 폴더만 보존하면 업무데이터 유지
- `packaging/clinic_v13.spec` 및 `packaging/build_portable.ps1` 추가
- GitHub Actions `V13 Portable Build`에서 Windows 자동 빌드
- 빌드 전 Python 전체 회귀시험과 하이브리드 JavaScript 문법검사 수행
- 빌드 후 EXE/프론트엔드/portable.flag 구조 검사
- 생성된 EXE를 `--self-test`로 직접 실행해 내부 FastAPI health, 패키지된 index.html, SQLite 생성까지 검증
- 검증 통과 후 `학습클리닉_V13_Windows_Portable` 아티팩트 자동 업로드
- 2026-10-04 Windows CI에서 회귀 17건, JS 문법검사, PyInstaller build, EXE self-test, 아티팩트 업로드 전체 PASS

## HWPX 템플릿
`backend/templates/` 아래에 실제 기관 원본 서식을 둔다.

- `pay_slip.hwpx`
- `execution_report.hwpx`
- `manager_book.hwpx`
- `operation_report.hwpx`

현재 공통 HWPX 엔진은 기관명, 월, 확인자, 지원단명, 회수, 금액, 세전/공제/실수령액 등의 고정 셀 치환을 지원한다. 상세내역 행 반복은 실제 원본 HWPX 구조를 확보한 뒤 서식별 table mapper로 구현한다.

## SQLite 전환 원칙
V12의 현재 구조를 처음부터 완전 정규화하면 호환성 손실 위험이 크므로, 1차 SQLite 저장층은 JSON 레코드 방식으로 V12 객체를 그대로 보존한다. 이후 도메인 규칙이 확정된 학생·지원단·매칭·실적부터 관계형 테이블로 점진 정규화한다.

현재 Windows 하이브리드 동작 순서:
1. IndexedDB/브라우저 상태를 먼저 안전하게 로드
2. SQLite 상태 존재 여부 확인
3. 브라우저 ↔ SQLite 내용·순서 parity 검사
4. PASS이면 SQLite를 읽기 원본으로 승격
5. DIFF/오류이면 브라우저 상태를 유지하고 복구모드 진입
6. 운영자가 확인 후 Browser 기준 SQLite 복구 가능
7. 저장은 계속 브라우저 + SQLite 이중화

## 포터블 배포 구조
기본 배포는 one-folder 방식이다.

```text
학습클리닉_V13/
├─ 학습클리닉_V13.exe
├─ portable.flag
├─ 사용안내.txt
├─ data/
│  ├─ clinic_v13.db
│  └─ generated/
└─ _internal/
   ├─ index.html
   ├─ assets/
   ├─ icons/
   └─ Python 및 프로그램 런타임
```

업데이트 시에는 새 프로그램 폴더를 배포하되 기존 `data/`를 반드시 보존한다. 운영 PC에서는 네트워크 공유폴더에서 직접 실행하는 것보다 로컬 폴더에 복사해 실행하는 방식을 권장한다.

## 현재 제한 및 다음 단계
1. 실제 지급명세서/집행내역/관리부 HWPX 원본 연결 및 표 행 반복 매퍼 구현
2. 실제 운영 데이터로 최종 UAT 및 백업·복구 시나리오 검증
3. 현재 `index.html`의 일부 외부 CDN 자산(Chart.js, SheetJS, 웹폰트)을 로컬 자산으로 전환하거나 Python 기능으로 대체해 완전 오프라인 배포 보강
4. one-folder 안정화 후 필요 시 one-file 배포를 별도 검토
