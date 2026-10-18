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

