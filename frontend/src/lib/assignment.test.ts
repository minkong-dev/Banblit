import { describe, expect, it } from "vitest";

import { dayRangeOf, hoursOf, sessionsOfRows, tabKey, tabsOf, viewOf } from "./assignment";
import type { ScheduleRow } from "./contract";

/** 검사용 시간표 한 줄입니다. sessionsOfRows 가 읽는 네 필드만 의미가 있고 id 는 자리를 채웁니다. */
function row(team: string, room: string, start: string, end: string): ScheduleRow {
  return { team_id: 1, team, room_id: 1, room, start, end };
}

describe("sessionsOfRows — 서버 시간표를 합주 목록으로", () => {
  it("빈 목록은 빈 목록을 반환한다", () => {
    expect(sessionsOfRows([])).toEqual([]);
  });

  it("맞닿은 두 줄을 합주 한 번으로 묶는다", () => {
    const rows = [
      row("보컬팀", "1번방", "2026-09-14T18:00:00", "2026-09-14T19:00:00"),
      row("보컬팀", "1번방", "2026-09-14T19:00:00", "2026-09-14T20:00:00"),
    ];
    expect(sessionsOfRows(rows)).toEqual([
      { team: "보컬팀", room: "1번방", start: "2026-09-14T18:00:00", end: "2026-09-14T20:00:00" },
    ]);
  });

  it("합주실이 다르면 묶지 않는다", () => {
    const rows = [
      row("보컬팀", "1번방", "2026-09-14T18:00:00", "2026-09-14T19:00:00"),
      row("보컬팀", "2번방", "2026-09-14T19:00:00", "2026-09-14T20:00:00"),
    ];
    expect(sessionsOfRows(rows)).toHaveLength(2);
  });

  it("team_id 와 room_id 는 결과에 넣지 않는다", () => {
    const [session] = sessionsOfRows([row("보컬팀", "1번방", "2026-09-14T18:00:00", "2026-09-14T19:00:00")]);
    expect(Object.keys(session).sort()).toEqual(["end", "room", "start", "team"]);
  });
});

describe("dayRangeOf — 합주 목록이 걸친 날짜 전부", () => {
  it("합주가 없으면 빈 목록을 반환한다", () => {
    expect(dayRangeOf([])).toEqual([]);
  });

  it("하루만 있으면 그 날짜 하나를 반환한다", () => {
    const sessions = [{ team: "가", room: "1번방", start: "2026-09-14T18:00:00", end: "2026-09-14T19:00:00" }];
    expect(dayRangeOf(sessions)).toEqual(["2026-09-14"]);
  });

  it("첫 합주와 마지막 합주 사이의 날짜를 빠짐없이 반환한다", () => {
    // 9-15 에는 합주가 없지만 달력은 그 칸도 그려야 하므로 사이 날짜가 모두 들어갑니다.
    const sessions = [
      { team: "가", room: "1번방", start: "2026-09-16T18:00:00", end: "2026-09-16T19:00:00" },
      { team: "나", room: "1번방", start: "2026-09-14T18:00:00", end: "2026-09-14T19:00:00" },
    ];
    expect(dayRangeOf(sessions)).toEqual(["2026-09-14", "2026-09-15", "2026-09-16"]);
  });

  it("입력 목록을 수정하지 않는다", () => {
    const sessions = [
      { team: "가", room: "1번방", start: "2026-09-16T18:00:00", end: "2026-09-16T19:00:00" },
      { team: "나", room: "1번방", start: "2026-09-14T18:00:00", end: "2026-09-14T19:00:00" },
    ];
    dayRangeOf(sessions);
    expect(sessions[0].start).toBe("2026-09-16T18:00:00");
  });
});

describe("tabsOf — 배정 화면의 탭 목록", () => {
  it("조율안과 배정기록이 없으면 현재 확정된 배정안 탭만 반환한다", () => {
    expect(tabsOf(0, null)).toEqual([{ key: "now", text: "현재 확정된 배정안" }]);
  });

  it("조율안 개수만큼 A안·B안 순서로 탭을 더한다", () => {
    expect(tabsOf(2, null).map((tab) => tab.key)).toEqual(["now", "p0", "p1"]);
    expect(tabsOf(2, null).map((tab) => tab.text)).toEqual(["현재 확정된 배정안", "A안", "B안"]);
  });

  it("배정기록을 선택했으면 그 탭을 맨 뒤에 더한다", () => {
    const tabs = tabsOf(1, "2026-09-14T18:00:00");
    expect(tabs.map((tab) => tab.key)).toEqual(["now", "p0", "r:2026-09-14T18:00:00"]);
  });

  it("탭 key 는 viewOf 가 되돌릴 수 있는 값이다", () => {
    // 탭은 문자열 key 만 받으므로 key 와 View 의 변환이 어긋나면 다른 탭이 열립니다.
    for (const tab of tabsOf(2, "2026-09-14T18:00:00")) {
      expect(tabKey(viewOf(tab.key))).toBe(tab.key);
    }
  });
});

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
