# 학습클리닉 통합관리 V13 하이브리드

충청북도학습클리닉용 업무지원프로그램입니다.

## V13 하이브리드 업그레이드

`v13-hybrid-migration` 브랜치에서는 기존 V12 UI/PWA 흐름을 유지하면서 Python 업무 엔진, SQLite 저장소, HWPX/Excel 출력, pywebview Windows 포터블 실행 구조를 단계적으로 도입하고 있습니다.

현재 Windows 포터블 배포물은 다음을 포함합니다.

- Python/FastAPI 업무 엔진 내장
- SQLite 업무데이터 저장 및 브라우저 저장소와 안전 대조
- 통계·검증·정산 Python 계산원본
- PyInstaller one-folder 실행 파일
- 고정 포트 없는 pywebview 데스크톱 실행
- Chart.js 4.4.0 / SheetJS 0.18.5 로컬 포함
- 외부 웹폰트 제거 및 Windows 시스템 글꼴 사용
- 인터넷 연결 없이 핵심 UI·차트·Excel 기능 사용 가능
- 생성 EXE self-test 및 Windows CI 자동검증

배포 파일은 GitHub Actions의 `V13 Portable Build` 워크플로에서 `학습클리닉_V13_Windows_Portable_Offline` 아티팩트로 생성됩니다.

자세한 전환 구조와 검증 기준은 [`V13_HYBRID_MIGRATION.md`](V13_HYBRID_MIGRATION.md)를 참고하세요.
