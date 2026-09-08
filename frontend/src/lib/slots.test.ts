import { describe, expect, it } from "vitest";

import { dayOf, hhmm, isoAt, mergeReservations, mergeSessions, slotIndex } from "./slots";
import type { Session } from "./slots";

const slot = (team: string, room: string, start: string, end: string): Session => ({
  team,
  room,
  start,
  end,
});

describe("mergeSessions — 한 시간짜리 칸을 사람이 읽는 합주 한 번으로", () => {
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

describe("slotIndex — 여는 시각을 0번으로 둔 한 시간짜리 칸 번호", () => {
  it("여는 시각이 0번이고 한 시간마다 하나씩 늘어난다", () => {
    expect(slotIndex("2026-09-14T18:00:00", 18)).toBe(0);
    expect(slotIndex("2026-09-14T19:00:00", 18)).toBe(1);
    expect(slotIndex("2026-09-14T22:00:00", 18)).toBe(4);
  });

  it("여는 시각이 바뀌면 번호도 함께 밀린다", () => {
    expect(slotIndex("2026-09-14T18:00:00", 10)).toBe(8);
  });
});

describe("isoAt — slotIndex 의 반대 방향", () => {
  it("날짜와 칸 번호를 시간대 없는 시각 문자열로 합친다", () => {
    expect(isoAt("2026-09-14", 4, 18)).toBe("2026-09-14T22:00:00");
  });

  it("slotIndex 로 되돌리면 원래 칸 번호가 나온다", () => {
    const iso = isoAt("2026-09-14", 5, 18);
    expect(slotIndex(iso, 18)).toBe(5);
  });
});

describe("mergeReservations — 칸마다 쪼개진 예약을 한 건으로 잇는다", () => {
  const row = (id: number, start: string, end: string, over: Partial<{
    room: string; teamId: number | null; team: string | null; memberId: number; member: string;
  }> = {}) => ({
    id,
    room: over.room ?? "합주실 A",
    teamId: over.teamId === undefined ? null : over.teamId,
    team: over.team === undefined ? null : over.team,
    memberId: over.memberId ?? 7,
    member: over.member ?? "고윤서",
    start,
    end,
  });

  it("맞닿은 칸을 한 건으로 잇고 칸 번호를 모두 든다", () => {
    // Arrange — 18시부터 세 칸을 이어 잡은 예약이다.
    const rows = [
      row(1, "2026-09-14T18:00:00", "2026-09-14T19:00:00"),
      row(2, "2026-09-14T19:00:00", "2026-09-14T20:00:00"),
      row(3, "2026-09-14T20:00:00", "2026-09-14T21:00:00"),
    ];

    // Act
    const merged = mergeReservations(rows);

    // Assert
    expect(merged).toHaveLength(1);
    expect(merged[0].ids).toEqual([1, 2, 3]);
    expect(merged[0].start).toBe("2026-09-14T18:00:00");
    expect(merged[0].end).toBe("2026-09-14T21:00:00");
  });

  it("사이가 떨어져 있으면 두 건으로 둔다", () => {
    const merged = mergeReservations([
      row(1, "2026-09-14T18:00:00", "2026-09-14T19:00:00"),
      row(2, "2026-09-14T21:00:00", "2026-09-14T22:00:00"),
    ]);

    expect(merged.map((booking) => booking.ids)).toEqual([[1], [2]]);
  });

  it("맞닿아 있어도 잡은 사람이 다르면 잇지 않는다", () => {
    // 취소는 잡은 사람만 할 수 있어, 남의 칸까지 한 건으로 묶으면 안 된다.
    const merged = mergeReservations([
      row(1, "2026-09-14T18:00:00", "2026-09-14T19:00:00", { memberId: 7 }),
      row(2, "2026-09-14T19:00:00", "2026-09-14T20:00:00", { memberId: 8, member: "권도현" }),
    ]);

    expect(merged).toHaveLength(2);
  });

  it("맞닿아 있어도 합주실이 다르면 잇지 않는다", () => {
    const merged = mergeReservations([
      row(1, "2026-09-14T18:00:00", "2026-09-14T19:00:00", { room: "합주실 A" }),
      row(2, "2026-09-14T19:00:00", "2026-09-14T20:00:00", { room: "합주실 B" }),
    ]);

    expect(merged).toHaveLength(2);
  });

  it("맞닿아 있어도 이름을 건 팀이 다르면 잇지 않는다", () => {
    const merged = mergeReservations([
      row(1, "2026-09-14T18:00:00", "2026-09-14T19:00:00", { teamId: null }),
      row(2, "2026-09-14T19:00:00", "2026-09-14T20:00:00", { teamId: 3, team: "여섯줄" }),
    ]);

    expect(merged).toHaveLength(2);
  });

  it("받은 목록을 고치지 않는다", () => {
    const rows = [
      row(2, "2026-09-14T19:00:00", "2026-09-14T20:00:00"),
      row(1, "2026-09-14T18:00:00", "2026-09-14T19:00:00"),
    ];
    const before = [...rows];

    mergeReservations(rows);

    expect(rows).toEqual(before);
  });
});
