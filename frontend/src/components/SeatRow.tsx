// 좌석·멤버 목록 행 하나입니다. 왼쪽에 이름표(있으면), 가운데 이름 또는 "지정되지 않았어요",
// 오른쪽에 조치 버튼(있으면)을 표시합니다. routes/Teams.tsx 의 Lineup·SeatRows,
// routes/SettingsMembers.tsx 의 GrantModal holders 목록 3곳이 이 부품을 씁니다.

import type { ReactNode } from "react";

export function SeatRow(props: {
  /** 포지션 이름표입니다. 없으면 이름표 칸을 그리지 않습니다. */
  label?: string;
  /** 지정된 사람 이름입니다. null 이면 지정되지 않은 자리입니다. */
  name: string | null;
  /** 조치 버튼(검색·삭제)입니다. 없으면 오른쪽 칸을 그리지 않습니다. */
  actions?: ReactNode;
  /** 행 끝에 추가로 렌더할 내용입니다(멤버 검색 Modal 등). */
  children?: ReactNode;
}) {
  const { label, name, actions, children } = props;
  return (
    <li className={name === null ? "seat open" : "seat"}>
      {label === undefined ? null : <span className="part">{label}</span>}
      {name === null
        ? <span className="who none">멤버가 지정되지 않았어요</span>
        : <span className="who">{name}</span>}
      {actions === undefined ? null : <span className="acts">{actions}</span>}
      {children}
    </li>
  );
}
