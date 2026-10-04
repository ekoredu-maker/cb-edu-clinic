# V13 Hybrid Migration

## 목표
기존 V12.3.x의 사용자 화면과 PWA 호환성을 유지하면서 계산·검증·정산·문서출력·저장을 Python 업무엔진으로 단계적으로 이전한다.

## 핵심 원칙
1. 기존 `main`은 안정판으로 유지한다.
2. `v13-hybrid-migration` 브랜치에서 단계적으로 이식한다.
3. Python 계산은 JS 결과와 회귀대조 후 원본으로 승격한다.
4. 문서출력은 기존 HTML 프로그램에 심어 둔 서식정보를 1차 기준으로 사용한다.
5. HTML·Excel·HWPX는 같은 서식계약과 정규화 문서모델을 공유한다.
6. 문서렌더러는 업무금액이나 회수를 다시 계산하지 않는다.
7. Windows 하이브리드는 고정 포트를 사용하지 않는다.
8. GitHub/PWA는 기존 호환성을 유지하고 Windows 포터블은 완전 오프라인을 목표로 한다.
9. 실제 학생·지원단 개인정보는 GitHub CI에 올리지 않는다.

## 완료 단계 요약

### 1~3단계 — 하이브리드 계산 골격
- FastAPI / SQLite / pywebview
- 통계·검증 Python 이식
- 정산·예산·원천징수 Python 이식
- JS ↔ Python 회귀대조

### 4단계 — 출력 골격
- openpyxl 지급명세서·집행내역 Excel
- HWPX 템플릿 자리표시자 치환 엔진
- Python 출력 우선 + JS fallback

### 5~6단계 — SQLite 이관·쓰기 이중화
- V12 객체를 보존하는 JSON 레코드 저장층
- 트랜잭션/rollback/중복 ID 검증/audit log
- Browser ↔ SQLite SHA-256 parity
- save/upsert/delete/saveAll 이중화

### 7단계 — 운영규모 대량 회귀시험
- 지원단 50명 / 학생 1,500명 / 매칭 1,500건 / 활동로그 9,000건 / 연수 24건
- 통계·검증·정산 자동검증
- SQLite round-trip 및 대량 수정/삭제 parity

### 8단계 — Python 계산원본 승격
- 회귀 PASS 시 Python을 통계·검증·정산 공식 계산원본으로 사용
- DIFF/Python 연결 실패 시 JS 보호모드

### 9단계 — SQLite 읽기원본 승격
- Browser ↔ SQLite 내용·순서 parity PASS 시 SQLite 읽기원본
- 오류 시 Browser(복구모드)
- `collection_order`로 명부 순서 보존
- Browser 기준 SQLite 복구

### 10단계 — Windows 포터블
- PyInstaller one-folder
- 사용자 PC Python 설치 불필요
- FastAPI same-origin + pywebview
- 동적 loopback 포트
- `portable.flag` 데이터 분리
- EXE self-test

### 11단계 — 완전 오프라인
- Chart.js / SheetJS 로컬 포함
- 웹폰트 외부 참조 제거
- CDN 0건 자동검사
- 로컬 vendor HTTP self-test

### 12단계 — 운영규모 UAT·백업복구
- 초기 이관 → 수정·추가·삭제 → 재로드 → JSON 백업 → 손상 감지·복구 → 새 DB 복원 → 정산·Excel 대조
- Operational UAT 7/7 PASS
- 실제 개인정보는 로컬 UAT만 허용

### 13단계 — HTML 내장서식의 공통 서식계약 승격
- `services/format_contract.py`
- 지급명세서 기준: `legacy-js/10-ext-v99.js`
- 월별 집행내역서 기준: `legacy-js/10-ext-v99.js`
- 학습지원단 관리부 기준: `legacy-js/08-forms.js`
- 제목·메타정보·열 순서·열너비·합계영역 계약화
- 관리부 1~16일 / 17~31일 2단 구성
- verified/paid 승인실적만 관리부 반영
- Python Excel을 HTML 서식과 동일 구조로 정렬
- 관리부 Python Excel 추가
- `/api/formats`, `/api/health.formatContracts`

### 14단계 — HTML 서식계약 기반 네이티브 HWPX 구조 생성
- `services/document_model.py` 추가
- 지급명세서·집행내역서·관리부를 정규화 문서모델로 통합
- `services/hwpx_native_service.py` 추가
- 실제 HWPX 템플릿이 있으면 기존 템플릿 매퍼 우선
- 템플릿이 없으면 HTML 서식계약 기반 네이티브 HWPX 생성
- HWPX 필수 ZIP/XML 파트 자동검사
- `mimetype` 첫 엔트리·무압축 및 `application/hwp+zip` 검증
- 지급명세서 8열 / 집행내역 10열 / 관리부 13열 구조검증

> 14단계 자동검증은 HWPX 패키지 및 OWPML 구조검증이다. 실제 한컴오피스의 열기·편집·인쇄 검증은 Windows 로컬 UAT에서 최종 확정한다.

### 15단계 — HTML 행정서식·시간표까지 서식계약/HWPX 확장
- HTML에 이미 구현된 서식을 다시 디자인하지 않고 그대로 계약화
- `legacy-js/12-patches.js` 기준: 위촉장, 위촉확인서, 경력확인서, 해촉신청서
- `legacy-js/08-forms.js` 기준: 학습지도계획서, 주간 시간표
- `format_contract.py` 등록서식 3종 → 9종 확대
- `document_model.py`에 6종 정규화 문서모델 추가
- HWPX 렌더러를 다중 표, 헤더 없는 행정표, 큰 작성란, 후속 본문/날인 문구, 가로문서까지 확장
- 위촉기간·발급기관·교육장 명칭·담당자·확인자 표시를 기존 HTML 규칙에 맞춤
- 경력확인서는 기존 위촉이력 + 현재 위촉기간을 결합하고 verified/paid 활동만 집계
- 주간시간표는 08:00~22:00, 30분 단위, 월~일 8열 구조를 사용
- 시간표 HWPX는 현재 개별 지원단·학생·학교 단위로 생성하며 `전체` 일괄출력은 별도 단계로 유지
- Windows에서 현재 행정서식 미리보기 → HWPX 생성, 시간표 → HWPX 생성 연결
- GitHub/PWA에는 Python 전용 HWPX 버튼을 노출하지 않음
- HTML `maskName`과 Python 문서출력 규칙을 일치시킴
  - `full`: 실명
  - `ooo`: OOO
  - `partial`: 성 첫 글자 + OO
  - `alias`: 별칭, 없으면 학생ID 끝 4자리
- 회귀시험에 행정서식 데이터, 경력집계, 마스킹, 시간표 8열·28행, HWPX 표 구조 검증 추가
- 개인정보 없는 합성데이터로 9종 HWPX 한컴 UAT 샘플 세트를 자동 생성
- CI 아티팩트 `V13_HWPX_Hancom_UAT_Samples` 업로드
- 15단계 코드에서 Python 회귀시험, Operational UAT, HWPX 샘플 9종 생성, Hybrid JS syntax 검사 PASS

## 문서출력 아키텍처

```text
기존 HTML/JS 서식정보
        ↓
format_contract.py
        ↓
document_model.py
   ↙              ↘
Excel             HWPX
(openpyxl)        (OWPML)
```

정산·통계·검증 엔진의 결과만 문서모델에 들어가며 Excel/HWPX에서 별도 재계산하지 않는다.

## 현재 서식계약
- `pay_slip` — 활동비 지급 명세서
- `execution_report` — 월별 활동비 집행내역서
- `manager_book` — 학습지원단 관리부
- `staff_appoint` — 위촉장
- `appoint_confirm` — 위촉 확인서
- `career_confirm` — 경력 확인서
- `resign` — 해촉 신청서
- `plan_doc` — 학습지도계획서
- `timetable` — 주간 시간표

## HWPX 출력 우선순위

```text
실제 HWPX 원본 존재
        ↓ YES
원본 보존 템플릿 매퍼

        NO
        ↓
HTML 서식계약 존재
        ↓ YES
네이티브 HWPX 렌더러

        NO
        ↓
임의 생성하지 않고 원본 서식 확보 필요
```

`operation_report`처럼 HTML/원본 서식구조를 아직 확정하지 않은 문서는 임의 생성하지 않는다.

## HWPX 구조검사 항목
- ZIP 패키지 여부
- `mimetype` 첫 엔트리 및 ZIP_STORED
- `META-INF/container.xml`
- `Contents/content.hpf`
- `Contents/header.xml`
- `Contents/section0.xml`
- `Contents/settings.xml`
- `version.xml`
- 구역설정 `secPr`
- 표 `rowCnt/colCnt`
- 셀 주소/크기
- 서식별 열 수/행 수
- 세로/가로 방향

## 한컴 UAT 샘플 세트
`backend/hwpx_uat_pack.py`는 실제 개인정보 없이 다음 9종을 생성한다.
1. 지급명세서
2. 월별 집행내역서
3. 학습지원단 관리부
4. 위촉장
5. 위촉확인서
6. 경력확인서
7. 해촉신청서
8. 학습지도계획서
9. 주간시간표

CI는 구조검증 완료 후 `V13_HWPX_Hancom_UAT_Samples` 아티팩트로 업로드한다. 이 세트는 한컴오피스에서 열기, 글꼴/줄바꿈, 셀폭, 페이지 방향, 쪽나눔, 인쇄 미리보기, 저장 후 재열기를 수기 확인하는 용도다.

## SQLite 운용 원칙
1. Browser 상태 안전 로드
2. SQLite 상태 확인
3. 내용·순서 parity
4. PASS 시 SQLite 읽기원본
5. DIFF/오류 시 Browser 복구모드
6. 운영자 확인 후 Browser 기준 SQLite 복구
7. 저장은 Browser + SQLite 이중화

## 포터블 배포 원칙
- 기본 one-folder
- 업데이트 시 `data/` 보존
- 핵심 기능 완전 오프라인
- 운영 PC 로컬 폴더 실행 권장

## 다음 단계
1. `V13_HWPX_Hancom_UAT_Samples`를 Windows PC에서 한컴오피스로 실제 열기
2. 9종 문서의 글꼴·셀폭·페이지 방향·쪽나눔·인쇄영역 확인
3. 한컴에서 정상 저장한 HWPX의 XML 구조와 네이티브 생성본 비교
4. 실제 렌더링 차이가 있는 셀 병합·행높이·여백·문단 정렬을 보정
5. `operation_report` 등 아직 계약화하지 않은 서식을 실제 HTML/원본 구조 확인 후 추가
