// 원작의 반투명 상자(DSB)

import type { CSSProperties, ReactNode } from 'react';

/** 원작의 반투명 메시지 상자 */
export function Dsb({ title, children, className, style }: { title?: ReactNode; children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div className={`dsb ${className ?? ''}`} style={style}>
      {title && <div className="dsb-title">{title}</div>}
      <div className="dsb-body">{children}</div>
    </div>
  );
}
