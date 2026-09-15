import { describe, expect, it } from "vitest";

import { offByDay, repeatDays, visible } from "./dayEntries";
import type { Entry } from "./dayEntries";
import type { Unavailable } from "./contract";

const weekly: Unavailable = {
  id: 7,
  member_id: 1,
  starts_at: "2026-09-14T18:00:00",
  ends_at: "2026-09-14T20:00:00",
  repeats_daily: false,
  repeats_weekly: true,
  repeat_until: "2026-09-28",
  reason: null,
};

const days = ["2026-09-13", "2026-09-14", "2026-09-21", "2026-09-22", "2026-09-28", "2026-10-05"];

describe("repeatDays", () => {
  it("매주 반복은 시작일부터 repeat_until 까지 7일 간격의 날짜만 반환한다", () => {
    expect(repeatDays(weekly, days)).toEqual(["2026-09-14", "2026-09-21", "2026-09-28"]);
  });
});

describe("offByDay", () => {
  it("전개한 날짜에는 removeIds 가 없고, 원본 날짜에만 있다", () => {
    const byDay = offByDay([weekly], 18, days);
    expect(byDay["2026-09-14"][0].removeIds).toEqual([7]);
    expect(byDay["2026-09-21"][0].removeIds).toBeUndefined();
  });
});

describe("visible", () => {
  const entries: Entry[] = [
    { kind: "assign", team: "c1", a: 0, b: 1 },
    { kind: "assign", team: "c2", a: 1, b: 2 },
    { kind: "off", team: null, a: 2, b: 3 },
  ];
  const teams = [
    { id: 1, name: "A", key: "c1", mine: true },
    { id: 2, name: "B", key: "c2", mine: false },
  ];

  it("내 일정 탭은 내 팀의 배정과 불가능 일정만 반환한다", () => {
    expect(visible(entries, "me", teams).map((entry) => entry.kind)).toEqual(["assign", "off"]);
  });

  it("전체 일정 탭은 불가능 일정을 제외한다", () => {
    expect(visible(entries, "all", teams)).toHaveLength(2);
  });
});
