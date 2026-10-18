# 01. 게임 로직 명세 — CCard / CCardList / CState / 규칙 구조체

대상: Mighty Network 3.2 (`Mighty.exe`, MFC 32bit, 2000).
근거: `decompiled/Mighty.exe.annotated.c`(Ghidra) + 원본 바이너리 `objdump` 디스어셈블(디컴파일이 깨진 함수의 인자 순서·조건 확인용) + `.rsrc` 다이얼로그 리소스 파싱(컨트롤 ID→한글 라벨) + `.rdata` 문자열/포인터 테이블 직접 판독.
모든 주소는 VA(ImageBase 0x400000).

표기
- `R[x]` = 규칙 구조체(`CState+0x08`이 가리키는 0x48바이트 객체)의 오프셋 x.
- `S[x]` = `CState` 오프셋 x.
- "턴(turn)" = 트릭 번호 0..9 (`S[0x108]`). 모든 인원수에서 트릭은 항상 10번.

---

## 1. 카드 정수 인코딩 (CCard, 4바이트 int 1개)

| 값 | 의미 |
|---|---|
| `0` | 없음(Nothing). 기본 생성자 값 (`IsNothing` @004014e0) |
| `1..52` | 일반 카드. `value = (shape-1)*13 + num` |
| `53 (0x35)` | 조커. 범위 밖 값으로 생성하면 0x35가 됨 (`CCard(int)` @00401230: `v<0 \|\| v>52 → 0x35`) |

- `CCard(int shape, int num)` @00401250: `1≤shape≤4 && 1≤num≤13`이면 `num + shape*13 - 13`, 아니면 0x35.
- **shape (무늬)** — `GetShape` @004012b0: 조커/0 → 0, 그 외 `(v-1)/13 + 1`.

| shape | 무늬 | 정식 이름(0x441128 테이블) | 약칭(0x441124 테이블) |
|---|---|---|---|
| 0 | (없음/노기루다) | "" | "" |
| 1 | ♠ 스페이드 | "스페이드 " | "삽" |
| 2 | ◆ 다이아몬드 | "다이아몬드 " | "다리" |
| 3 | ♥ 하트 | "하트 " | "트" |
| 4 | ♣ 클로버 | "클로버 " | "끌" |

- **num (숫자)** — `GetNum` @004012e0: 조커/0 → 0, 그 외 `(v-1)%13 + 1` → 1=A, 2..10, 11=J, 12=Q, 13=K.
- **GetPowerNum** @00401300: 조커/0 → 14. 그 외 `((v-1)%13 + 12) % 13 + 1` → 2→1, 3→2, …, K→12, **A→13**. (PowerComp, GetKirudable도 같은 식을 인라인으로 사용)
- 예: ♠A=1, ◆A=14, ♥3=29, ♣3=42, ♣K=52.

### 1.1 판정 함수
| 함수 | 주소 | 동작 |
|---|---|---|
| `IsPoint` | 00401370 | 조커 아님 && (num ∈ {10,J,Q,K} 또는 num==A). 즉 A·K·Q·J·10 = 점수카드(각 1점, 덱 전체 20점) |
| `IsAce` | 004014b0 | num==1 |
| `IsJoker` | 00401430 | v==0x35 |
| `IsOneEyedJack` | 00401460 | num==J && shape∈{1(♠),3(♥)} (애꾸눈 잭: ♠J, ♥J) |
| `IsKiruda` (CCard) | 004013c0 | 기루다 k=S[0xc8]가 1..4이고 shape==k. 노기루다(k=0)이면 항상 false. 조커는 항상 false |
| `CCardList::IsKiruda(CCard)` | 004015a0 | 위와 동일 (가상함수, vtable+0x14. SortComp/PowerComp/GetAvList가 이걸 호출) |
| `IsMighty` | 00401410 | v == GetMighty() |
| `IsJokercall` | 00401440 | v == GetJokercall() |
| `GetJoker` | 00401220 | 0x35 반환 |
| `GetKiruda` | 0040aa70 | `return s_pState[0xc8]` (static) |

`CCard::s_pState` (static, 0x443050)는 `InitStageData`에서 `this`로 설정되고, `~CState`에서 NULL로 리셋됨. `SetState`(00401200)/`GetState`(00401210)로 교체 가능.

### 1.2 마이티 / 조커콜 결정
```
GetMighty() @0040aa80:
  m = R[0x38]                       // 기본 마이티 (표준 ♠A=1)
  shapeM = (m<0 || m>52 || m==0) ? 0 : shape(m)
  if kiruda == shapeM:              // 마이티 무늬가 기루다면 보조 마이티
      a = R[0x3c]                   // 보조 마이티(빨마) (표준 ◆A=14)
      return (a<0 || a>52) ? JOKER : a
  else
      return (m<0 || m>52) ? JOKER : m

GetJokercall() @0040ab10:   // 같은 구조, R[0x40](기본, 표준 ♣3=42) / R[0x44](보조, 표준 ♠3=3)
```
- 주의: 노기루다(kiruda=0)일 때는 shapeM(1..4) ≠ 0 이므로 항상 기본 카드 사용.
- 규칙 값이 범위 밖이면 0x35(조커)가 반환되는 특이 동작 (UI상으로는 발생하지 않음).

### 1.3 GetString(bool slang) @0040aba0
우선순위: 마이티 → 조커 → 조커콜 → 일반.
| | slang=false | slang=true |
|---|---|---|
| 마이티 | "마이티" | "마이티" |
| 조커 | "조커" | "쪼카" |
| 조커콜 | "조커콜" | "쪼콜" |
| 무늬 접두 | 기루다 무늬면 "기루다 ", 아니면 정식 이름("스페이드 " 등) | 기루다면 "기", 아니면 약칭("삽","다리","트","끌") |
| 숫자 | A,K,Q,J,"10", 2..9는 숫자 1글자 | "아","카","큐","자","10", 2..9 숫자 |
예: "스페이드 K", "기루다 10", "삽카", "기아".

### 1.4 GetGoalString(bool slang, int kiruda, int goal, int baseGoal) @0040b010 (static)
(디스어셈블로 인자 확인: 4번째 인자는 호출부 @004069f7에서 `R[8]` 기본 목표 점수)
```
if !slang: return sprintf("%s %d", LONG_KIRUDA[kiruda], goal)
       // LONG_KIRUDA @0x441178 (stride 8): 0="노기루다",1="스페이드 ",2="다이아몬드 ",3="하트 ",4="클로버 "
if goal == baseGoal && kiruda == 0: return "기노"
s = ""
if goal <= 10: s = "초"
if goal > 20:  s = "풀"
s += NUM[(goal+9) % 10]   // @0x44114c: 0"독" 1"둘" 2"셋" 3"넷" 4"닷" 5"엿" 6"곱" 7"덜" 8"홉" 9"풀"
                          // → 11=독,12=둘,13=셋,…,19=홉,20=풀
s += SHORT_KIRUDA[kiruda] // @0x441174 (stride 8): 0"노",1"삽",2"다리",3"트",4"끌"
```
예: (true, 1, 14, 13) → "넷삽", (true, 0, 13, 13) → "기노", (true, 0, 15, 13) → "닷노".

---

## 2. CCardList (MFC `CList<CCard>` 파생, 이중연결리스트)

레이아웃: `+0 vtable, +4 head, +8 tail, +0xc count, +0x10 freeList, +0x14 CPlex*, +0x18 blockSize(5)`. 노드: `{next, prev, CCard data}`.
헬퍼: `FUN_00402ec0`=AddTail, `FUN_0040c5b0`=AddHead, `FUN_0040c550`=RemoveHead, `Find`@0040b7e0(선형탐색, POSITION 반환), `GetCountOf(shape)`@0040b800, `operator[]`@0040b850/0040b880(인덱스, 범위 밖이면 0), `IndexFromPOSITION`@0040b8c0, `POSITIONFromIndex`@0040b8e0.

### 2.1 NewDeck(int nPlayers, CCard keepA, CCard keepB) @0040b340
호출: `InitStageData`에서 `NewDeck(R[0], R[0x40](조커콜), R[0x44](보조 조커콜))` — 조커콜 카드 2장은 3/4마 덱에서 제거 대상에서 보호됨.
```
n = (nPlayers==6) ? 5 : nPlayers
deck.clear(); deck.addTail(JOKER)            // 조커가 항상 맨 앞
if n == 5:                                   // 5마/6마: 53장
    for num in 1..13: for shape in 1..4: addTail(card(shape,num))
elif n == 3:                                 // 3마: 33장 (3x10 + 3)
    removed = 0
    for num in 1..13:
        if 2<=num<=9 && removed<=4 && num != num(keepA) && num != num(keepB):
            removed++                         // 이 숫자는 4장 모두 제외
        else:
            for shape in 1..4: addTail(card(shape,num))
    // 표준(조커콜 ♣3/♠3)이면 2,4,5,6,7 제거 → A,K,Q,J,10,9,8,3 x4 + 조커
elif n == 4:                                 // 4마: 43장 (4x10 + 3)
    if num(keepA)==num(keepB) && keepA valid && 2<=num(keepA)<=4:
        for num in 1..13 (단 2,3,4 제외): for shape 1..4: addTail(...)
        addTail(keepA); addTail(keepB)        // 표준: 2,3,4 전부 제거하되 ♣3, ♠3만 남김
    else:
        52장 전부 추가 후, num=2..9, shape=4..1 순으로 keepA/keepB가 아닌 카드를 10장 제거
```
덱 크기 요약: 3마 33, 4마 43, 5마 53, 6마 53. 남는 패(키티): 3/4/5마 3장, 6마 5장(6×8=48).

### 2.2 Suffle() @0040b680
3회 반복: 원본 리스트를 앞에서 하나씩 꺼내 `rand()&1==0`이면 임시 리스트 head에, 아니면 tail에 넣음 → 다시 임시 리스트 앞에서 꺼내 같은 방식으로 원본에 넣음. `InitStageData`는 Suffle을 4번 호출(=12패스). 웹 이식 시 Fisher–Yates로 대체해도 무방 (MSVC `rand()` 재현 불필요).

### 2.3 SortComp(CCard a, CCard b, bool kirudaFirst, bool aceFirst) @0040b9a0 / Sort(bool,bool) @0040bc10
SortComp > 0 이면 a가 b 앞. (디스어셈블로 bool 2개 위치 확인)
```
if a==JOKER: return +1 ; if b==JOKER: return -1          // 조커 항상 맨 앞
if isKiruda(a) && !isKiruda(b): return kirudaFirst ? +1 : -1
if !isKiruda(a) && isKiruda(b): return kirudaFirst ? -1 : +1
if shape(a) > shape(b): return -1 ; if shape(a) < shape(b): return +1   // ♠,◆,♥,♣ 순
if a is A && b not A: return aceFirst ? +1 : -1
if b is A && a not A: return aceFirst ? -1 : +1
return num(a) > num(b) ? -1 : (num(a) < num(b) ? +1 : 0)               // 오름차순
```
Sort: 원본에서 하나씩 꺼내 결과 리스트를 앞에서 훑으며 `SortComp(new, elem) > 0`인 첫 elem 앞에 삽입(삽입정렬). bool 인자는 앱 옵션(ModuleState+0xc6, +0xc7)에서 옴 — 표시 전용, 게임 규칙과 무관. 마이티는 특별 취급하지 않음.

### 2.4 GetPoint() @0040bd80
리스트 내 `IsPoint` 카드 수.

### 2.5 GetKirudable() @0040b900
각 무늬 1..4에 대해 해당 무늬 카드의 `PowerNum` 합(2=1 … A=13)을 구해 **합이 가장 큰 무늬** 반환(동점이면 낮은 번호 무늬, 패가 없으면 0). 조커 제외. (AI의 기루다 추천용)

### 2.6 PowerComp(CCard a, CCard b, int turn, int leadShape, bool jokercalled) @0040bea0
(디컴파일의 인자 매핑이 깨져 있어 디스어셈블로 재구성) 반환: +1 a 강함, -1 b 강함, 0 둘 다 무관(둘 다 리드무늬·기루다 아님).
```
mightyOn = (turn==0) ? R[0x17] : (turn==9) ? R[0x19] : true
jcEff    = jokercalled && (turn!=0 || R[0x21])
jokerOn  = ((turn==0) ? R[0x1c] : (turn==9) ? R[0x1e] : true) && (!jcEff || R[0x22])

if mightyOn:
    if a==MIGHTY: return +1 ; if b==MIGHTY: return -1
if jokerOn:
    if a==JOKER: return +1 ; if b==JOKER: return -1
else:
    if a==JOKER: return -1 ; if b==JOKER: return +1     // 무효 조커는 무엇에게도 짐
ka = isKiruda(a); kb = isKiruda(b)                     // 무효 마이티는 일반카드로 취급(기루다일 수 있음)
if !ka && !kb:
    la = shape(a)==leadShape; lb = shape(b)==leadShape
    if !la && !lb: return 0
    if !la: return -1 ; if !lb: return +1
else:
    if !ka: return -1 ; if !kb: return +1
return power(a) > power(b) ? +1 : -1                   // power: 2=1 … A=13
```

### 2.7 GetWinner(int turn, int jokerShape, bool jokercallFlag) @0040bde0 → POSITION
`this`는 현재 트릭(낸 순서대로).
```
first = this[0]
leadShape = (first==JOKER) ? jokerShape : shape(first)     // 조커 선이면 선언한 무늬
jc = (first == GetJokercall()) && jokercallFlag
best = node0
for node in node1..:
    if PowerComp(best.card, node.card, turn, leadShape, jc) < 0: best = node
return best
```
(0 반환 시 기존 best 유지 → 먼저 낸 카드 우선)

### 2.8 GetAvList(CCardList* out, const CCardList* trick, int turn, int jokerShape, bool jokercallFlag) @0040c160
`this`=손패. 디스어셈블로 인자/분기 확인.
```
out.clear(); hasMighty=false; hasJoker=false
leadShape = 0; mustFollow = false
if trick.count > 0:
    leadShape = (trick[0]==JOKER) ? jokerShape : shape(trick[0])
    mustFollow = leadShape!=0 && hand.countOf(leadShape) > 0

for c in hand:
    if c == MIGHTY:
        hasMighty = true
        if turn==0 && !R[0x16]: continue        // 첫 턴 마이티 금지
        if turn==9 && !R[0x18]: continue        // 마지막 턴 마이티 금지
        out.add(c); continue
    if c == JOKER:
        hasJoker = true
        if trick.count>0 && trick[0]==JOKERCALL && jokercallFlag && (turn!=0 || R[0x21]):
            // 조커콜 당함: 조커를 반드시 냄 (R[0x1a]면 마이티도 허용)
            out = [JOKER]
            hasMighty = hand.contains(MIGHTY)
            if R[0x1a] && hasMighty: out.add(MIGHTY)
            goto POST                           // 루프 즉시 종료
        if turn==0 && !R[0x1b]: continue        // 첫 턴 조커 금지
        if turn==9 && !R[0x1d]: continue        // 마지막 턴 조커 금지
        out.add(c); continue
    // 일반 카드
    if mustFollow:
        if shape(c)==leadShape: out.add(c)
    else:
        if !isKiruda(c) || turn != 0: out.add(c)
        else:                                    // 첫 턴에 (리드무늬 없이) 기루다
            if R[0x1f] && (trick.count>0 || R[0x20]): out.add(c)
POST:
// 마지막 턴에 못 내는 특수카드가 남지 않도록 강제
if turn==7 && hasMighty && !R[0x18] && hasJoker && !R[0x1d]:
    out = [MIGHTY, JOKER]; return
if turn==8 && ((hasMighty && !R[0x18]) || (hasJoker && !R[0x1d])):
    out = (hasMighty && !R[0x18]) ? [MIGHTY] : [JOKER]; return
if out.empty(): out = hand                       // 낼 카드가 없으면 전부 허용
```
주의
- 마이티/조커는 무늬 따르기 의무와 무관하게 언제나(턴 제약만 만족하면) 낼 수 있음.
- 선(리드)이 낼 수 있는 카드에 대해 "조커콜/조커 선언 무늬" 등은 별도 함수(`FUN_004211c0`, §3.6)에서 처리.
- 손패에 리드무늬가 없을 때 기루다를 내는 건(첫 턴 제외) 자유.

---

## 3. CState (0x120+ 바이트, `FUN_00421b90` 등 게임진행 클래스가 상속해 사용)

### 3.1 필드 레이아웃
| 오프셋 | 타입 | 의미 | 근거 |
|---|---|---|---|
| +0x00 | vtable | | |
| +0x04 | int | 진행 단계(phase): 0=딜/초기화, 1=선거(공약), 2=주공 확정~키티/최종공약, 3=트릭 진행, 4=게임 종료(정산) | InitStageData, FUN_004225b0 |
| +0x08 | Rule* | 규칙 구조체(0x48B) | CState() @00431460 |
| +0x0c | int | 판(스테이지) 번호, 매 판 +1 | FUN_004225b0: `InitStageData(S[0xc]+1, …)` |
| +0x10..+0x24 | CPlayer*[6] | 전체 플레이어(고정 좌석) | |
| +0x28 | CCardList* | 덱 → 딜 후엔 남은 패(키티) → 주공이 버린 3장 + 죽은 카드 더미 | NewDeck, FUN_004210c0 |
| +0x2c | CCardList* | 현재 트릭에 놓인 카드(선부터 순서대로) | |
| +0x30[6] | int | 플레이어별 **획득 점수**(트릭 승리로 딴 점수카드 수) | WriteHistory |
| +0x48[6] | int | 같은 편 승자에게 넘겨준 점수카드 수(기여) | WriteHistory |
| +0x60[6] | int | 상대 편 승자에게 넘겨준 점수카드 수(헌납) | WriteHistory |
| +0x78[6] | int | 트릭마다 선(리드) 플레이어에게 +10 (의미 불명, 통계용 추정) | WriteHistory |
| +0x90[6] | CPlayer*[6] | 이번 판 좌석순 플레이어(6마 탈락 후 재배열) | InitStageData, FUN_00420b70 |
| +0xa8 | int | 이번 판 인원수(=R[0], 6마는 탈락 후 5) | |
| +0xac[6] | bool | 선거에서 패스한 플레이어 | FUN_004225b0 |
| +0xb4 | CCardList* | 6마 탈락자 지목 시 시도한 카드 기록(추정) | FUN_004225b0 |
| +0xb8 | int | 주공(master/당선자) 인덱스, -1=없음 | |
| +0xbc | int | 프렌드 인덱스. -1=없음/노프렌드, -2=초구 프렌드(첫 트릭 승자) 미확정 | FUN_004225b0 |
| +0xc0 | int | 6마에서 탈락한 플레이어 인덱스 | FUN_00420cb0/00420b70 |
| +0xc4 | bool | 프렌드 공개됨 | |
| +0xc8 | int | 기루다 무늬 0(노기루다)/1..4 | GetKiruda |
| +0xcc | int | 목표 점수(공약), 0=아직 없음 | |
| +0xd0 | int | 프렌드 지정값(§3.5 인코딩) | |
| +0xd4..+0xdc | int | 초기화 0 (용도 미확정) | |
| +0xe0 | int | 주공이 버린 3장 중 점수카드 수 | FUN_004210c0 |
| +0xe4 | bool | 이번 판에 조커가 이미 나왔음 | FUN_004211c0 |
| +0xe8[4] | bitmask | 무늬별(1..4) 지금까지 나온 카드(bit = PowerNum-1) | FUN_004225b0 |
| +0xf8[4] | bitmask | 현재 트릭에서 나온 카드(트릭 끝나면 +0xe8에 OR) | |
| +0x108 | int | 현재 트릭 번호 0..9 (-1=플레이 전) | |
| +0x10c | int | 현재 트릭의 선(리드) 플레이어. 판 시작 시엔 딜러(=첫 공약자) | |
| +0x110 | bool | 이번 트릭에서 조커콜이 선언됨 | FUN_004211c0 |
| +0x114 | int | 조커로 선을 잡았을 때 선언한 무늬(1..4, 잘못된 값이면 1) | FUN_004211c0 |
| +0x118 | int | 직전에 이동한 카드(애니메이션/통지용) | |
| +0x11c | int | 현재 행동할 플레이어 | |

CPlayer(참고): `+4` 네트워크/고정 ID, `+8` 이번 판 좌석 인덱스(탈락 시 -1), `+0xc` 현재 누적 점수(돈), `+0x10` 직전 점수, `+0x4c` 손패 CCardList(`FUN_0041e8c0`), `+0x68` 획득한 점수카드 더미(표시용), `+0x14..+0x40` 승/패 통계 카운터.

### 3.2 InitStageData(int stageNo, int dealer) @004315b0
```
s_pState = this; S[4]=0; S[0xc]=stageNo
deck.NewDeck(R[0], R[0x40], R[0x44]); repeat 4: deck.Suffle()
trick.clear(); S[0x30..0x8f] = 0
S[0xa8] = R[0]
for i in 0..R[0]-1: p=S[0x10+4i]; p[8]=p[4]; p.hand.clear(); p.taken.clear(); S[0x90+4i]=p; p[8]=i; S[0xac+i]=false
S[0xb4].clear()
master=friend=S[0xc0]=-1; friendRevealed=false
kiruda=goal=friendSpec=0; S[0xd4..0xe0]=0; jokerPlayed=false; S[0xe8..0x104]=0
S[0x108]=-1; S[0x10c]=dealer; S[0x110]=false; S[0x114]=0; S[0x118]=0; S[0x11c]=dealer
```

### 3.3 게임 진행 흐름 (FUN_004225b0, 범위 밖이지만 필드 의미 확인용으로 요약)
1. 딜: `n * (R[0]==6 ? 8 : 10)`장을 덱 **꼬리에서** 한 장씩, `(dealer+i)%n` 순서로. (손패 2,5,8,10장 시점에 동기화 이벤트)
2. phase=1 선거. 현재 플레이어부터 각자 (kiruda, goal, friend?) 제시 → `IsValidNewGoal` 실패 시 패스로 간주, 패스도 불가(딜러 첫 패스 금지)면 `(노기루다, R[8])`로 강제.
   선거 종료 판정 `FUN_00420d10`:
   - goal==-1(딜미스 선언) → 재딜.
   - goal==0(패스): 다음 미패스자 탐색. 다른 모두가 패스했으면 → 재딜(전원 패스). 미패스자가 정확히 1명 남고 현재 공약이 있으면 그 사람이 당선.
   - goal>0: **goal ≥ 20이면 즉시 당선**(R[0xd] 여부와 무관 — 조건식이 `(R[0xd]&&goal>=25)||goal>=20`). 아니면 다음 미패스자에게 차례. 다른 모두 패스했으면 현재 제시자 당선.
   - 차례는 인덱스 +1 방향의 미패스자.
3. phase=2: master=당선자, 선=master.
   - 6마: 주공이 카드 하나를 지목 → 주공 외 그 카드를 가진 사람이 탈락(S[0xc0]); 아무도 없으면 다시 지목. 탈락자 8장을 덱(키티 5장)에 합쳐 셔플 후 남은 5명에게 2장씩(총 10장) 분배, 남은 3장은 키티. 인원 5로 재배열(FUN_00420b70).
   - 키티(덱에 남은 카드 전부)를 주공 손패에 추가 → 13장.
   - 주공이 3장을 버리고 최종 (기루다, 공약, 프렌드) 제시. 버린 카드는 덱(S[0x28])으로, `S[0xe0]`=버린 점수카드 수, 기루다 확정(FUN_004210c0). 최종 공약이 `IsValidNewGoal` 실패면 기존 값 유지. 프렌드는 `GetValidFriend`로 검증.
   - 프렌드 확정: spec 0 → 노프렌드(friend=-1, 공개됨) / 100 → 초구 프렌드(friend=-2) / 음수 → 지정 플레이어 `-1-spec`(공개됨) / 카드 → 그 카드 보유자(비공개; 아무도 없으면 -1, 공개됨).
4. phase=3: 트릭 10회. 매 트릭 `S[0x114]=0, S[0x110]=false`. 선부터 차례로 카드 선택 → 선택한 카드가 `GetAvList` 결과에 없으면 목록 첫 카드로 대체. `FUN_004211c0`(§3.6) 처리 후 손패→트릭 이동.
   - 프렌드 카드가 나오면 프렌드 공개, 그가 모아둔 점수카드 더미를 덱으로 이동.
   - 트릭 종료: `GetWinner` → 초구 프렌드면 승자가 주공일 때 노프렌드(-1), 아니면 승자=프렌드(공개). `WriteHistory`. 트릭 카드 처리: 점수카드이고 승자가 야당(또는 미공개 프렌드)이면 승자 더미(+0x68)로, 아니면 죽은 더미(S[0x28]). 다음 선=승자, 트릭+1.
5. phase=4: 정산 `FUN_00421240`(§5). 다음 판 딜러: `R[0xe] && friend>=0` 이면 프렌드, 아니면 주공.

### 3.4 IsValidNewGoal(int kiruda, int goal) @00431940
```
inElection = (S[4]==1)
kirudaChangeCheap = (S[4]==2) && hand(S[0x11c]).count < 13
if goal == -1:                     // 딜미스 선언
    return inElection && IsDealMiss(hand(S[0x11c]))
if goal == 0:                      // 패스
    if !inElection: return false
    if S[0xcc]==0 && S[0x11c]==S[0x10c] && !R[0xf]: return false   // 딜러는 첫 패스 불가(옵션)
    return true
minG = R[8] - ((R[0xc] && kiruda==0) ? 1 : 0)
maxG = R[0xd] ? 25 : 20
if goal < minG || goal > maxG: return false
if inElection: return goal > S[0xcc]                 // 선거 중엔 무조건 올려야 함
// phase 2: 당선자의 최종 공약 변경
if kiruda == S[0xc8]: return goal >= S[0xcc]
if R[0x11] && (S[0xc8]==0 || kiruda==0): inc = 1     // 노기루다로/에서 바꿀 땐 1
elif R[0x10]: inc = kirudaChangeCheap ? 1 : 2        // 기루다 변경 시 2 올림
else: inc = 1
return goal >= min(S[0xcc] + inc, maxG)
```
※ 실제 흐름에서 최종 검증은 버린 뒤(손패 10장)에 호출되므로 `kirudaChangeCheap=true` → +1만 요구됨. 13장 들고 있을 때(UI 검증)는 +2. 원작의 비일관성(불확실 항목 참고).

### 3.5 GetValidFriend(int spec) @00431ac0
프렌드 지정 인코딩: `0`=노프렌드, `100`=초구 프렌드, `음수 -1-i`=플레이어 i 지정, `1..53`=카드(53=조커).
```
if !R[0x13]: return 0                       // 프렌드 제도 없음 → 노프렌드
if spec==0 || spec==100: return spec
if spec < 0: i=-1-spec; return (i >= S[0xa8] || i == master) ? 0 : spec
if spec < 1 || spec > 53: return 0
if spec == 53 && !R[0x14]: return 0        // 조커 프렌드 금지
if hand(master).contains(spec) || S[0x28].contains(spec): return 0   // 자기 손패/버린 카드는 불가
return spec
```

### 3.6 FUN_004211c0(CCard played, int arg) — 카드 낼 때 상태 갱신
```
if played == JOKERCALL:
    if IsEffectiveJokercall(): S[0x110] = (arg != 0)   // 조커콜 선언 여부
elif played == JOKER:
    S[0xe4] = true
    if S[0x11c] == S[0x10c]:                            // 조커로 선을 잡음
        S[0x114] = (1<=arg<=4) ? arg : 1                 // 선언 무늬
```

### 3.7 IsEffectiveJokercall() @00431dd0
`(turn!=0 || R[0x21]) && !S[0xe4](조커 이미 나옴) && trick.count==0` (조커콜은 선으로 낼 때만 유효).

### 3.8 IsDealMiss(const CCardList* hand) @00431b80 (디스어셈블 확인)
```
hasM = hand.contains(MIGHTY); hasJ = hand.contains(JOKER)
p = hand.GetPoint()                       // 마이티가 A/점수카드면 이미 포함됨
if R[0x27]: p -= 1                        // ※ 조커 보유 여부를 확인하지 않음 (원본 그대로)
if R[0x2a] && hasM && p==1: return true   // 점수카드가 마이티 한 장뿐
if R[0x28] && p==1 && hand has any num==10: return true
if R[0x29] && p==1 && hand has one-eyed jack: return true
if hasJ && R[0x26]: p += 1                // 조커를 점수카드로 계산
if hasM && !R[0x25]: p -= 1               // 마이티를 점수카드로 안 침
if p <= 0: return true                    // ※ R[0x23] 확인 없음
return p >= hand.count                    // ※ R[0x24] 확인 없음 (모든 카드가 점수카드)
```

### 3.9 GetWinner(const CCardList* trick, bool* outDefenderWon, int jokerShape=-1, int jcFlag=-1, int nPlayers=-1, int turn=-1, int leader=-1, int master=-1, int friend=-1) @00431ce0
-1 인자는 각각 S[0x114], S[0x110], S[0xa8], S[0x108], S[0x10c], S[0xb8], S[0xbc]로 대체.
```
pos = trick.GetWinner(turn, jokerShape, jcFlag)
w = (trick.IndexFromPOSITION(pos) + leader) % nPlayers
if outDefenderWon: *outDefenderWon = (w==master || w==friend)
return w
```
※ friend가 아직 공개 전이어도 실제 인덱스로 판단(엔진 내부 정보).

### 3.10 IsDefender(int i) @00431da0
`i == S[0xb8] || i == S[0xbc]` (여당 = 주공+프렌드).

### 3.11 WriteHistory() @004317d0 — 트릭 종료 시 통계
```
S[0x78 + 4*leader] += 10
w = GetWinner(trick, &defWon)
for k in 0..n-1:
    p = (k + leader) % n; c = trick[k]
    if p == w: S[0x30+4p] += trick.GetPoint()
    elif IsDefender(p) == defWon: S[0x48+4p] += IsPoint(c)      // 같은 편에게 줌
    else:                          S[0x60+4p] += IsPoint(c)      // 상대에게 줌
```

---

## 4. 규칙 구조체 (0x48 바이트) — `R[x]`

생성: `FUN_00430670(rule, presetNo)` (1..12, 1=표준 5마)가 프리셋 문자열을 `FUN_00430a10`으로 디코드. 직렬화 `FUN_004306a0`. 다이얼로그 바인딩은 각 PropertyPage의 DoDataExchange(`DDX_*`).

| 오프셋 | 타입 | 의미 (UI 라벨) | 다이얼로그 / 컨트롤 ID | 게임로직 사용처 |
|---|---|---|---|---|
| 0x00 | int | 플레이어 수 3..6 (라디오 idx+3: "3 마 (프랜드 없음)", "4 마", "5 마 (표준)", "6 마 (1명 탈락제)") | 일반(0x330) 0x442 | NewDeck, 딜 수, 정산 |
| 0x04 | bool | 시계 방향으로 진행 | 일반 0x446 | UI(좌석 표시) |
| 0x08 | int | 기본 목표 점수 (콤보 idx+5) | 선거(0x331) 0x44a | IsValidNewGoal, 정산(13기준) |
| 0x0c | bool | 노기루다일때 기본 점수보다 1 적게 부를 수 있음 | 선거 0x44b | IsValidNewGoal |
| 0x0d | bool | 목표 점수를 20 보다 높게 부를 수 있음 (최대 25) | 선거 0x44c | IsValidNewGoal, FUN_00420d10 |
| 0x0e | bool | 전판의 프랜드가 다음판의 딜러가 됨 | 선거 0x44d | 0x423da0 |
| 0x0f | bool | 딜러가 처음에 패스할 수 있음 | 선거 0x44e | IsValidNewGoal |
| 0x10 | bool | 기루다를 바꿀 때 목표점수를 2 올림 | 선거 0x44f | IsValidNewGoal |
| 0x11 | bool | (위 옵션 하위) 노기루다로 바꿀 때는 목표점수를 1 만 올림 | 선거 0x450 | IsValidNewGoal |
| 0x12 | bool | **UI 없음** (직렬화만 됨, 로직 미사용) | — | — |
| 0x13 | bool | 프랜드 제도 있음 | 선거 0x451 | GetValidFriend, 정산 |
| 0x14 | bool | 조커를 프랜드로 부를 수 있음 | 선거 0x452 | GetValidFriend |
| 0x15 | bool | 주공이 버린 세 장의 카드는 야당 득점 | 선거 0x453 | 정산 |
| 0x16 | bool | 첫 턴에 마이티 낼 수 있음 | 제약조건(0x332) 0x454 | GetAvList |
| 0x17 | bool | 첫 턴에 나온 마이티 효력 있음 | 제약 0x455 | PowerComp |
| 0x18 | bool | 마지막 턴에 마이티 낼 수 있음 | 제약 0x456 | GetAvList |
| 0x19 | bool | 마지막 턴에 나온 마이티 효력 있음 | 제약 0x457 | PowerComp |
| 0x1a | bool | 조커콜에 조커 대신 마이티를 낼 수 있음 | 제약 0x458 | GetAvList |
| 0x1b | bool | 첫 턴에 조커 낼 수 있음 | 제약 0x459 | GetAvList |
| 0x1c | bool | 첫 턴에 나온 조커 효력 있음 | 제약 0x45a | PowerComp |
| 0x1d | bool | 마지막 턴에 조커 낼 수 있음 | 제약 0x45b | GetAvList |
| 0x1e | bool | 마지막 턴에 나온 조커 효력 있음 | 제약 0x45c | PowerComp |
| 0x1f | bool | 첫 턴에 선이 아닌 플레이어는 기루다 낼 수 있음 | 제약 0x45d | GetAvList |
| 0x20 | bool | 첫턴에 선도 기루다 낼 수 있음 | 제약 0x45e | GetAvList (0x1f가 켜져야 의미) |
| 0x21 | bool | 첫 턴에 조커콜 효력 있음 | 제약 0x45f | PowerComp, GetAvList, IsEffectiveJokercall |
| 0x22 | bool | 조커콜 당한 조커가 조커 효력 있음 | 제약 0x460 | PowerComp |
| 0x23 | bool | 점수 카드가 하나도 없으면 딜 미스 | 딜미스(0x333) 0x461 | **미사용** |
| 0x24 | bool | 모든 카드가 점수카드면 딜 미스 | 딜미스 0x462 | **미사용** |
| 0x25 | bool | 위의 두 경우 마이티를 점수 카드로 계산 | 딜미스 0x463 | IsDealMiss |
| 0x26 | bool | 위의 두 경우 조커를 점수 카드로 계산 | 딜미스 0x464 | IsDealMiss |
| 0x27 | bool | 조커가 있으면 점수 카드를 하나 제할 수 있음 | 딜미스 0x465 | IsDealMiss(조커 확인 없음) |
| 0x28 | bool | 점수카드가 10 한 장뿐인 경우 딜미스 | 딜미스 0x466 | IsDealMiss |
| 0x29 | bool | 점수카드가 애꾸눈 잭 한 장뿐인 경우 딜 미스 | 딜미스 0x467 | IsDealMiss |
| 0x2a | bool | 점수카드가 마이티 한 장 뿐인 경우 딜 미스 | 딜미스 0x468 | IsDealMiss |
| 0x2b | bool | 기본 점수 계산법: 위험 보상 (2.0 호환) | 점수계산법(0x334) 라디오 0x469 | 정산 |
| 0x2c | bool | 〃 눈에는 눈 | 0x46a | 정산 |
| 0x2d | bool | 〃 눈에는 눈 (변형) | 0x46b | 정산 |
| 0x2e | bool | 〃 10 기준 | 0x46c | 정산 |
| 0x2f | bool | 〃 13 기준 (실제로는 0x2b~0x2e가 모두 false일 때의 기본값) | 0x46d | 정산 |
| 0x30 | bool | 런 보상: 2 배 줌 | 라디오 0x46e idx1 | 정산 |
| 0x31 | bool | 런 보상: 미리 런을 선언했을 경우만 2배 줌 (공약≥20) | idx2 | 정산 |
| 0x32 | bool | 빽런은 2 배 줌 | 0x472 | 정산 |
| 0x33 | bool | 노기루다는 2 배씩 줌 | 0x474 | **미사용**(노기 2배는 항상 적용) |
| 0x34 | bool | 노프랜드는 2 배씩 줌 | 0x473 | **미사용**(노프 2배는 항상 적용) |
| 0x35 | bool | 런 보상: 고정액 줌 (20단위) | idx3 | 정산 |
| 0x36 | bool | 프랜드가 득점하면 즉시 프랜드임을 밝힘 | 일반 0x447 | 로직에서 직접 참조 확인 못함 |
| 0x37 | bool | 득점한 카드는 뒤집어 놓기 | 일반 0x448 | UI(0x404e11) |
| 0x38 | int(card) | 기본 마이티 (콤보 idx+1) | 카드(0x324) 0x475 | GetMighty |
| 0x3c | int(card) | 보조 마이티 (빨마) | 카드 0x476 | GetMighty |
| 0x40 | int(card) | 기본 조커콜 | 카드 0x477 | GetJokercall, NewDeck |
| 0x44 | int(card) | 보조 조커콜 | 카드 0x478 | GetJokercall, NewDeck |

"미사용" 판정: 전체 디스어셈블에서 `byte ptr [reg+off]` 형태(스택 제외) 접근이 다이얼로그 생성자/DDX/직렬화에만 존재함을 확인.

### 4.1 직렬화 포맷 (14글자 ASCII) — `FUN_004306a0` / `FUN_00430a10`
각 문자 = 값 + 0x23('#').
```
c[0]=R[0x00]  c[1]=R[0x08]  c[2]=R[0x38]  c[3]=R[0x3c]  c[4]=R[0x40]  c[5]=R[0x44]
c[6] bits0..5 = R[0x0c],R[0x0d],R[0x04],R[0x0e],R[0x0f],R[0x10]
c[7] bits0..5 = R[0x11..0x16]
c[8] = R[0x17..0x1c], c[9] = R[0x1d..0x22], c[10] = R[0x23..0x28],
c[11] = R[0x29..0x2e], c[12] = R[0x2f..0x34], c[13] bits0..2 = R[0x35..0x37]
```

### 4.2 프리셋 12종 (`0x442e5c`: {문자열, 이름} 쌍, 디코드 결과)
모든 프리셋 공통값: R[0x04]=1, R[0x12]=0, R[0x16]=1, R[0x18]=1, R[0x19]=1, R[0x1f]=1, R[0x23]=1, R[0x24]=0, R[0x25]=1, R[0x26]=0, R[0x2d]=0, R[0x2e]=0, R[0x2f]=0, R[0x30]=1, R[0x31]=0, R[0x33]=1, R[0x35]=0, 마이티 ♠A(1) / 보조 마이티 ◆A(14) / 조커콜 ♣3(42).
아래 표는 프리셋마다 다른 값(바이너리의 문자열을 §4.1 규칙으로 스크립트 디코드한 결과). 점수법: 0x2b=위험보상, 0x2c=눈에는 눈, 둘 다 0이면 13 기준.

| # | 이름 | R[0] 인원 | R[8] 기본목표 | R[0x44] 보조JC | 0c | 0d | 0e | 0f | 10 | 11 | 13 | 14 | 15 | 17 | 1a | 1b | 1c | 1d | 1e | 20 | 21 | 22 | 27 | 28 | 29 | 2a | 2b | 2c | 32 | 34 | 36 | 37 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 표준 5마 | 5 | 13 | ♠3 | 0 | 0 | 0 | 1 | 1 | 0 | 1 | 1 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 1 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 |
| 2 | 표준 4마 | 4 | 14 | ♠3 | 0 | 0 | 0 | 1 | 1 | 0 | 1 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 1 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 |
| 3 | 표준 3마 | 3 | 12 | ♠3 | 0 | 0 | 0 | 1 | 1 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 1 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 |
| 4 | 표준 6마 | 6 | 13 | ♠3 | 0 | 0 | 0 | 1 | 1 | 0 | 1 | 1 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 1 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 |
| 5 | 관악 6마 | 6 | 13 | ♥3 | 1 | 0 | 1 | 0 | 1 | 1 | 1 | 1 | 0 | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 1 | 1 | 1 | 1 | 0 | 1 | 1 | 0 | 0 | 0 |
| 6 | 신촌 5마 | 5 | 14 | ♠3 | 1 | 1 | 1 | 0 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 1 | 1 | 1 | 0 | 1 | 1 | 0 | 1 |
| 7 | 경기 5마 | 5 | 12 | ♥3 | 0 | 0 | 0 | 1 | 0 | 0 | 1 | 1 | 0 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 0 | 0 | 0 | 0 | 1 | 0 | 1 | 1 | 1 | 0 |
| 8 | 부산 4마 | 4 | 13 | ♠3 | 1 | 0 | 1 | 0 | 1 | 1 | 1 | 0 | 0 | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 1 | 1 | 1 | 1 | 0 | 1 | 0 | 0 | 0 |
| 9 | 대구 5마 | 5 | 12 | ♠3 | 1 | 1 | 1 | 0 | 1 | 1 | 1 | 1 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 1 | 0 | 0 | 1 | 0 | 1 | 0 | 0 | 0 |
| 10 | 대전 6마 | 6 | 13 | ♠3 | 1 | 0 | 1 | 0 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 1 | 1 | 1 | 1 | 1 | 0 | 1 | 0 | 0 | 0 |
| 11 | 광주 5마 | 5 | 12 | ♠3 | 1 | 0 | 0 | 1 | 1 | 1 | 1 | 1 | 0 | 0 | 0 | 1 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 1 | 0 | 1 | 0 | 0 | 1 |
| 12 | 제주 3마 | 3 | 12 | ♠3 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 1 | 1 | 1 | 1 | 1 | 0 | 1 | 0 | 0 | 0 |

정확한 원본 문자열(검증용):
```
1 표준 5마 (0$1M&WO*7H'5#    2 표준 4마 '1$1M&WG*7H'5#    3 표준 3마 &/$1M&WC*7H'5#
4 표준 6마 )0$1M&WO*7H'5#    5 관악 6마 )0$1M@PP27X.=#    6 신촌 5마 (1$1M&R`2'X*]'
7 경기 5마 (/$1M@7Obb(']%    8 부산 4마 '0$1M&PH27H*=#    9 대구 5마 (/$1M&RP17H'=#
10 대전 6마 )0$1M&P`27X*=#   11 광주 5마 (/$1M&XP9(H'='   12 제주 3마 &/$1M&7C27X*=#
```
(이식 시 이 문자열을 그대로 §4.1 디코더에 넣어 쓰는 것을 권장.)

---

## 5. 정산(점수 계산) — FUN_00421240 @00421240 (`this`=CState)
디스어셈블로 분기·포맷 인자 순서를 재구성.
```
defPts = Σ S[0x30+4i] (i=주공/프렌드);  oppPts = Σ S[0x30+4i] (그 외)
if R[0x15]: oppPts += S[0xe0] else: defPts += S[0xe0]      // 버린 3장의 점수
goal = S[0xcc]; base = R[8]
win = defPts >= min(goal, 20)

// 기본 점수 S (표시 문자열)
if R[0x2b]:   S = win ? (goal-base)*2 + (defPts-goal)  "((%d-%d)x2+(%d-%d))"   : goal-defPts "(%d-%d)"   // 위험 보상
elif R[0x2c]: S = win ? defPts-goal                     "(%d-%d)"               : goal-defPts              // 눈에는 눈
elif R[0x2d]: S = win ? defPts-goal+1                   "(%d-%d+1)"             : goal-defPts              // 눈에는 눈(변형)
elif R[0x2e]: S = win ? defPts-10                       "(%d-10)"               : goal-defPts              // 10 기준
else:         S = win ? defPts-base                     "(%d-%d)"               : goal-defPts              // 13 기준(=기본 목표 점수 기준)

// 배수
if win && defPts >= 20:                 // 런
    if R[0x35]: S = 20 ("%d(고정)")
    elif R[0x31]: if goal >= 20: S *= 2 (" x2(런)")
    elif R[0x30]: S *= 2
if !win && oppPts >= goal && R[0x32]: S *= 2 (" x2(빽런)")
if win && kiruda == 0: S *= 2 (" x2(노기)")                 // R[0x33] 확인 없음
if win && R[0x13] && S[0xd0] == 0: S *= 2 (" x2(노프)")     // R[0x34] 확인 없음
표시: " = [%d]"

// 분배 (money[] = 각 플레이어 CPlayer+0xc 누적점수)
total = 0
for i not in {master, friend}:
    if win: money[i] -= S; total += S
    else:   money[i] += S; total -= S
if R[0x13] && S[0xd0] != 0 && n >= 4: mShare = n-3; fShare = 1   // 5인: 주공 2 : 프렌드 1, 4인: 1:1
else:                                  mShare = 1;   fShare = 0
mGain = mShare*total / (mShare+fShare)        // C 정수 나눗셈(0쪽 절삭)
money[master] += mGain
if R[0x13] && S[0xd0] != 0: money[friend] += total - mGain
// 파산 처리: 음수인 사람은 0으로, 그 합 D(<0)를
if D < 0:
    if win: money[master] += D
    else:  상대편(야당) k명에게 D/k씩(마지막 사람이 나머지) 더함, k = n - (프렌드有?1:0) - 1
```
- 표시용: 플레이어별 기여도 % = `(S[0x30+4i]+S[0x48+4i])*100 / 해당 편 합계`, "x%d명"(mShare>1일 때), "%s %c %s[기본]"('+'/'-').
- 앱 옵션(ModuleState+0xc9)에 따라 배율 "%d.%dx" 표시(100/n 계산) — 점수에는 영향 없음.

---

## 6. 불확실한 부분 / 원작 버그 의심
1. **점수법 라디오 저장 off-by-one** (`FUN_004305c0`): 라디오 idx 0과 1이 모두 R[0x2b]로 저장되고 idx k(≥2)는 k-1번째 플래그로 저장됨(디스어셈블 확인). 즉 UI에서 "눈에는 눈"을 고르면 "위험 보상"이 저장되고 "13 기준"을 고르면 "10 기준"이 저장됨. 프리셋 문자열로 로드할 때는 정상. 이식 시엔 의도대로(one-hot) 구현 권장.
2. **R[0x23], R[0x24](딜미스 조건 on/off), R[0x33], R[0x34](노기/노프 2배 on/off), R[0x12]** 는 게임 로직에서 읽히지 않음. 즉 "점수카드 0장/전부 점수카드 딜미스"와 "노기·노프 2배"는 항상 적용됨. 레지스터 간접 접근 등으로 놓쳤을 가능성은 낮지만 0%는 아님.
3. **R[0x27]** "조커가 있으면 점수카드 하나 제함"이 조커 보유 여부를 확인하지 않고 무조건 -1 함.
4. **R[0x36]**(프랜드 득점 즉시 공개) 직접 참조를 찾지 못함 — UI/네트워크 쪽에서 복사본으로 쓰일 가능성.
5. **IsValidNewGoal의 기루다 변경 비용**: 손패 13장(키티 받은 직후)이면 +2, 10장이면 +1. 게임 흐름의 최종 검증은 버린 뒤(10장)라 실질적으로 +1만 요구됨. 의도가 "+2"인지 불명.
6. **선거 즉시 종료 조건**: goal≥20이면 R[0xd](25까지 허용)이어도 즉시 당선 → 20 초과 공약은 선거 중엔 사실상 불가능(최종 공약 변경 단계에서만 가능). 의도인지 버그인지 불명.
7. **S[0x78] += 10** (WriteHistory) 의 의미 불명. S[0xd4], S[0xd8], S[0xdc] 용도 미확정. S[0xb4] 용도는 추정.
8. 프렌드가 카드 지정인데 그 카드가 아무 손에도 없으면 friend=-1이지만 S[0xd0]≠0 이므로 정산에서 `money[-1]`에 접근(배열 범위 밖) — 원작 버그로 보임. 실제로는 GetValidFriend가 키티·주공패 카드를 막으므로 6마 탈락자 패 등 특수상황에서만 발생 가능.
9. GetGoalString의 속어 표기("독","닷","홉","풀","초","기노")의 정확한 의미는 문자열로만 확인, 의미 해석은 추정.
10. 6마 탈락 지목 루프(`FUN_00420cb0`)의 기본 지목 카드는 1(♠A); S[0xb4]에 기록되는 것으로 보이나 용도 미확인.
11. 딜 순서/선거 순서는 인덱스 +1 방향. R[0x04](시계방향)는 화면 좌석 배치에만 쓰이는 것으로 보임(로직 함수에서 미참조).
12. Suffle/rand 시드(srand 위치)는 미조사 — 웹 버전에선 재현 불필요.
