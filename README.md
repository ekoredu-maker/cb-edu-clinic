# 학습클리닉 통합관리 V12

V11.6 기반의 1차 리팩터링 구조 정리판입니다.

## 이번 단계
- 13개 JS 로드 체인을 `assets/js/app.js` 1개 번들로 통합
- `saveAll()`을 전체 clear/bulk write 방식에서 차등 동기화 방식으로 완화
- `buildIndex()`에 dirty flag + signature 캐시 추가
- `renderPivots()` 시작 시 `buildIndex()` 강제 호출
- 배포는 `assets/js/app.js`만 사용, 이전 파일은 `legacy-js/`로 이동

## 아직 남아 있는 것
- 내부 로직 자체는 V11 계열을 많이 계승하므로 전역 상태와 후반 패치 스타일의 흔적이 일부 남아 있음
- 완전한 상태관리 스토어/이벤트 기반 렌더링은 V12.1 이상 단계 권장
