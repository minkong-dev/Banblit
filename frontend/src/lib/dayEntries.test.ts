import { describe, expect, it } from "vitest";

import { ensembleByDay, ensembleOn, offByDay, repeatDays, visible } from "./dayEntries";
import type { Entry } from "./dayEntries";
import type { Period, Unavailable } from "./contract";

const withEnsemble: Period = {
  id: 3,
  kind: "focused",
  starts_on: "2026-09-01",
  ends_on: "2026-09-20",
  everyday: false,
  first_run_at: "09:00",
  second_run_at: "21:00",
  ensemble: {
    starts_on: "2026-09-11",
    ends_on: "2026-09-13",
    room_id: 1,
    starts_at: "19:00",
    ends_at: "22:00",
    days: [{ day: "2026-09-12", starts_at: "18:00", ends_at: "20:30" }],
  },
};

describe("ensembleOn", () => {
  it("범위 안의 날짜는 기본 시각을 돌려준다", () => {
    expect(ensembleOn([withEnsemble], "2026-09-11")).toEqual({
      periodId: 3, roomId: 1, startsAt: "19:00", endsAt: "22:00", custom: false,
    });
  });

  it("날짜별로 지정한 시각이 기본 시각보다 우선한다", () => {
    expect(ensembleOn([withEnsemble], "2026-09-12")).toEqual({
      periodId: 3, roomId: 1, startsAt: "18:00", endsAt: "20:30", custom: true,
    });
  });

  it("범위 밖이거나 전체합주가 없는 기간이면 null 이다", () => {
    expect(ensembleOn([withEnsemble], "2026-09-14")).toBeNull();
    expect(ensembleOn([{ ...withEnsemble, ensemble: null }], "2026-09-11")).toBeNull();
  });
});

describe("ensembleByDay", () => {
  it("전체합주 날짜에 합주실 이름과 시각을 담은 항목 하나를 둔다", () => {
    const rooms = [{ id: 1, name: "합주실 A", opens_at: "18:00", closes_at: "23:00" }];
    const byDay = ensembleByDay([withEnsemble], rooms, 18, ["2026-09-12", "2026-09-14"]);
    expect(byDay).toEqual({
      "2026-09-12": [{ kind: "ensemble", team: null, room: "합주실 A", who: "전체합주", a: 0, b: 2.5 }],
    });
  });
});

const weekly: Unavailable = {
  id: 7,
  member_id: 1,
  starts_at: "2026-09-14T18:00:00",
  ends_at: "2026-09-14T20:00:00",
  repeats_daily: false,
  repeats_weekly: true,
  repeat_until: "2026-09-28",
  reason: null,
  name: null,
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

  it("일정 이름이 표시 이름이고, 없으면 불가능 일정이다. 사유는 note 로 따로 둔다", () => {
    const named = { ...weekly, name: "치과", reason: "정기 검진" };
    expect(offByDay([named], 18, days)["2026-09-14"][0]).toMatchObject({ who: "치과", note: "정기 검진" });
    expect(offByDay([weekly], 18, days)["2026-09-14"][0].who).toBe("불가능 일정");
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

  it("전체합주는 모든 멤버의 일정이라 내 일정 탭과 전체 일정 탭 둘 다 반환한다", () => {
    const withOne: Entry[] = [...entries, { kind: "ensemble", team: null, a: 3, b: 4 }];
    expect(visible(withOne, "me", teams).map((entry) => entry.kind)).toContain("ensemble");
    expect(visible(withOne, "all", teams).map((entry) => entry.kind)).toContain("ensemble");
  });
});
