# 블로그 원클릭 작성기

버튼 클릭(80%) + 핵심 정보 입력(20%)만으로 정형화된 블로그 포스팅을 생성하는 웹 앱.

## 실행
```bash
npm start                                   # 데모 모드 (더미 데이터)
ANTHROPIC_API_KEY=sk-... npm start          # 실제 Claude API 연동
```
→ http://localhost:3000 · `index.html`을 직접 열어도 데모 모드로 동작합니다.

## 구조
| 파일 | 역할 |
|---|---|
| `index.html` | Tailwind 반응형 UI (PC 2단 / 모바일 1단 + 하단 고정 버튼) |
| `js/prompt.js` | 옵션 정의 + 프롬프트 조립 (브라우저·Node 공용, 단일 출처) |
| `js/api.js` | `/api/health`로 모드 자동 감지 → 실 API 또는 Mock |
| `js/app.js` | 상태 관리, 칩 선택 피드백, 복사·다시 생성 |
| `server.js` | 무의존성 Node 서버: 정적 서빙 + 서버측 프롬프트 조립 + Claude 호출 |

환경변수: `ANTHROPIC_API_KEY`, `CLAUDE_MODEL`(기본 `claude-sonnet-5-5`), `PORT`.
