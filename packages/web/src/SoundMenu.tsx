// 소리 메뉴: 효과음 / 음성 안내를 따로 켜고 끄고, 음성은 종류별로 고르고 크기를 정한다 (이 브라우저에 저장).

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { setSoundEnabled, useSoundEnabled } from './sound.js';
import { VOICE_KINDS, setVoice, speak, useVoice } from './voice.js';

export function SoundMenu({ up = false }: { up?: boolean }) {
  const fx = useSoundEnabled();
  const v = useVoice();
  const [open, setOpen] = useState(false);
  // 상태 표시줄은 넘치는 것을 자르므로 화면 기준(fixed) 위치로 띄운다
  const [pos, setPos] = useState<CSSProperties>({});
  const toggle = () => {
    const r = box.current?.getBoundingClientRect();
    if (r) setPos(up ? { right: innerWidth - r.right, bottom: innerHeight - r.top + 6 } : { right: innerWidth - r.right, top: r.bottom + 6 });
    setOpen((o) => !o);
  };
  const box = useRef<HTMLDivElement>(null);
  // 바깥을 누르면 닫는다
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  const label = fx || v.on ? `♪ 소리${fx && v.on ? '' : fx ? ' (효과음만)' : ' (음성만)'}` : '♪ 소리 끔';
  return (
    <div className="sound-menu" ref={box}>
      <button className={`sound-toggle ${fx || v.on ? 'on' : 'off'}`} onClick={toggle} aria-expanded={open}>
        {label}
      </button>
      {open && (
        <div className="sound-pop" style={pos}>
          <label className="sp-main">
            <input type="checkbox" checked={fx} onChange={(e) => setSoundEnabled(e.target.checked)} /> 효과음 <span className="hint">카드 소리·차례 알림음</span>
          </label>
          <label className="sp-main">
            <input type="checkbox" checked={v.on} onChange={(e) => setVoice({ on: e.target.checked })} /> 음성 안내 <span className="hint">말로 읽어 주기</span>
          </label>
          <div className={`sp-voice ${v.on ? '' : 'off'}`}>
            <div className="sp-row">
              음성 크기
              <input type="range" min={0.1} max={1} step={0.05} value={v.volume} disabled={!v.on} onChange={(e) => setVoice({ volume: Number(e.target.value) })} />
              <button disabled={!v.on} onClick={() => speak('callout', '마이티!')}>
                들어 보기
              </button>
            </div>
            {VOICE_KINDS.map((k) => (
              <label key={k.id} title={k.hint}>
                <input type="checkbox" checked={v.kinds[k.id]} disabled={!v.on} onChange={(e) => setVoice({ kinds: { ...v.kinds, [k.id]: e.target.checked } })} /> {k.name}
                <span className="hint"> {k.hint}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
