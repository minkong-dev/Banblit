import { describe, expect, it } from "vitest";

import type { Unavailable } from "./contract";
import { heatByMonth, heatByWeek, offMembersAt } from "./unavailableMap";

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
