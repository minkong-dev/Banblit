// 여러 화면이 함께 쓰는 배치 부품입니다. 카드 한 장, 카드의 제목 줄, 탭 줄, 패널입니다.
// 스타일은 shell.css 가 정의하고, 그 파일은 상단바·사이드바를 그리는 AppShell 이 불러옵니다.
//
// AppShell 과 분리해 둡니다 — 카드 하나를 쓰는 화면이 router hook·알림 메뉴·테마 버튼까지
// 함께 import 하지 않게 합니다. 이 파일은 ReactNode 타입 하나에만 의존합니다.

import type { ReactNode } from "react";

/** 흰 카드 한 장입니다. 내부 배치는 각 화면의 CSS가 정의합니다. */
export function Card({ children }: { children: ReactNode }) {
  return <div className="card">{children}</div>;
}

/** 카드의 제목 줄입니다. 제목, 설명, 오른쪽 부속(children — 필터·이전/다음 버튼)을 표시합니다. */
export function SectionHead({ title, desc, children }: { title: string; desc: string; children?: ReactNode }) {
  return (
    <div className="sethead">
      <b>{title}</b>
      <span>{desc}</span>
      {children}
    </div>
  );
}

export function Tabs<T extends string>(props: {
  label: string;
  items: readonly { key: T; text: string }[];
  selected: T;
  onSelect: (key: T) => void;
}) {
  const { label, items, selected, onSelect } = props;
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {items.map((item) => (
        <button key={item.key} className="tab" role="tab"
          aria-selected={item.key === selected} onClick={() => onSelect(item.key)}>
          {item.text}
        </button>
      ))}
    </div>
  );
}

/** 오른쪽 칸의 구역 하나입니다. onOpen 을 넘기면 제목 줄이 그 화면으로 가는 버튼이 됩니다. */
export function Panel(props: {
  title: string;
  hint?: string;
  onOpen?: () => void;
  children: ReactNode;
}) {
  const { title, hint, onOpen, children } = props;
  const head = <>{title}{hint === undefined ? null : <span>{hint}</span>}</>;
  return (
    <section className="panel">
      {onOpen === undefined
        ? <div className="ph">{head}</div>
        : <button className="ph" onClick={onOpen}>{head}</button>}
      {children}
    </section>
  );
}
