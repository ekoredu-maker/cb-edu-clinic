# V13 Hybrid Migration

## 목표
기존 V12.3.x의 사용자 화면과 업무 흐름을 유지하면서 계산·검증·통계·Excel·HWPX·저장을 Python 엔진으로 단계적으로 이전한다.

## 원칙
1. 기존 GitHub/PWA 버전은 유지한다.
2. Windows 업무용 버전은 HTML/CSS/JavaScript UI + Python + SQLite 구조로 만든다.
3. 계산 결과의 단일 원본(single source of truth)은 Python으로 이전한다.
4. 브라우저 IndexedDB 데이터는 초기 마이그레이션 도구를 통해 SQLite로 이관한다.
5. HWPX는 실제 기관 서식을 템플릿으로 사용하고 Python이 데이터만 주입한다.
6. 각 단계는 V12와 결과값을 대조하는 회귀 테스트를 통과한 뒤 다음 단계로 진행한다.

## 1차 이전 대상
- 통계 집계
- 실적 검증
- 월별 정산/예산 계산
- Excel 입출력
- HWPX 보고서 생성

## 후속 이전 대상
- 자동매칭
- 학생/지원단 CRUD 저장
- 전체 SQLite 전환
- pywebview Windows Shell

## 유지 대상
- 대시보드 UI
- 지원단/학생/매칭/실적/연수/통계/서식/설정 화면
- 검색/필터/모달/차트 렌더링
- GitHub Pages/PWA 배포본

## V13 단계
### Phase 1
Python API 골격 + SQLite + health check

### Phase 2
statistics / verification 이중 실행(JS/Python) 및 결과 비교

### Phase 3
settlement / budget 계산 Python 단일화

### Phase 4
Excel 서비스 및 HWPX 템플릿 엔진

### Phase 5
IndexedDB → SQLite 마이그레이션

### Phase 6
pywebview 포터블 Windows 패키징

### Phase 7
대량 테스트 및 실제 서식 회귀 검증
