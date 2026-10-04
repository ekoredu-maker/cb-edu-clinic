# V13 문서 서식 원칙

V13은 기존 HTML 프로그램에 이미 구현된 서식을 **서식의 1차 기준(source of truth)** 으로 사용합니다.

Python 엔진의 `services/format_contract.py`가 HTML 서식의 제목, 메타정보, 열 순서, 열너비, 합계영역, 월간 관리부 배치 같은 구조를 명시적으로 옮겨 받아 Excel/HWPX 출력의 공통 계약으로 사용합니다.

현재 HTML 기준 계약이 확정된 서식:
- `pay_slip` : 활동비 지급 명세서 (`legacy-js/10-ext-v99.js`)
- `execution_report` : 월별 활동비 집행내역서 (`legacy-js/10-ext-v99.js`)
- `manager_book` : 학습지원단 관리부 (`legacy-js/08-forms.js`)
- `staff_appoint` : 위촉장 (`legacy-js/12-patches.js`)
- `appoint_confirm` : 위촉 확인서 (`legacy-js/12-patches.js`)
- `career_confirm` : 경력 확인서 (`legacy-js/12-patches.js`)
- `resign` : 해촉 신청서 (`legacy-js/12-patches.js`)
- `plan_doc` : 학습지도계획서 (`legacy-js/08-forms.js`)
- `timetable` : 주간 시간표 (`legacy-js/08-forms.js`)

## 출력 우선순위
1. 실제 HWPX 원본 템플릿이 존재하면 원본 서식을 보존하는 템플릿 매퍼 사용
2. 원본 템플릿이 없고 HTML 서식계약이 확정된 경우 `document_model.py` → `hwpx_native_service.py` 네이티브 HWPX 생성
3. 아직 HTML 서식계약도 확정되지 않은 서식은 임의 생성하지 않고 원본 서식을 요구

현재 네이티브 HWPX 대상:
- 지급명세서
- 월별 집행내역서
- 학습지원단 관리부
- 위촉장
- 위촉확인서
- 경력확인서
- 해촉신청서
- 학습지도계획서
- 주간시간표

## HTML과 Python 이름표시 규칙
문서출력은 `legacy-js/00-core.js`의 `maskName`과 동일한 규칙을 사용합니다.
- `full`: 실명
- `ooo`: `OOO`
- `partial`: 성 첫 글자 + `OO`
- `alias`: 학생 별칭, 없으면 학생 ID 끝 4자리

## HWPX 네이티브 구조검사
자동시험에서는 다음을 검증합니다.
- `mimetype`가 ZIP 첫 엔트리이며 무압축인지
- mimetype 값이 `application/hwp+zip`인지
- `META-INF/container.xml`
- `Contents/content.hpf`
- `Contents/header.xml`
- `Contents/section0.xml`
- `Contents/settings.xml`
- `version.xml`
- section에 구역설정(`secPr`)과 표가 존재하는지
- 서식계약과 표 열 수/행 수가 일치하는지
- 시간표가 월~일 8열, 08:00~22:00 30분 단위인지
- 가로서식의 페이지 방향이 반영되는지

이 구조검사는 자동화되어 있습니다. 다만 **실제 한컴오피스에서 열기·편집·인쇄까지의 렌더링 호환성은 별도 Windows 로컬 UAT로 최종 확정합니다.**

## 한컴오피스 UAT 샘플
`backend/hwpx_uat_pack.py`가 실제 개인정보를 사용하지 않고 위 9종의 합성 HWPX를 생성합니다.

GitHub Actions에서는 `V13_HWPX_Hancom_UAT_Samples` 아티팩트로 업로드하며 다음을 수기 확인합니다.
- 경고 없이 열리는지
- 한글/숫자가 깨지지 않는지
- 셀 너비와 줄바꿈이 적절한지
- 페이지 방향과 쪽 나눔이 자연스러운지
- 인쇄 미리보기가 업무서식으로 사용 가능한지
- 저장 후 다시 열어도 문서가 유지되는지

## 실제 HWPX 템플릿을 추가할 경우
권장 파일명:
- `pay_slip.hwpx`
- `execution_report.hwpx`
- `manager_book.hwpx`
- `operation_report.hwpx`

템플릿이 존재하면 네이티브 생성보다 자동으로 우선합니다.

## 자리표시자 방식
기존 템플릿을 사용하는 경우 `{{KEY}}` 형식으로 고정 셀 값을 치환할 수 있습니다.

공통 예시:
- `{{YM}}`
- `{{ORG}}`
- `{{CONFIRMER}}`
- `{{STAFF_NAME}}`
- `{{COACH_COUNT}}`
- `{{COACH_AMOUNT}}`
- `{{CLASS_COUNT}}`
- `{{CLASS_AMOUNT}}`
- `{{TRAVEL_COUNT}}`
- `{{TRAVEL_AMOUNT}}`
- `{{GROSS}}`
- `{{TAX}}`
- `{{NET}}`

문서렌더러는 업무금액을 다시 계산하지 않습니다. 통계·검증·정산 Python 도메인 엔진의 계산결과를 정규화 문서모델에 넣어 Excel과 HWPX가 같은 값을 사용합니다.
