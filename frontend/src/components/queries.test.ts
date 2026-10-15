// queries.ts 의 queryKey 가 앞부분 일치로 묶여 다시 조회되는지 검증합니다. 서버를 호출하지 않습니다.

import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { BOARD_KEY, boardListKey, PERIOD_DELETE_KEYS, ROOM_DELETE_KEYS, SCHEDULE_KEY } from "./queries";

describe("BOARD_KEY", () => {
  it("BOARD_KEY 를 무효화하면 게시판 목록 query 가 전부 무효화된다", async () => {
    // 블라인드를 해제한 글은 공지·팀 게시판 중 어느 목록으로든 돌아갈 수 있습니다.
    const client = new QueryClient();
    client.setQueryData(boardListKey("/notices"), { posts: [] });
    client.setQueryData(boardListKey("/posts"), { posts: [] });

    await client.invalidateQueries({ queryKey: BOARD_KEY });

    expect(client.getQueryState(boardListKey("/notices"))?.isInvalidated).toBe(true);
    expect(client.getQueryState(boardListKey("/posts"))?.isInvalidated).toBe(true);
  });
});

describe("SCHEDULE_KEY — 두 화면의 서로 다른 schedule queryKey 를 접두사 하나로 함께 무효화한다", () => {
  it("숫자 key 와 배열 key 가 둘 다 무효화된다", () => {
    const client = new QueryClient();
    client.setQueryData(["schedule", 5], { rows: [] });
    client.setQueryData(["schedule", [5, 6]], { rows: [] });

    void client.invalidateQueries({ queryKey: SCHEDULE_KEY });

    expect(client.getQueryState(["schedule", 5])?.isInvalidated).toBe(true);
    expect(client.getQueryState(["schedule", [5, 6]])?.isInvalidated).toBe(true);
  });

  it("접두사 없이 숫자 key 하나만 무효화하면 배열 key 는 무효화되지 않는다 — 고치기 전 재현", () => {
    const client = new QueryClient();
    client.setQueryData(["schedule", 5], { rows: [] });
    client.setQueryData(["schedule", [5, 6]], { rows: [] });

    void client.invalidateQueries({ queryKey: ["schedule", 5] });

    expect(client.getQueryState(["schedule", [5, 6]])?.isInvalidated).toBe(false);
  });
});

// backend/src/backend/db/models.py 의 ON DELETE CASCADE 기준입니다. 기간 삭제는 assignments·
// assignment_runs·assignment_backups 를 지우고 reservations 는 기간을 참조하지 않아 남습니다.
// 합주실 삭제는 assignments·assignment_backups·reservations 를 모두 지웁니다.

describe("PERIOD_DELETE_KEYS — 기간 삭제로 CASCADE 삭제되는 캐시만 무효화한다", () => {
  it("periods·schedule·backups·backup-round 는 무효화되고 reservations·rooms 는 남는다", () => {
    const client = new QueryClient();
    const periods = ["periods"];
    const rooms = ["rooms"];
    const schedule = ["schedule", 1];
    const backups = ["backups", 1];
    const backupRound = ["backup-round", 1, "2026-01-01T00:00:00"];
    const reservations = ["reservations", [1], "2026-01-01", "2026-01-31"];
    for (const key of [periods, rooms, schedule, backups, backupRound, reservations]) {
      client.setQueryData(key, {});
    }

    for (const prefix of PERIOD_DELETE_KEYS) void client.invalidateQueries({ queryKey: [prefix] });

    expect(client.getQueryState(periods)?.isInvalidated).toBe(true);
    expect(client.getQueryState(schedule)?.isInvalidated).toBe(true);
    expect(client.getQueryState(backups)?.isInvalidated).toBe(true);
    expect(client.getQueryState(backupRound)?.isInvalidated).toBe(true);
    expect(client.getQueryState(reservations)?.isInvalidated).toBe(false);
    expect(client.getQueryState(rooms)?.isInvalidated).toBe(false);
  });
});

describe("ROOM_DELETE_KEYS — 합주실 삭제로 CASCADE 삭제되는 캐시만 무효화한다", () => {
  it("rooms·schedule·backups·backup-round·reservations 가 모두 무효화되고 periods 는 남는다", () => {
    const client = new QueryClient();
    const periods = ["periods"];
    const rooms = ["rooms"];
    const schedule = ["schedule", 1];
    const backups = ["backups", 1];
    const backupRound = ["backup-round", 1, "2026-01-01T00:00:00"];
    const reservations = ["reservations", [1], "2026-01-01", "2026-01-31"];
    for (const key of [periods, rooms, schedule, backups, backupRound, reservations]) {
      client.setQueryData(key, {});
    }

    for (const prefix of ROOM_DELETE_KEYS) void client.invalidateQueries({ queryKey: [prefix] });

    expect(client.getQueryState(rooms)?.isInvalidated).toBe(true);
    expect(client.getQueryState(schedule)?.isInvalidated).toBe(true);
    expect(client.getQueryState(backups)?.isInvalidated).toBe(true);
    expect(client.getQueryState(backupRound)?.isInvalidated).toBe(true);
    expect(client.getQueryState(reservations)?.isInvalidated).toBe(true);
    expect(client.getQueryState(periods)?.isInvalidated).toBe(false);
  });
});

// 다른 멤버의 예약·불가능 일정 반려는 같은 본문({ reason })을 각 대상의 /reject 주소로 POST 합니다.
