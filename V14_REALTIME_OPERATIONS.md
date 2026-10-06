# V14 실시간 학습지원단 운영 PWA 설계

## 1. 방향
V14는 기존 V13 하이브리드 프로그램을 폐기하지 않고, Supabase 기반 실시간 운영 계층을 추가한다.

- 하나의 홈페이지/PWA를 지원단·학습상담사·행정·장학이 함께 사용
- 로그인 사용자의 역할과 권한에 따라 메뉴/대시보드/조회범위만 달라짐
- 계획시간표와 실제 활동실적은 분리
- 실제 시작/종료는 서버시각으로 기록
- 위치는 시작/종료 시점에만 수집하며 상시 추적하지 않음
- 활동시간 검증은 전수 수기확인이 아니라 자동검증 + 예외검토
- 실적은 실시간 통계/지급예정액에 반영
- 최종 지급은 별도 승인 상태를 거쳐 확정
- 기존 V13 통계·정산·HWPX 로직은 가능한 한 재사용

## 2. 사용자 역할
동일한 앱에서 다음 역할을 사용한다.

- supporter: 학습지원단
- counselor: 학습상담사
- admin: 행정/정산 담당
- supervisor: 장학/총괄

profiles.roles 배열로 복수 역할도 허용한다.

## 3. 공통 화면
모든 사용자는 같은 index.html을 사용한다.

### 지원단
- 모바일 신분증
- 오늘 수업
- 주간 시간표
- 담당 학생
- 수업 시작/종료
- 지도내용
- 상담/협의
- 시간표·매칭 변경요청
- 공지/푸시

### 학습상담사
- 실시간 수업현황
- 자동검증 예외목록
- 미종료/위치확인 필요 수업
- 학생 상담/협의
- 변경요청 처리

### 행정
- 월별 실적
- 자동검증/승인 현황
- 지급예정액
- 지급확정액
- 지급처리 상태
- 출력용 데이터

### 장학/총괄
- 전체 운영통계
- 학교/학생/지원단별 현황
- 예외/위험 신호
- 공지 발송
- 사업 집행 현황

## 4. 활동확인 원칙
수업 시작/종료는 RPC를 통해서만 기록한다.

1. 로그인 사용자 확인
2. 계획시간표/매칭 확인
3. DB 서버의 now()로 시작/종료시각 기록
4. 시작/종료 GPS와 정확도 저장
5. 학교 기준 반경과 거리 계산
6. 계획시간 대비 실제시간 검증
7. 자동검증 성공 -> auto_verified
8. 이상값 -> review_required
9. 사람은 review_required만 검토

즉, 학습상담사는 정상 활동을 일일이 확인하지 않는다.

## 5. 승인·정산 상태
활동 검증과 지급 승인을 분리한다.

- verification_state
  - pending
  - auto_verified
  - review_required
  - confirmed
  - rejected

- settlement_state
  - pending
  - approved
  - paid

실시간 대시보드에서는 auto_verified까지 지급예정액으로 볼 수 있고,
실제 지급 확정에는 approved/paid 상태만 사용한다.

## 6. 기존 V13 연결키
Supabase와 V13의 원본 ID를 유지한다.

- profiles.legacy_staff_id -> db.stf[].id
- students.legacy_student_id -> db.stu[].id
- assignments.legacy_matching_id -> db.mat[].id

클라우드의 완료 수업은 V13의 mat.logs로 투영한다.

예시:

```json
{
  "id": "session-uuid",
  "date": "2026-10-06",
  "d": "2026-10-06",
  "s": "14:03",
  "e": "14:54",
  "time": "14:03~14:54",
  "minutes": 51,
  "topic": "분수의 덧셈과 통분",
  "content": "통분 과정 반복 지도",
  "place": "○○초",
  "kind": "coach",
  "status": "verified"
}
```

중요: 기존 코드에서 검증은 log.d, 정산/관리부는 log.date를 참조하는 부분이 있으므로
투영 시 date와 d를 모두 기록한다.

상태 변환:
- settlement_state=paid -> status=paid
- settlement_state=approved -> status=verified
- 그 외 -> status=conducted

## 7. 개인정보 원칙
- GPS는 시작/종료 시점만 수집
- 상시 위치추적 금지
- 위치 원본과 거리/판정값을 분리
- 학생 진단정보 전체를 모바일 클라우드에 복제하지 않음
- PWA에는 업무상 필요한 최소 학생정보만 제공
- 상담기록은 일반 지도기록보다 더 강한 접근권한 적용
- 신분증 이미지는 기본적으로 장기보관하지 않고 확인상태만 저장
- 모든 수정/승인/상태변경은 audit_logs에 남김

## 8. 구현 단계
### V14.0
- 공통 PWA 골격
- Supabase Auth
- 권한별 메뉴
- 오늘 수업/시간표
- 시작/종료 RPC
- 위치 검증
- 지도메모
- 공지

### V14.1
- 상담/협의
- 매칭/시간표 변경요청
- 실시간 예외검토
- 역할별 대시보드

### V14.2
- 지급예정/승인/지급
- 기존 V13 mat.logs 투영 어댑터
- Python 통계/정산/HWPX 연계

### V14.3
- Web Push
- 오프라인 큐
- 운영 UAT
