import { describe, expect, it } from "vitest";

import { dayOf, hhmm, mergeSessions, slotIndex } from "./slots";
import type { Session } from "./slots";

const slot = (team: string, room: string, start: string, end: string): Session => ({
  team,
  room,
  start,
  end,
});

describe("mergeSessions — 30분 칸을 사람이 읽는 합주 한 번으로", () => {
  it("같은 팀이 같은 방에서 이어 쓴 칸을 하나로 합친다", () => {
    const merged = mergeSessions([
      slot("새벽 네시", "합주실 A", "2026-09-14T18:00:00", "2026-09-14T18:30:00"),
      slot("새벽 네시", "합주실 A", "2026-09-14T18:30:00", "2026-09-14T19:00:00"),
      slot("새벽 네시", "합주실 A", "2026-09-14T19:00:00", "2026-09-14T19:30:00"),
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0].start).toBe("2026-09-14T18:00:00");
    expect(merged[0].end).toBe("2026-09-14T19:30:00");
  });

  it("사이가 끊기면 합치지 않는다", () => {
    const merged = mergeSessions([
      slot("새벽 네시", "합주실 A", "2026-09-14T18:00:00", "2026-09-14T18:30:00"),
      slot("새벽 네시", "합주실 A", "2026-09-14T20:00:00", "2026-09-14T20:30:00"),
    ]);

    expect(merged).toHaveLength(2);
  });

  it("팀이 다르면 시각이 붙어 있어도 합치지 않는다", () => {
    const merged = mergeSessions([
      slot("새벽 네시", "합주실 A", "2026-09-14T18:00:00", "2026-09-14T18:30:00"),
      slot("파랑주의보", "합주실 A", "2026-09-14T18:30:00", "2026-09-14T19:00:00"),
    ]);

    expect(merged).toHaveLength(2);
  });

  it("방이 다르면 시각이 붙어 있어도 합치지 않는다", () => {
    const merged = mergeSessions([
      slot("새벽 네시", "합주실 A", "2026-09-14T18:00:00", "2026-09-14T18:30:00"),
      slot("새벽 네시", "합주실 B", "2026-09-14T18:30:00", "2026-09-14T19:00:00"),
    ]);

    expect(merged).toHaveLength(2);
  });

  it("들어온 순서가 뒤섞여 있어도 합친다", () => {
    const merged = mergeSessions([
      slot("새벽 네시", "합주실 A", "2026-09-14T19:00:00", "2026-09-14T19:30:00"),
      slot("새벽 네시", "합주실 A", "2026-09-14T18:00:00", "2026-09-14T18:30:00"),
      slot("새벽 네시", "합주실 A", "2026-09-14T18:30:00", "2026-09-14T19:00:00"),
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0].end).toBe("2026-09-14T19:30:00");
  });

  it("받은 목록을 고치지 않는다", () => {
    const given = [
      slot("새벽 네시", "합주실 A", "2026-09-14T18:00:00", "2026-09-14T18:30:00"),
      slot("새벽 네시", "합주실 A", "2026-09-14T18:30:00", "2026-09-14T19:00:00"),
    ];

    mergeSessions(given);

    expect(given).toHaveLength(2);
    expect(given[0].end).toBe("2026-09-14T18:30:00");
  });
});

describe("시각은 글자 그대로 자른다", () => {
  // Date 로 바꾸면 브라우저 시간대가 끼어들어 날짜가 하루씩 밀 수 있다.
  it("자정 직전 값도 그날 날짜 그대로 남는다", () => {
    expect(dayOf("2026-09-14T23:30:00")).toBe("2026-09-14");
    expect(hhmm("2026-09-14T23:30:00")).toBe("23:30");
  });

  it("자정 값도 그날 날짜 그대로 남는다", () => {
    expect(dayOf("2026-09-14T00:00:00")).toBe("2026-09-14");
    expect(hhmm("2026-09-14T00:00:00")).toBe("00:00");
  });
});

describe("slotIndex — 여는 시각을 0번으로 둔 30분 칸 번호", () => {
  it("여는 시각이 0번이고 30분마다 하나씩 늘어난다", () => {
    expect(slotIndex("2026-09-14T18:00:00", 18)).toBe(0);
    expect(slotIndex("2026-09-14T18:30:00", 18)).toBe(1);
    expect(slotIndex("2026-09-14T19:00:00", 18)).toBe(2);
    expect(slotIndex("2026-09-14T22:00:00", 18)).toBe(8);
  });

  it("여는 시각이 바뀌면 번호도 함께 밀린다", () => {
    expect(slotIndex("2026-09-14T18:00:00", 10)).toBe(16);
  });
});
