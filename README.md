# 학습클리닉 통합관리 V11

V10.7 기준 싱글파일을 바탕으로 HTML/CSS/JS를 분리한 GitHub Pages 배포용 세트입니다.

## 구조
- `index.html`
- `assets/css/app.css`
- `assets/js/*.js`
- `manifest.webmanifest`
- `sw.js`
- `icons/*`

## 특징
- V10.7 기능을 최대한 유지한 상태에서 구조를 분리
- GitHub Pages 업로드용
- 동일 기준의 싱글파일판도 별도 제공

## 배포
1. 저장소 루트에 전체 파일 업로드
2. GitHub Pages를 `main` / `(root)`로 지정
3. 첫 접속 후 새로고침하여 Service Worker 캐시 확인

## 참고
이 버전은 **패치 누적 구조를 전부 재작성한 완전한 새 엔진은 아니고**,
기존 코어를 보존하면서 배포 구조를 분리한 V11 1차 정리판입니다.
