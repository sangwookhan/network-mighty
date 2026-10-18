# 웹 마이티

마이티 네트워크 3.2(장문성, 2000)를 웹으로 옮기는 프로젝트. 서버 1대에 브라우저로 접속해 여럿이 친다. 빈자리는 봇이 채운다.

| 폴더 | 내용 |
|---|---|
| `re/` | 원작 리버스 엔지니어링 분석 문서 |
| `docs/` | 유스케이스, 서버 운용·접속 스펙 |
| `packages/engine` | 규칙 엔진 (서버·화면 공용) |
| `packages/protocol` | 서버 ↔ 화면 메시지 타입 |
| `packages/server` | Node 서버: 로비, 방, 게임 진행, 봇 (WebSocket `/ws`) |
| `packages/web` | 웹 화면 (React + Vite) |

## 실행

```bash
npm install
npm run dev        # 개발 모드: http://localhost:3000
npm start          # 운영 모드: 웹 빌드 후 서버 실행 (PORT 환경변수로 포트 지정)
```

- `http://localhost:3000` 에서 닉네임을 정하고 방을 만든다.
- **혼자 3인 시험:** `http://localhost:3000/dev.html` 은 플레이어 3명(`?p=1`, `?p=2`, `?p=3`)의 화면을 나란히 띄운다.
  `?p=이름` 을 붙이면 같은 브라우저에서도 다른 사람으로 접속한다.

## 테스트

```bash
npm test           # 엔진 단위·시뮬레이션 테스트 + 서버 통합 테스트(사람 3명 + 봇)
npm run typecheck
```

## 봇

| 종류 | 파일 | 설명 |
|---|---|---|
| smart (기본) | `packages/server/src/smartBot.ts` | 자기 패와 공개 정보만 본다. 나온 카드·무늬 없는 사람을 기억해 이길 확률을 어림하고, 같은 편/상대 편을 따져 점수카드를 몰아주거나 아낀다. 공약은 딸 수 있는 트릭 수를 어림해서 정한다 |
| simple | `packages/server/src/simpleBot.ts` | 1차 단순 봇. 대결 비교용 |

봇끼리 대결해서 비교·조정한다 (같은 판에 두 봇을 섞어 앉히고, 자리를 바꿔 두 번 돌린다):

```bash
cd packages/server
npx tsx scripts/bench.ts 1000 1,2,3,4      # 판 수, 프리셋 번호
PARAMS='{"bidMargin":-2}' npx tsx scripts/bench.ts 1000 1   # 상수를 바꿔 실험
```
