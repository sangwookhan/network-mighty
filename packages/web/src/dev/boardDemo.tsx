// 개발용 화면 데모: 서버 없이 고정 상태(dev/fixtures/*.json)를 그대로 그린다.
// 화면 정리 전후 비교, 디자인 작업에 쓴다. 고정 상태는 server/scripts/fixtures.ts 로 다시 만든다.
import type { RoomView } from '@mighty/protocol';
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { RoomScreen } from '../Room.js';
import '../styles/index.css';

const fixtures = import.meta.glob<RoomView>('../../dev/fixtures/*.json', { eager: true, import: 'default' });
const byName = Object.fromEntries(Object.entries(fixtures).map(([path, room]) => [path.split('/').pop()!.replace('.json', ''), room]));
const params = new URLSearchParams(location.search);
const name = params.get('f') ?? '';
const room = byName[name];
// ?f=5p-play&then=5p-result : 1.5초 뒤 다음 상태로 바꿔 그린다 (상태 변화에 따른 효과음·음성 시험용)
const then = params.get('then');

function Demo() {
  const [r, setR] = useState(room);
  useEffect(() => {
    if (!then || !byName[then]) return;
    const t = setTimeout(() => setR(byName[then]), 1500);
    return () => clearTimeout(t);
  }, []);
  return <RoomScreen room={r} />;
}

createRoot(document.getElementById('root')!).render(
  room ? (
    <Demo />
  ) : (
    <div className="center-box">
      <h1>화면 데모</h1>
      {Object.keys(byName)
        .sort()
        .map((n) => (
          <p key={n}>
            <a href={`?f=${n}`}>{n}</a>
          </p>
        ))}
    </div>
  ),
);
