# V13 Hybrid Migration

## 목표
기존 V12.3.x의 사용자 화면과 PWA 호환성을 유지하면서 계산·검증·정산·문서출력·저장을 Python 업무엔진으로 단계적으로 이전한다.

## 원칙
1. 기존 `main`은 안정판으로 유지한다.
2. `v13-hybrid-migration` 브랜치에서 단계적으로 이식한다.
3. Python으로 이전한 계산은 즉시 교체하지 않고 기존 JS 결과와 회귀대조한다.
4. 통계·검증·정산이 일치한 뒤 Python을 단일 계산원본으로 승격한다.
5. 문서출력은 기존 HTML 프로그램에 심어 둔 서식정보를 1차 기준으로 사용하고, Excel/HWPX는 같은 서식계약을 공유한다.
6. Windows 하이브리드는 고정 포트를 사용하지 않고 실행 시 빈 포트를 자동 배정한다.
7. Python이 없는 GitHub/PWA 환경에서는 기존 기능을 계속 사용할 수 있어야 한다.
8. 데이터 저장소 전환은 브라우저 저장소 → SQLite 병행 → 검증 후 SQLite 원본 승격 순으로 진행한다.
9. 운영 규모 전환 전에는 Windows CI에서 대량 회귀시험을 통과해야 한다.
10. Windows 배포는 one-folder 포터블을 먼저 안정화하고, 데이터 폴더는 프로그램 업데이트와 분리해 보존한다.
11. Windows 배포물의 핵심 UI·차트·Excel 기능은 외부 CDN 없이 동작해야 한다.
12. 실제 학생·지원단 개인정보는 GitHub CI에 올리지 않으며 실제자료 UAT는 업무용 PC에서만 수행한다.

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

### 4단계 — Excel/HWPX 출력 골격
- `openpyxl` 기반 지급명세서 Excel
- `openpyxl` 기반 월별 집행내역 Excel
- HWPX 원본 템플릿 검증
- HWPX 내부 XML `{{KEY}}` 자리표시자 치환
- 지급명세서 HWPX API
- 월별 집행내역 HWPX API
- 화면에 HWPX 생성 버튼 자동 연결
- Python Excel 우선 사용 + 실패 시 기존 JS Excel fallback

### 5단계 — SQLite 안전 이관
- `records` JSON 레코드 저장층: `stf`, `stu`, `mat`, `trn`
- `state_singletons`: `cfg` 및 호환용 추가 상태 보존
- `migration_history`: 이관 일시·원본·방식·건수 기록
- `audit_log`: 상태 이관 감사기록
- WAL 모드 적용
- 전체 교체 시 트랜잭션/rollback
- 중복 ID/잘못된 구조 사전 검증
- V12 현재 상태 → SQLite 이관 API
- SQLite → JSON 재구성/백업 API

### 6단계 — 쓰기 이중화
- 최초 SQLite 이관 완료 후 이중화 활성화
- `save/upsert/delete/saveAll` 경로를 SQLite와 병행
- 직렬 쓰기 큐로 순서 보존
- Browser ↔ SQLite SHA-256 parity 비교
- audit log 기록

### 7단계 — 운영규모 대량 회귀시험
- 지원단 50명 / 학생 1,500명 / 매칭 1,500건 / 활동로그 9,000건 / 연수 24건
- 통계·검증·정산 예상값 자동 검증
- SQLite 3,074개 레코드 round-trip
- 대량 수정·삭제 후 parity 검증
- Windows CI 전체 회귀 PASS

### 8단계 — Python 계산원본 승격
- 통계·검증·정산 Python 결과를 공식 계산원본으로 승격
- 회귀 PASS일 때만 자동 승격
- DIFF/Python 연결 실패 시 JS 보호모드
- 저장 이벤트 시 Python 계산 캐시 무효화/재계산

### 9단계 — SQLite 읽기 원본 승격
- Browser ↔ SQLite 내용·순서 parity PASS 시 SQLite 읽기원본 사용
- 불일치/오류 시 Browser(복구모드)
- `collection_order`로 명부 순서 보존
- Browser 기준 SQLite 복구 기능

### 10단계 — Windows 포터블 배포
- PyInstaller one-folder
- 최종사용자 Python 설치 불필요
- FastAPI 같은 동적 loopback 포트에서 UI/API 제공
- pywebview 데스크톱 창
- `portable.flag` 모드에서 실행폴더 `data/` 사용
- CI 자동빌드 + EXE self-test

### 11단계 — 완전 오프라인 Windows 배포
- Chart.js / SheetJS 로컬 포함
- 외부 웹폰트 제거
- 외부 CDN 0건 자동검사
- `/api/health` 오프라인 상태 제공
- EXE가 로컬 vendor 자산을 실제 제공하는지 self-test

### 12단계 — 운영규모 자동 UAT/백업·복구
- 초기 이관 → 수정/추가/삭제 → 재로드 → JSON 백업 → 손상 감지/복구 → 새 DB 복원 → 정산·Excel 대조
- 운영규모 모의데이터 사용
- Operational UAT 7/7 PASS
- 실제 개인정보는 로컬 `UAT_CHECKLIST.md` 절차로만 검증

### 13단계 — HTML 내장서식의 공통 서식계약 승격
기존 HTML/JavaScript에 이미 구현되어 있던 문서 구조를 Python이 임의로 다시 디자인하지 않고 공통 서식계약으로 추출한다.

- `backend/services/format_contract.py` 추가
- 활동비 지급 명세서 기준: `legacy-js/10-ext-v99.js`
- 월별 활동비 집행내역서 기준: `legacy-js/10-ext-v99.js`
- 학습지원단 관리부 기준: `legacy-js/08-forms.js`
- 제목·메타정보·열 순서·열너비·합계영역을 계약화
- 관리부 1~16일 / 17~31일 2단 구성 계약화
- 관리부는 verified/paid 승인실적만 포함
- 기존 학생명 마스킹 설정을 Python 출력에도 반영
- Python 지급명세서/집행내역 Excel을 HTML 기준 구조와 맞춤
- Python 학습지원단 관리부 Excel 신규 구현
- Windows에서는 기존 관리부 Excel 버튼도 Python 우선 + JS fallback
- `GET /api/formats`로 현재 서식계약 확인 가능
- `/api/health`에 `formatContracts` 상태 제공
- 서식계약/Excel 구조 자동 테스트 추가
- 기존 운영규모 UAT도 변경된 HTML 기준 출력 구조에 맞춰 재검증
- 최종 Regression 및 Windows Portable Build PASS

## 문서출력 구조

앞으로 문서출력은 다음 흐름을 사용한다.

```text
HTML/JS에 정의된 서식정보
        ↓
format_contract.py
        ↓
정규화 문서모델
   ↙          ↘
Excel          HWPX
(openpyxl)     (OWPML renderer)
```

계산은 문서렌더러에서 수행하지 않는다. 통계·검증·정산 Python 도메인 엔진이 만든 결과만 문서모델에 넣는다. 따라서 HTML 화면, Excel, HWPX의 금액·회수·명부가 서로 다르게 계산되는 경로를 만들지 않는다.

## HWPX 방향

HWPX는 ZIP + OWPML XML 패키지다. 기존 템플릿이 있으면 그 구조를 보존하는 템플릿 매퍼를 사용하고, 템플릿이 없는 경우에는 HTML 서식계약을 바탕으로 정규화 문서모델에서 HWPX를 생성하는 네이티브 렌더러를 사용하도록 설계한다.

네이티브 렌더러는 최소한 다음 패키지 규칙을 지킨다.
- `mimetype` 첫 엔트리, 무압축, `application/hwp+zip`
- `META-INF/container.xml`
- `Contents/content.hpf`
- `Contents/header.xml`
- `Contents/section0.xml`
- `version.xml`
- 첫 문단의 페이지/구역 설정
- 표의 `rowCnt/colCnt`, 셀 주소/크기, header 참조 ID 정합성

실제 한컴오피스 열림 여부는 Windows 로컬 UAT에서 최종 확인한다.

## SQLite 전환 원칙
V12 객체 호환성 손실을 막기 위해 1차 SQLite 저장층은 JSON 레코드 방식으로 V12 객체를 그대로 보존한다. 이후 규칙이 확정된 도메인부터 점진 정규화한다.

현재 Windows 하이브리드 동작 순서:
1. Browser 상태 안전 로드
2. SQLite 상태 확인
3. Browser ↔ SQLite 내용·순서 parity 검사
4. PASS 시 SQLite 읽기원본 승격
5. DIFF/오류 시 Browser 복구모드
6. 운영자 확인 후 Browser 기준 SQLite 복구
7. 저장은 Browser + SQLite 이중화

## 포터블 배포 원칙
- 기본은 one-folder
- 프로그램 업데이트 시 `data/` 폴더 보존
- 핵심 UI·차트·Excel은 네트워크 없이 동작
- 실제 운영은 네트워크 공유폴더 직접실행보다 PC 로컬 폴더 실행 권장

## 다음 단계
1. HTML 서식계약을 받는 정규화 문서모델 완성
2. 지급명세서·집행내역서·관리부 HWPX 네이티브 렌더러 구현
3. HWPX ZIP/XML 구조 자동검증
4. Windows 한컴오피스에서 실제 열림·인쇄 UAT
5. 이후 HTML에 남아 있는 다른 서식도 같은 계약 방식으로 순차 이전
