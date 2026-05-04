# V11 정리 보고서

## 이번 단계의 목표
- V10.7 싱글파일 기준 동작 유지
- GitHub Pages용 세트 파일 분리
- 싱글파일판과 세트판 동시 제공
- 중복 삽입 혼란 없이 CSS/JS를 외부 파일로 정리

## 산출물
- 싱글파일: `학습클리닉통합관리_V11_싱글파일.html`
- 세트판: `jc-edu-clinic-v11-github/`

## 구조 분리
세트판의 JS는 아래 순서로 분리했습니다.
- `00-core.js`
- `01-dashboard.js`
- `02-supporters.js`
- `03-students.js`
- `04-matching.js`
- `05-training.js`
- `06-statistics.js`
- `07-validation.js`
- `08-forms.js`
- `09-admin.js`
- `10-ext-v99.js`
- `11-ext-v10.js`
- `12-patches.js`

## 한계
- 내부 로직 전체를 새로 재작성한 완전한 모듈 엔진은 아닙니다.
- 기존 전역 기반 코드의 실행 순서를 유지하도록 스크립트를 순차 분리한 방식입니다.
- Chart.js, XLSX, Pretendard는 기존처럼 CDN 참조를 유지합니다.

## 다음 단계
- V11.1: 전역 함수 재정의 체인 제거
- V11.2: import/export/검증/관리부를 도메인 모듈로 재작성
- V12: IndexedDB/렌더러/서식엔진 완전 분리
