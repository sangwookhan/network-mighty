// 내 차례에 나오는 입력 패널: 공약, 6마 탈락 지목, 주공 정리(버리기·공약·프렌드), 판 결과

import {
  JOKER,
  NO_SUIT,
  SUITS,
  adviseFinal,
  defaultFriend,
  goalRange,
  isValidBid,
  isValidFinalContract,
  isValidFriend,
  makeCard,
  mightyOf,
  minFinalGoal,
  powerOf,
  suitOf,
  type Bid,
  type Card,
  type Suit,
} from '@mighty/engine';
import type { FriendChoice, GameView, RoomView } from '@mighty/protocol';
import { useMemo, useState } from 'react';
import { CardPicker, CardView, SUIT_NAME, SUIT_SYMBOL, contractText, shortName, sortHand } from './cards.js';
import { act } from './net.js';

const KIRUDA_OPTIONS: Suit[] = [1, 2, 3, 4, NO_SUIT];
const kirudaLabel = (k: Suit) => (k === NO_SUIT ? '노기루다' : `${SUIT_SYMBOL[k]} ${SUIT_NAME[k]}`);

export function bidText(b: Bid): string {
  if (b.type === 'pass') return '포기';
  if (b.type === 'dealMiss') return '딜 미스';
  return contractText(b.kiruda, b.goal);
}

/**
 * 내 패에 가장 좋은 기루다: 장수가 많은 무늬, 같으면 세기 합이 큰 무늬.
 * (마이티·조커는 무늬와 상관없이 세므로 빼고 센다)
 */
export function recommendKiruda(hand: readonly Card[], rules: RoomView['rules']): Suit {
  const mighty = mightyOf(rules, NO_SUIT);
  let best: Suit = 1;
  let bestScore = -1;
  for (const k of SUITS) {
    const cards = hand.filter((c) => c !== JOKER && c !== mighty && suitOf(c) === k);
    const score = cards.length * 100 + cards.reduce((a, c) => a + powerOf(c), 0);
    if (score > bestScore) (best = k), (bestScore = score);
  }
  return best;
}

/** 무늬 아이콘 버튼 줄 (원작 공약 상자: ♠◆♥♣ 노기루다) */
export function SuitButtons({ value, onChange, recommended }: { value: Suit; onChange: (k: Suit) => void; recommended?: Suit }) {
  return (
    <div className="suit-buttons">
      {KIRUDA_OPTIONS.map((k) => (
        <button
          key={k}
          className={`suit-btn ${k === value ? 'on' : ''} ${k === 2 || k === 3 ? 'red' : ''}`}
          onClick={() => onChange(k)}
          title={kirudaLabel(k)}
          data-kiruda={k}
        >
          {k === NO_SUIT ? '노기' : SUIT_SYMBOL[k]}
          {k === recommended && <span className="rec">추천</span>}
        </button>
      ))}
    </div>
  );
}

/** △▽ 로 바꾸는 점수 */
function GoalStepper({ value, options, onChange }: { value: number | null; options: number[]; onChange: (g: number) => void }) {
  const i = value === null ? -1 : options.indexOf(value);
  return (
    <span className="stepper">
      <button disabled={i <= 0} onClick={() => onChange(options[i - 1])} aria-label="낮추기">
        ▽
      </button>
      <b className="goal-value">{value ?? '-'}</b>
      <button disabled={i < 0 || i >= options.length - 1} onClick={() => onChange(options[i + 1])} aria-label="올리기">
        △
      </button>
    </span>
  );
}

/** kiruda/setKiruda 는 판(Board)이 들고 있어서, 내 차례가 다시 와도 고른 기루다가 유지된다 */
export function BidPanel({ room, game, kiruda, setKiruda, recommended }: {
  room: RoomView;
  game: GameView;
  kiruda: Suit;
  setKiruda: (k: Suit) => void;
  recommended: Suit;
}) {
  const rules = room.rules;
  const es = game.election!;
  const hand = game.myHand;
  const goals = useMemo(() => {
    const { min, max } = goalRange(rules, kiruda);
    const out: number[] = [];
    for (let g = min; g <= max; g++) if (isValidBid(es, { type: 'bid', kiruda, goal: g }, hand, rules)) out.push(g);
    return out;
  }, [rules, es, hand, kiruda]);
  const [goal, setGoal] = useState<number | null>(null);
  const g = goal !== null && goals.includes(goal) ? goal : (goals[0] ?? null);
  const canPass = isValidBid(es, { type: 'pass' }, hand, rules);
  const canDealMiss = isValidBid(es, { type: 'dealMiss' }, hand, rules);
  return (
    <div className="panel" data-panel="bid">
      <div className="row">
        <SuitButtons value={kiruda} onChange={setKiruda} recommended={recommended} />
        <GoalStepper value={g} options={goals} onChange={setGoal} />
      </div>
      <div className="row text-buttons">
        <button disabled={!canPass} onClick={() => act({ kind: 'bid', bid: { type: 'pass' } })} title={canPass ? '' : '선은 처음에 포기할 수 없습니다'}>
          포기
        </button>
        <button disabled={g === null} onClick={() => g !== null && act({ kind: 'bid', bid: { type: 'bid', kiruda, goal: g } })}>
          출마 !!
        </button>
        {canDealMiss && (
          <button className="dealmiss" onClick={() => act({ kind: 'bid', bid: { type: 'dealMiss' } })}>
            딜미스 !!
          </button>
        )}
      </div>
    </div>
  );
}

export function KillPanel({ game }: { game: GameView }) {
  const req = game.myRequest;
  const failed = req?.kind === 'kill' ? req.failed : [];
  return (
    <div className="panel" data-panel="kill">
      <h3>한 명을 탈락시킵니다</h3>
      <p>카드를 하나 고르면 그 카드를 가진 사람이 이번 판에서 빠집니다.</p>
      {failed.length > 0 && <p className="hint">아무도 없던 카드: {failed.map(shortName).join(', ')}</p>}
      <CardPicker label="지목" isAllowed={(c) => !game.myHand.includes(c) && !failed.includes(c)} onPick={(card) => act({ kind: 'kill', card })} />
    </div>
  );
}

export function FinalPanel({ room, game, discards, setDiscards }: {
  room: RoomView;
  game: GameView;
  discards: Card[];
  setDiscards: (f: (d: Card[]) => Card[]) => void;
}) {
  const rules = room.rules;
  const elected = game.electedContract!;
  const hand13 = game.myHand;
  // 처음 프렌드는 엔진의 기본 선택 (시간 초과로 서버가 대신 진행할 때와 같다)
  const [initialFriend] = useState(() => defaultFriend(hand13, elected.kiruda, rules));
  const [kiruda, setKiruda] = useState<Suit>(elected.kiruda);
  const [goal, setGoal] = useState(elected.goal);
  const [friendKind, setFriendKind] = useState<FriendChoice['kind']>(initialFriend.kind);
  const [friendSeat, setFriendSeat] = useState<number>(game.active.find((s) => s !== game.master) ?? 0);
  const [friendCard, setFriendCard] = useState<Card>(initialFriend.kind === 'card' ? initialFriend.card : mightyOf(rules, elected.kiruda));
  const [advice, setAdvice] = useState<string | null>(null);

  const masterHand = hand13.filter((c) => !discards.includes(c));
  const contract = { kiruda, goal };
  const contractOk = isValidFinalContract(elected, contract, rules);
  const friend: FriendChoice =
    friendKind === 'player' ? { kind: 'player', seat: friendSeat } : friendKind === 'card' ? { kind: 'card', card: friendCard } : { kind: friendKind };
  const engineFriend = friend.kind === 'player' ? { kind: 'player' as const, seat: game.active.indexOf(friend.seat) } : friend;
  const friendOk =
    discards.length === 3 &&
    isValidFriend(engineFriend, { rules, n: game.active.length, master: game.active.indexOf(game.master!), masterHand, discards });
  const { max } = goalRange(rules, kiruda);
  const min = minFinalGoal(elected, kiruda, rules);

  // 원작 프렌드 상자의 빠른 선택 (마이티/조커/기루다A/K/초구/노 프랜드)
  const k = kiruda;
  const quick: { label: string; choice: FriendChoice }[] = [
    { label: '마이티', choice: { kind: 'card', card: mightyOf(rules, k) } },
    { label: '조커', choice: { kind: 'card', card: JOKER } },
    ...(k !== NO_SUIT
      ? [
          { label: '기루다 A', choice: { kind: 'card', card: makeCard(k, 1) } as FriendChoice },
          { label: '기루다 K', choice: { kind: 'card', card: makeCard(k, 13) } as FriendChoice },
        ]
      : []),
    { label: '초구', choice: { kind: 'firstTrick' } },
    { label: '노 프랜드', choice: { kind: 'none' } },
  ];
  const sameChoice = (a: FriendChoice, b: FriendChoice) => JSON.stringify(a) === JSON.stringify(b);
  const pick = (c: FriendChoice) => {
    setFriendKind(c.kind);
    if (c.kind === 'card') setFriendCard(c.card);
    if (c.kind === 'player') setFriendSeat(c.seat);
  };
  const validFor = (c: FriendChoice) => {
    const e = c.kind === 'player' ? { kind: 'player' as const, seat: game.active.indexOf(c.seat) } : c;
    return isValidFriend(e, { rules, n: game.active.length, master: game.active.indexOf(game.master!), masterHand, discards });
  };

  // 추천: 봇과 같은 계산(엔진 adviseFinal)으로 버릴 카드·기루다·공약·프렌드를 채운다
  const applyAdvice = () => {
    const a = adviseFinal(hand13, elected, rules);
    setDiscards(() => a.discards);
    setKiruda(a.contract.kiruda);
    setGoal(a.contract.goal);
    pick(a.friend.kind === 'player' ? { kind: 'player', seat: game.active[a.friend.seat] } : a.friend);
    setAdvice(a.reason);
  };

  // 한눈에 보는 요약: 지금 고른 기루다·공약과 프렌드
  const quickLabel = friend.kind === 'card' ? quick.find((q) => sameChoice(q.choice, friend))?.label : undefined;
  const friendTitle =
    friend.kind === 'card'
      ? (quickLabel ?? shortName(friend.card))
      : friend.kind === 'none'
        ? '노 프랜드'
        : friend.kind === 'firstTrick'
          ? '초구'
          : room.seats[friend.seat].nickname;
  const friendSub =
    friend.kind === 'card'
      ? quickLabel
        ? `${shortName(friend.card)} 가진 사람`
        : '이 카드를 가진 사람'
      : friend.kind === 'none'
        ? '혼자 칩니다'
        : friend.kind === 'firstTrick'
          ? '첫 트릭을 이긴 사람'
          : '지목한 사람';
  const changed = kiruda !== elected.kiruda || goal !== elected.goal;

  return (
    <div className="panel final" data-panel="final">
      <div className="final-summary">
        <div className="fs-item">
          <span className={`kiruda-tile ${kiruda === 2 || kiruda === 3 ? 'red' : ''} ${kiruda === NO_SUIT ? 'nokiruda' : ''}`}>
            {kiruda === NO_SUIT ? '노기' : SUIT_SYMBOL[kiruda]}
          </span>
          <div className="fs-text">
            <span className="fs-label">기루다 · 공약</span>
            <b className="fs-main">
              {kiruda === NO_SUIT ? '노기루다' : SUIT_NAME[kiruda]} <span className="fs-goal">{goal}</span>
            </b>
            <span className="fs-sub">{changed ? `당선 때 ${contractText(elected.kiruda, elected.goal)}에서 바꿈` : '당선 공약 그대로'}</span>
          </div>
        </div>
        {rules.friendEnabled && (
          <div className="fs-item fs-friend">
            {friend.kind === 'card' ? (
              <span className="fs-card">
                <CardView card={friend.card} rules={rules} kiruda={kiruda} />
              </span>
            ) : (
              <span className="fs-word">{friend.kind === 'none' ? '없음' : friend.kind === 'firstTrick' ? '초구' : '지목'}</span>
            )}
            <div className="fs-text">
              <span className="fs-label">프렌드</span>
              <b className="fs-main">{friendTitle}</b>
              <span className="fs-sub">{friendSub}</span>
            </div>
          </div>
        )}
      </div>

      <div className="final-cols">
        <section className="final-col">
          <h4>기루다 · 공약</h4>
          <div className="final-suits">
            <SuitButtons
              value={kiruda}
              onChange={(k) => {
                // 기루다를 바꾸면 규칙상 최소 공약으로, 원래 기루다로 돌아오면 당선 공약으로
                setKiruda(k);
                setGoal(minFinalGoal(elected, k, rules));
              }}
            />
          </div>
          <div className="row">
            <span className="stepper">
              <button disabled={goal <= min} onClick={() => setGoal(goal - 1)} aria-label="낮추기">
                ▽
              </button>
              <b className="goal-value">{goal}</b>
              <button disabled={goal >= max} onClick={() => setGoal(goal + 1)} aria-label="올리기">
                △
              </button>
            </span>
            {!contractOk && <span className="error">{kiruda === elected.kiruda ? '공약을 낮출 수 없습니다' : '기루다를 바꾸려면 공약을 더 올려야 합니다'}</span>}
          </div>
        </section>
        {rules.friendEnabled ? (
          <section className="final-col friend-col">
            <h4>프렌드</h4>
            <div className="friend-chips">
              {quick.map((q) => (
                <button key={q.label} className={sameChoice(q.choice, friend) ? 'on' : ''} disabled={discards.length === 3 && !validFor(q.choice)} onClick={() => pick(q.choice)}>
                  {q.label}
                </button>
              ))}
            </div>
            <div className="friend-chips players">
              {game.active
                .filter((s) => s !== game.master)
                .map((s) => {
                  const c: FriendChoice = { kind: 'player', seat: s };
                  return (
                    <button key={s} className={sameChoice(c, friend) ? 'on' : ''} onClick={() => pick(c)}>
                      {room.seats[s].nickname}
                    </button>
                  );
                })}
            </div>
            <div className="row">
              <span className="hint">다른 카드:</span>
              <CardPicker label="선택" isAllowed={(c) => !masterHand.includes(c) && !discards.includes(c)} onPick={(card) => pick({ kind: 'card', card })} />
            </div>
          </section>
        ) : (
          <section className="final-col friend-col">
            <h4>프렌드</h4>
            <p className="hint">이 규칙은 프랜드가 없습니다</p>
          </section>
        )}
      </div>

      <div className="final-foot">
        <span>
          버릴 카드 <b>({discards.length}/3)</b>
          {discards.length > 0 && <span className="final-discards"> {discards.map(shortName).join(' ')}</span>}
        </span>
        <span className="text-buttons">
          <button onClick={applyAdvice} title="버릴 카드·기루다·공약·프렌드를 추천대로 채웁니다">추천</button>
        </span>
        {advice && <span className="advice">{advice}</span>}
        <span className="spacer" />
        {discards.length === 3 && !friendOk && <span className="error">이 프랜드는 지정할 수 없습니다</span>}
        {discards.length < 3 && <span className="hint">아래 패에서 버릴 카드 3장을 고르세요</span>}
        <button className="final-confirm" disabled={!contractOk || !friendOk} onClick={() => act({ kind: 'final', discards, contract, friend })}>
          확정
        </button>
      </div>
    </div>
  );
}

export function ResultPanel({ room, game }: { room: RoomView; game: GameView }) {
  const r = game.result!;
  const s = r.settlement;
  const me = room.me.seat;
  const asked = game.myRequest?.kind === 'continue';
  const myVote = me !== null ? r.continueVotes[me] : null;
  const isDef = (i: number) => i === r.master || i === r.friend;
  const delta = (i: number) => r.after[i] - r.before[i];
  const signed = (d: number) => (d > 0 ? `+${d}` : `${d}`);
  const goal = Math.min(r.contract.goal, 20);
  const killed = game.killed;
  const seats = room.seats.map((_, i) => i).filter((i) => i !== killed);
  const defSeats = seats.filter(isDef);
  const oppSeats = seats.filter((i) => !isDef(i));
  // 나 기준 결과
  const myWon = me !== null && me !== killed ? isDef(me) === s.defenderWon : null;
  const diff = s.defenderPoints - goal;

  const TeamCol = ({ title, list, won }: { title: string; list: number[]; won: boolean }) => (
    <div className={`team ${won ? 'won' : 'lost'}`}>
      <div className="team-head">
        {title} <span className="team-tag">{won ? '승' : '패'}</span>
      </div>
      {list.map((i) => (
        <div key={i} className={`member ${i === me ? 'me' : ''}`}>
          <span className="who">
            {room.seats[i].nickname}
            {i === r.master && <span className="badge master">주공</span>}
            {i === r.friend && <span className="badge friend">프렌드</span>}
          </span>
          <span className={`delta ${delta(i) > 0 ? 'plus' : delta(i) < 0 ? 'minus' : ''}`}>{signed(delta(i))}</span>
          <span className="total">{r.after[i]}</span>
          <span className="vote">{r.continueVotes[i] === null ? '…' : r.continueVotes[i] ? '계속' : '그만'}</span>
        </div>
      ))}
    </div>
  );

  return (
    <div className="panel result" data-panel="result">
      <div className={`result-banner ${s.defenderWon ? 'def' : 'opp'}`}>{s.defenderWon ? '여당 승리' : '야당 승리'}</div>
      {myWon !== null && (
        <div className={`my-result ${myWon ? 'win' : 'lose'}`}>
          {myWon ? '이겼습니다' : '졌습니다'} <b>{signed(delta(me!))}</b>
        </div>
      )}

      <div className="score-line">
        <div className="score def">
          <span className="label">여당</span>
          <b>{s.defenderPoints}</b>
        </div>
        <div className="score goal">
          <span className="label">공약 {contractText(r.contract.kiruda, r.contract.goal)}</span>
          <b>{r.contract.goal}</b>
          <span className="diff">{diff >= 0 ? (diff === 0 ? '딱 맞춤' : `${diff}장 넘김`) : `${-diff}장 모자람`}</span>
        </div>
        <div className="score opp">
          <span className="label">야당</span>
          <b>{s.oppositionPoints}</b>
        </div>
      </div>

      {/* 20칸 막대: 여당이 딴 만큼 채우고, 공약 위치에 선 */}
      <div className="score-bar" aria-label={`여당 ${s.defenderPoints} / 20, 공약 ${goal}`}>
        {Array.from({ length: 20 }, (_, k) => (
          <span key={k} className={`cell ${k < s.defenderPoints ? 'def' : 'opp'} ${k === goal - 1 ? 'goal' : ''}`} />
        ))}
      </div>

      <div className="teams">
        <TeamCol title="여당" list={defSeats} won={s.defenderWon} />
        <TeamCol title="야당" list={oppSeats} won={!s.defenderWon} />
      </div>

      <div className="formula">계산: {s.formula}</div>

      {asked && (
        <div className="row text-buttons result-buttons">
          <button className="confirm" onClick={() => act({ kind: 'continue', cont: true })}>
            계속
          </button>
          <button onClick={() => act({ kind: 'continue', cont: false })}>그만 (관전으로)</button>
        </div>
      )}
      {myVote !== null && !asked && <p className="hint">다른 사람을 기다리는 중…</p>}
    </div>
  );
}
