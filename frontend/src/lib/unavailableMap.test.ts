import { describe, expect, it } from "vitest";

import type { Unavailable } from "./contract";
import { dayHours, heatByMonth, laneBars, packColumns, heatByWeek, offMembersAt, offMembersOnDay, offRuns, offRunsByDay } from "./unavailableMap";

const MONDAY_BIT = 1;

function off(id: number, memberId: number, startsAt: string, endsAt: string, repeatWeekdays: number | null = null): Unavailable {
  return {
    id, member_id: memberId, starts_at: startsAt, ends_at: endsAt,
    repeat_weekdays: repeatWeekdays, repeat_count: null, repeat_until: null, reason: null, name: null,
  };
}

// 2026-10-12 는 월요일입니다. 1번 멤버는 매주 월요일 18~20시, 2번 멤버는 10월 13일 19~21시, 9번 멤버는 팀원이 아닙니다.
const TIMES = [
  off(1, 1, "2026-10-12T18:00:00", "2026-10-12T20:00:00", MONDAY_BIT),
  off(2, 2, "2026-10-13T19:00:00", "2026-10-13T21:00:00"),
  off(3, 9, "2026-10-13T19:00:00", "2026-10-13T20:00:00"),
];
const TEAM = [1, 2, 3];

describe("offMembersAt — 그 시간에 불가능 일정이 있는 팀원", () => {
  it("반복 일정은 다음 주 같은 요일에도 센다", () => {
    expect(offMembersAt(TIMES, TEAM, "2026-10-19", 18)).toEqual([1]);
  });

  it("팀원이 아닌 멤버는 제외한다", () => {
    expect(offMembersAt(TIMES, TEAM, "2026-10-13", 19)).toEqual([2]);
  });

  it("종료 시간과 맞닿은 시간은 세지 않는다", () => {
    expect(offMembersAt(TIMES, TEAM, "2026-10-12", 20)).toEqual([]);
  });

  it("00:00 에 끝나는 일정은 23시 칸까지 센다", () => {
    const late = [off(4, 3, "2026-10-14T22:00:00", "2026-10-15T00:00:00")];
    expect(offMembersAt(late, TEAM, "2026-10-14", 23)).toEqual([3]);
  });
});

describe("heatByWeek — 요일 × 시간 인원", () => {
  it("날짜마다 open 부터 close 전까지 시간별 인원을 반환한다", () => {
    const heat = heatByWeek(TIMES, TEAM, ["2026-10-12", "2026-10-13"], 18, 21);
    expect(heat).toEqual([[1, 1, 0], [0, 1, 1]]);
  });
});

describe("heatByMonth — 하루 최대 인원", () => {
  it("날짜마다 가장 많이 빠지는 시간의 인원을 반환한다", () => {
    const both = [...TIMES, off(5, 1, "2026-10-13T20:00:00", "2026-10-13T21:00:00")];
    expect(heatByMonth(both, TEAM, ["2026-10-12", "2026-10-13", "2026-10-14"], 18, 24))
      .toEqual({ "2026-10-12": 1, "2026-10-13": 2, "2026-10-14": 0 });
  });
});

describe("offMembersOnDay — 그날 한 시간이라도 빠지는 팀원", () => {
  it("open 부터 close 전까지 불가능 일정이 있는 팀원을 팀 명단 순서로 반환한다", () => {
    const both = [...TIMES, off(5, 1, "2026-10-13T20:00:00", "2026-10-13T21:00:00")];
    expect(offMembersOnDay(both, TEAM, "2026-10-13", 18, 24)).toEqual([1, 2]);
  });

  it("운영 시간 밖의 일정은 세지 않는다", () => {
    expect(offMembersOnDay(TIMES, TEAM, "2026-10-12", 20, 24)).toEqual([]);
  });
});

describe("offRuns — 빠지는 팀원이 같은 연속 시간 묶음", () => {
  it("팀원 구성이 같은 시간끼리 묶고, 아무도 빠지지 않는 시간은 제외한다", () => {
    expect(offRuns(TIMES, TEAM, "2026-10-13", 17, 22)).toEqual([
      { from: 19, to: 21, ids: [2] },
    ]);
  });

  it("팀원 구성이 바뀌는 시각에서 묶음을 나눈다", () => {
    const both = [...TIMES, off(5, 1, "2026-10-13T20:00:00", "2026-10-13T22:00:00")];
    expect(offRuns(both, TEAM, "2026-10-13", 18, 23)).toEqual([
      { from: 19, to: 20, ids: [2] },
      { from: 20, to: 21, ids: [1, 2] },
      { from: 21, to: 22, ids: [1] },
    ]);
  });
});

describe("offRunsByDay — 날짜마다 묶음", () => {
  it("dayKeys 순서로 날짜별 offRuns 를 반환한다", () => {
    expect(offRunsByDay(TIMES, TEAM, ["2026-10-12", "2026-10-13", "2026-10-14"], 17, 22)).toEqual([
      [{ from: 18, to: 20, ids: [1] }],
      [{ from: 19, to: 21, ids: [2] }],
      [],
    ]);
  });
});

describe("dayHours — 그날 안에서 차지하는 시각 범위", () => {
  it("그날 시작해 그날 끝나면 시작·종료 시각(소수 시간)이다", () => {
    expect(dayHours(off(7, 1, "2026-10-13T18:30:00", "2026-10-13T20:00:00"), "2026-10-13")).toEqual({ from: 18.5, to: 20 });
  });
  it("반복 일정은 반복되는 날에도 같은 시각이고, 반복되지 않는 날은 null 이다", () => {
    expect(dayHours(TIMES[0], "2026-10-19")).toEqual({ from: 18, to: 20 });
    expect(dayHours(TIMES[0], "2026-10-20")).toBeNull();
  });
  it("전날 시작해 자정을 넘기면 0 부터, 다음날 00:00 에 끝나면 24 까지다", () => {
    expect(dayHours(off(8, 1, "2026-10-12T22:00:00", "2026-10-13T02:00:00"), "2026-10-13")).toEqual({ from: 0, to: 2 });
    expect(dayHours(off(9, 1, "2026-10-13T22:00:00", "2026-10-14T00:00:00"), "2026-10-13")).toEqual({ from: 22, to: 24 });
  });
});

describe("packColumns — 겹치는 막대를 옆으로 나눌 열 번호", () => {
  it("겹치지 않으면 전부 1열입니다", () => {
    expect(packColumns([{ from: 0, to: 2 }, { from: 2, to: 4 }])).toEqual([{ col: 0, cols: 1 }, { col: 0, cols: 1 }]);
  });

  it("겹치면 다른 열에 놓고, 겹친 묶음 안에서 열 수를 같이 씁니다", () => {
    // 18~22시 안에 19~21시. 22시 이후 막대는 묶음 밖이라 1열입니다.
    expect(packColumns([{ from: 9, to: 13 }, { from: 10, to: 12 }, { from: 13, to: 14 }]))
      .toEqual([{ col: 0, cols: 2 }, { col: 1, cols: 2 }, { col: 0, cols: 1 }]);
  });

  it("앞 막대가 끝난 열은 다시 씁니다", () => {
    expect(packColumns([{ from: 0, to: 4 }, { from: 1, to: 2 }, { from: 2, to: 3 }]))
      .toEqual([{ col: 0, cols: 2 }, { col: 1, cols: 2 }, { col: 1, cols: 2 }]);
  });
});

describe("laneBars — 하루 타임라인 lane 1개의 막대", () => {
  it("그날에 없는 일정은 제외하고 운영 시간 밖은 자른다", () => {
    const bars = laneBars(TIMES, "2026-10-13", 18, 20);
    expect(bars.map((bar) => [bar.item.id, bar.from, bar.to])).toEqual([[2, 19, 20], [3, 19, 20]]);
  });

  it("운영 시간 밖에 전부 있는 일정은 제외한다", () => {
    expect(laneBars(TIMES, "2026-10-13", 21, 23)).toEqual([]);
  });
});
