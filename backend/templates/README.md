# V13 HWPX templates

이 폴더에는 실제 기관에서 사용하는 원본 HWPX 서식을 둡니다.

권장 파일명:
- `pay_slip.hwpx` : 활동비 지급 명세서
- `execution_report.hwpx` : 월별 센터 집행내역서
- `manager_book.hwpx` : 학습지원단 관리부
- `operation_report.hwpx` : 운영실적 보고서

## 자리표시자
HWPX 원본 문서의 텍스트 위치에 아래와 같이 `{{KEY}}` 형식으로 입력하면 Python 엔진이 서식을 훼손하지 않고 값을 치환합니다.

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

행 반복이 필요한 상세내역 표는 실제 HWPX 서식을 확보한 뒤 서식별 table mapper에서 처리합니다. 현재 공통 엔진은 제목/기관명/월/합계/금액 등 고정 셀 치환을 안전하게 지원합니다.
