# MusicQuiz

중학교 음악 이론을 빠르게 복습할 수 있는 정적 웹 퀴즈 앱입니다. 서버 API나 데이터베이스 없이 브라우저에서 실행되며, 학습 통계는 `localStorage`의 `mqz` 키에 저장됩니다.

## 주요 특징

- 7개 영역, 140문항 음악 이론 퀴즈
- 모바일/데스크톱 반응형 UI
- SVG 기반 음표/쉼표 표시로 운영체제별 음악 글리프 깨짐 최소화
- 안전한 DOM 렌더링: 문제/선택지/복습 텍스트는 `textContent` 기반으로 표시
- Fisher-Yates 셔플과 세션 최고 연속 정답 추적
- Railway 배포용 Caddy 설정 포함

## 로컬 실행

정적 파일이므로 브라우저에서 `index.html`을 직접 열어도 됩니다. 실제 배포와 유사하게 확인하려면 로컬 서버를 사용하세요.

```powershell
py -m http.server 4173
```

접속 주소: <http://localhost:4173>

## 정적 검증

Node.js가 설치되어 있다면 다음 테스트를 실행합니다.

```powershell
node --test tests/musicquiz.static.test.mjs
```

검증 항목은 문항 데이터 구조, 정답 인덱스, 안전 렌더링 규칙, 셔플 구현, streak 추적, Railway 배포 파일 존재 여부입니다.

## Railway 배포

이 프로젝트는 Caddy 기반 Docker 배포를 사용합니다.

1. GitHub 저장소를 Railway 프로젝트에 연결합니다.
2. Railway가 루트의 `Dockerfile`을 감지해 Caddy 이미지를 빌드합니다.
3. Caddy는 Railway가 주입하는 `$PORT`에서 `/srv/index.html`을 제공합니다.
4. 배포 후 public URL에서 퀴즈 1회를 끝까지 풀어 점수, 복습, 새로고침 후 통계 유지 여부를 확인합니다.

## 프로덕션 QA 체크리스트

- [ ] 홈에서 7개 학습 영역이 모두 표시된다.
- [ ] 선택지에 `<`, `>`, `♯`, `♭` 같은 기호가 깨지지 않는다.
- [ ] 정답/오답 피드백이 색상뿐 아니라 텍스트/기호로 구분된다.
- [ ] 키보드 Tab 이동과 Enter/Space 선택이 가능하다.
- [ ] 모바일 폭에서 카드와 버튼이 겹치지 않는다.
- [ ] 결과 화면의 점수, 오답 복습, 최고 연속 정답이 맞다.

## 저작권

© 2026 Hyungmin Yoo. All rights reserved.
