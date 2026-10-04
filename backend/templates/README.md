# V13 문서 서식 원칙

V13은 기존 HTML 프로그램에 이미 구현된 서식을 **서식의 1차 기준(source of truth)** 으로 사용합니다.

Python 엔진의 `services/format_contract.py`가 HTML 서식의 제목, 메타정보, 열 순서, 열너비, 합계영역, 월간 관리부 배치 같은 구조를 명시적으로 옮겨 받아 Excel/HWPX 출력의 공통 계약으로 사용합니다.

현재 HTML 기준 계약이 확정된 서식:
- `pay_slip` : 활동비 지급 명세서 (`legacy-js/10-ext-v99.js`)
- `execution_report` : 월별 활동비 집행내역서 (`legacy-js/10-ext-v99.js`)
- `manager_book` : 학습지원단 관리부 (`legacy-js/08-forms.js`)

즉 HTML과 다른 새 서식을 Python에서 임의로 만들지 않습니다.

## HWPX 템플릿

실제 HWPX 원본을 확보한 경우에는 아래 파일명을 권장합니다.
- `pay_slip.hwpx`
- `execution_report.hwpx`
- `manager_book.hwpx`
- `operation_report.hwpx`

HWPX 원본이 연결되면 `format_contract.py`의 구조와 Python 계산결과를 기준으로 값을 주입하고, 상세내역 표는 서식별 table mapper가 행을 반복합니다.

## 자리표시자

HWPX 원본 문서의 텍스트 위치에 `{{KEY}}` 형식으로 입력하면 공통 엔진이 값을 치환합니다.

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

현재 공통 HWPX 엔진은 고정 셀 치환을 지원합니다. 다음 단계에서는 HTML 서식계약을 이용해 HWPX 표 행 반복 매퍼를 구현합니다.
