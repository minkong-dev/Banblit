// SeatRow 는 렌더링 없이 반환된 React element 트리를 직접 조사합니다(Modal.test.tsx 와 같은 방식).
// Teams.tsx 의 Lineup·SeatRows, SettingsMembers.tsx 의 GrantModal holders 목록이 각자 다시 작성하던
// "왼쪽 이름표, 가운데 이름, 오른쪽 조치 버튼" 행 하나를 공용으로 둡니다.

import { describe, expect, it } from "vitest";
import type { ReactElement, ReactNode } from "react";

import { SeatRow } from "./SeatRow";

type Node = ReactElement<{ className?: string; children?: ReactNode }>;

function props(el: Node): { className?: string; children?: ReactNode } {
  return el.props;
}

describe("SeatRow — 좌석·멤버 목록 행", () => {
  it("name 이 null 이면 지정되지 않았다는 문구와 seat open class 를 쓴다", () => {
    const el = SeatRow({ label: "드럼", name: null }) as Node;

    expect(props(el).className).toBe("seat open");
    const [part, who] = props(el).children as Node[];
    expect(props(part).children).toBe("드럼");
    expect(props(who).className).toBe("who none");
    expect(props(who).children).toBe("멤버가 지정되지 않았어요");
  });

  it("name 이 있으면 seat class 와 이름을 그대로 표시한다", () => {
    const el = SeatRow({ label: "드럼", name: "여섯줄 (25)" }) as Node;

    expect(props(el).className).toBe("seat");
    const [, who] = props(el).children as Node[];
    expect(props(who).className).toBe("who");
    expect(props(who).children).toBe("여섯줄 (25)");
  });

  it("label 을 생략하면 이름표 칸을 그리지 않는다 — 권한 보유자 목록처럼 포지션이 없는 목록", () => {
    const el = SeatRow({ name: "김민수" }) as Node;
    const [part] = props(el).children as (Node | null)[];

    expect(part).toBe(null);
  });

  it("actions·children 을 그대로 전달한다", () => {
    const actions = <span>actions</span>;
    const children = <span>children</span>;
    const el = SeatRow({ name: "김민수", actions, children }) as Node;
    const [, , actsSpan, childrenSlot] = props(el).children as Node[];

    expect(props(actsSpan).className).toBe("acts");
    expect(props(actsSpan).children).toBe(actions);
    expect(childrenSlot).toBe(children);
  });
});
