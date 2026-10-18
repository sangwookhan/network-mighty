// 서버 시스템 안내(채팅의 시스템 줄)를 읽을 말과 종류로 바꾼다. 읽지 않을 줄이면 null.

import type { VoiceKind } from './voice.js';

type Rule = [RegExp, VoiceKind, (m: RegExpExecArray) => string];

const RULES: Rule[] = [
  // 게임 진행
  [/^(\d+)번째 판: (.+)님부터 공약합니다$/, 'deal', (m) => `${m[1]}번째 판, ${m[2]}님부터`],
  [/^(.+)님의 딜 미스!/, 'deal', (m) => `${m[1]}님 딜 미스, 다시 섞습니다`],
  [/^모두 포기해서 다시 섞습니다$/, 'deal', () => '모두 포기, 다시 섞습니다'],
  [/^.+: (.+)님이 이번 판에서 빠집니다$/, 'deal', (m) => `${m[1]}님 탈락`],
  [/^(.+)님이 (.+)\(으\)로 당선$/, 'contract', (m) => `${m[1]}님 당선, ${m[2]}`],
  [/^최종 공약: (.+), 프렌드: (.+)$/, 'contract', (m) => `최종 공약 ${m[1]}, 프렌드 ${m[2]}`],
  [/^프렌드 공개: (.+)님$/, 'friend', (m) => `프렌드는 ${m[1]}님`],
  [/^초구 프렌드: (.+)님$/, 'friend', (m) => `초구 프렌드 ${m[1]}님`],
  [/^주공이 초구를 따서 노프렌드로 진행합니다$/, 'friend', () => '주공이 초구를 따서 노프렌드'],
  [/^(여당|야당) 승리 \(여당 (\d+)점\)/, 'result', (m) => `${m[1]} 승리, 여당 ${m[2]}점`],
  [/^게임을 시작합니다/, 'room', () => '게임을 시작합니다'],
  // 사람·방 소식 (첫 문장만)
  [/^(.+)님이 들어왔습니다 \(관전\)$/, 'room', (m) => `${m[1]}님이 관전하러 입장했습니다`],
  [/^(.+)님이 들어왔습니다$/, 'room', (m) => `${m[1]}님이 입장했습니다`],
  [/나갔습니다|관전합니다|자리에 앉았습니다|넘겨받았습니다|연결이 끊겼습니다|돌아왔습니다|방장이 되었습니다|내보냈습니다|일시정지했습니다|다시 시작했습니다|제한 시간을/, 'room', (m) => m.input.split('. ')[0]],
];

export function voiceForSystemLine(text: string, myName?: string): { kind: VoiceKind; text: string } | null {
  for (const [re, kind, say] of RULES) {
    const m = re.exec(text);
    if (!m) continue;
    // 내가 한 방 소식은 읽지 않는다 (내가 방장이 된 것은 알려 준다)
    if (kind === 'room' && myName && text.startsWith(`${myName}님`) && !text.includes('방장이 되었습니다')) return null;
    return { kind, text: say(m) };
  }
  return null;
}
