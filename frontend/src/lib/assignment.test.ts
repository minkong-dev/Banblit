import { describe, expect, it } from "vitest";

import { hoursOf, tabKey, viewOf } from "./assignment";

describe("tabKey / viewOf", () => {
  it("View 를 탭 키로 바꾼 뒤 다시 View 로 되돌리면 같은 값이다", () => {
    const views = [
      { kind: "now" as const },
      { kind: "proposal" as const, index: 2 },
      { kind: "round" as const, at: "2026-09-14T18:00:00" },
    ];
    for (const view of views) expect(viewOf(tabKey(view))).toEqual(view);
  });
});

describe("hoursOf", () => {
  it("합주 목록의 총 시간을 시간 단위 소수로 반환한다", () => {
    const sessions = [
      { team: "A", room: "1", start: "2026-09-14T18:00:00", end: "2026-09-14T19:30:00" },
      { team: "B", room: "1", start: "2026-09-14T20:00:00", end: "2026-09-14T21:00:00" },
    ];
    expect(hoursOf(sessions)).toBe(2.5);
  });
});
