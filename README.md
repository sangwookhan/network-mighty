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

## 집 PC에서 서버 열기 (macOS / Linux)

집 PC 한 대에서 서버를 켜 두고, 같은 공유기(와이파이)에 연결된 폰·노트북으로 접속한다.
방과 게임 상태는 메모리에만 있으므로 서버를 끄거나 다시 시작하면 진행 중인 방은 사라진다.

### 1. 준비

- Node.js 22 이상, git
  - macOS: `brew install node git` (또는 nodejs.org 의 LTS 설치 파일)
  - Linux(Ubuntu/Debian): NodeSource 등으로 Node 22 설치 후 `sudo apt install git`

```bash
git clone <저장소 주소> web-mighty   # 또는 폴더째 복사
cd web-mighty
npm install
```

### 2. 서버 켜기

```bash
npm start                  # 웹 화면을 빌드하고 3000번 포트로 서버 실행
PORT=8080 npm start        # 다른 포트를 쓰려면
```

터미널에 `마이티 서버: http://localhost:3000 (운영 모드)` 가 나오면 준비 완료.

PC가 잠들면 접속이 끊기므로, 오래 켜 둘 때는:

```bash
caffeinate -i npm start    # macOS: 서버가 켜져 있는 동안 잠자기 방지
```

터미널을 닫아도 계속 돌게 하려면 `tmux` 또는 `screen` 안에서 실행한다 (Linux 는 systemd 서비스로 등록해도 된다).

### 3. 같은 와이파이에서 접속

PC의 내부 IP를 확인한다.

```bash
ipconfig getifaddr en0     # macOS (유선이면 en1 등)
hostname -I                # Linux
```

다른 기기의 브라우저에서 `http://<내부IP>:3000` 으로 접속한다 (예: `http://192.168.0.10:3000`).

접속이 안 되면 방화벽을 확인한다.

- macOS: 처음 실행할 때 "node 의 수신 연결 허용" 을 묻으면 **허용**. 놓쳤다면 시스템 설정 → 네트워크 → 방화벽 → 옵션에서 node 를 허용.
- Linux(ufw): `sudo ufw allow 3000/tcp`

### 4. 집 밖의 친구도 접속하게 하기 (선택)

**Cloudflare Tunnel (권장):** 공유기 설정 없이 https 주소가 생긴다. 계정 없이 임시 주소로 쓸 수 있다.

```bash
brew install cloudflared                        # macOS (Linux 는 Cloudflare 배포 패키지 설치)
cloudflared tunnel --url http://localhost:3000  # 출력되는 https://….trycloudflare.com 주소를 친구에게 공유
```

임시 주소는 cloudflared 를 다시 실행할 때마다 바뀐다. 고정 주소가 필요하면 Cloudflare 계정과 도메인으로 이름 있는 터널을 만든다.

**공유기 포트 포워딩:** 공유기에서 외부 포트 3000 을 PC의 내부 IP:3000 으로 연결하고 `http://<공인IP>:3000` 으로 접속한다.
https 가 아니고 집 IP가 드러나므로 아는 사람끼리 잠깐 쓸 때만 권한다.

로그인 없이 닉네임만으로 들어오는 구조라, 주소를 아는 사람은 누구나 들어올 수 있다. 주소는 아는 사람끼리만 공유한다.

### 5. 업데이트

```bash
git pull
npm install
npm start                  # 서버를 껐다가 다시 켠다 (진행 중인 방은 사라지므로 아무도 안 칠 때)
```

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
