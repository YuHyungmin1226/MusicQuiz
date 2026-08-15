# MusicQuiz

중학교 음악 이론을 빠르게 복습할 수 있는 정적 웹 퀴즈 앱입니다. 서버 API나 데이터베이스 없이 브라우저에서 실행되며, 학습 통계는 `localStorage`의 `mqz` 키에 저장됩니다.

## 주요 특징

- 7개 영역, 140문항 음악 이론 퀴즈
- 모바일/데스크톱 반응형 UI
- 의존성 없는 SVG 오선보 엔진: 높은음자리표, 음높이·덧줄, 음표·쉼표·빔·붙임줄·이음줄, 조표·박자표·도돌이표를 실제 보표 위치로 표시
- 문제와 선택지에 악보를 함께 제공하며 선택지 셔플·정답 판정·결과 복습에서도 텍스트와 악보를 같은 쌍으로 유지
- 안전한 DOM 렌더링: 문제/선택지/복습 텍스트는 `textContent` 기반으로 표시
- Fisher-Yates 셔플과 세션 최고 연속 정답 추적
- 일반 10문항 퀴즈만 누적 통계와 영역 성취도에 반영하고, 같은 문제·오답 재도전은 통계에 반영하지 않는 연습 모드로 제공
- Railway 배포용 Caddy 설정 포함

## 로컬 실행

정적 파일이므로 브라우저에서 `index.html`을 직접 열어도 됩니다. 실제 배포와 유사하게 확인하려면 로컬 서버를 사용하세요.

```powershell
py -m http.server 4173
```

접속 주소: <http://localhost:4173>

## 테스트

정적·데이터·이론 검증은 Node.js를 지원하며, Bun으로도 같은 파일을 실행할 수 있습니다.

```bash
node --test tests/musicquiz.static.test.mjs
node tests/questions_integrity_check.mjs
node tests/theory_integrity_check.mjs

# Bun 대안
bun test tests/musicquiz.static.test.mjs
bun tests/questions_integrity_check.mjs
bun tests/theory_integrity_check.mjs
```

브라우저 검증은 선택 사항이며 시스템에 설치된 Google Chrome을 사용합니다. 별도 터미널에서 Windows는 `py -m http.server 4173`, macOS/Linux는 아래 명령으로 서버를 시작합니다.

```bash
python3 -m http.server 4173 --bind 127.0.0.1
```

저장소에 manifest나 lockfile을 만들지 않고, 정확히 검증된 Playwright 버전만 임시로 가져와 다른 터미널에서 실행합니다.

```bash
bunx --bun playwright@1.62.1 test tests/musicquiz.browser.test.mjs --reporter=line --workers=1
```

정적 검증은 문항 데이터 구조, 정답 인덱스, 재귀적 오선보 스키마, 선택지 텍스트·악보 셔플 결합, 안전 렌더링 규칙, streak 추적, Railway 배포 파일 존재 여부를 확인합니다. 브라우저 검증은 오선·높은음자리표·덧줄·음높이 순서·조표 순서·박자표·빔·붙임줄·이음줄·화음, 선택지 및 결과 복습 악보, 360/768/1280 반응형 오버플로, 일반/연습 통계와 PDF 상태를 실제 Chrome에서 확인합니다.

## 학습 통계

영역에서 새로 시작한 일반 10문항 퀴즈만 `total`, `correct`, `maxStreak`, `catDone`에 반영됩니다. 결과 화면의 `같은 문제 다시`와 `오답만 다시 풀기`는 명시적인 연습 시도이며, 점수는 결과 화면에서 확인할 수 있지만 누적 학습 기록과 영역 성취도는 바꾸지 않습니다.

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
- [ ] 360px에서 한국어 구절이 부자연스럽게 갈라지거나 페이지가 가로로 넘치지 않는다.
- [ ] 피아노 건반이 가로 스크롤되고 키보드 Enter/Space로 연주된다.
- [ ] 결과 화면의 점수, 오답 복습, 최고 연속 정답이 맞다.
- [ ] 같은 문제·오답 재도전 뒤에도 누적 통계와 영역 성취도가 변하지 않는다.
- [ ] PDF 저장 성공·실패 상태가 표시되고 새 결과에서는 버튼·렌더링·상태가 초기화된다.

## 저작권

© 2026 Hyungmin Yoo. All rights reserved.
