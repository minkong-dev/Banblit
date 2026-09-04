import { describe, expect, it } from "vitest";

import {
  datesBetween,
  focusedRange,
  hoursLabel,
  isRangeFree,
  monthCells,
  roomBounds,
  slotLabel,
  takenGrid,
} from "./calendar";

describe("monthCells — 한 달을 7칸씩 나눠 담는다", () => {
  // 2026년 9월 1일은 화요일이라 앞에 빈 칸 둘이 붙는다. month 는 0부터 세는 값이다.
  it("첫날의 요일만큼 앞을 비우고, 7의 배수가 되도록 뒤를 채운다", () => {
    const cells = monthCells(2026, 8);

    expect(cells.length % 7).toBe(0);
    expect(cells.slice(0, 2)).toEqual([null, null]);
    expect(cells[2]).toBe(1);
    expect(cells[31]).toBe(30);
    expect(cells.slice(32)).toEqual([null, null, null]);
  });

  it("1일이 일요일이면 앞을 비우지 않는다", () => {
    // 2026년 3월 1일은 일요일이다.
    expect(monthCells(2026, 2)[0]).toBe(1);
  });

  it("날짜를 하나도 빠뜨리지 않는다", () => {
    const days = monthCells(2026, 1).filter((cell) => cell !== null);
    expect(days).toHaveLength(28);
  });
});

describe("slotLabel — 칸 번호를 시각으로", () => {
  it("여는 시각이 0번이고 30분마다 하나씩 간다", () => {
    expect(slotLabel(0, 18)).toBe("18:00");
    expect(slotLabel(1, 18)).toBe("18:30");
    expect(slotLabel(8, 18)).toBe("22:00");
  });

  it("한 자리 시각에도 0을 붙인다", () => {
    expect(slotLabel(0, 9)).toBe("09:00");
  });
});

describe("hoursLabel — 칸 개수를 사람이 읽는 시간으로", () => {
  it("두 칸이 한 시간이다", () => {
    expect(hoursLabel(14)).toBe("7시간");
    expect(hoursLabel(2)).toBe("1시간");
  });

  it("홀수면 30분이 남는다", () => {
    expect(hoursLabel(7)).toBe("3시간 30분");
    expect(hoursLabel(1)).toBe("0시간 30분");
  });

  it("하나도 없으면 0시간이다", () => {
    expect(hoursLabel(0)).toBe("0시간");
  });
});

describe("takenGrid / isRangeFree — 그날 어디가 찼는지", () => {
  it("차지한 구간만 표시한다", () => {
    expect(takenGrid([{ a: 2, b: 4 }], 6)).toEqual([false, false, true, true, false, false]);
  });

  it("겹쳐 들어와도 한 번만 센다", () => {
    expect(takenGrid([{ a: 0, b: 2 }, { a: 1, b: 3 }], 4)).toEqual([true, true, true, false]);
  });

  it("아무것도 없으면 전부 비어 있다", () => {
    expect(takenGrid([], 3)).toEqual([false, false, false]);
  });

  it("고른 구간에 찬 칸이 하나라도 있으면 막는다", () => {
    const grid = takenGrid([{ a: 2, b: 4 }], 6);

    expect(isRangeFree(grid, 0, 2)).toBe(true);
    expect(isRangeFree(grid, 4, 6)).toBe(true);
    expect(isRangeFree(grid, 1, 3)).toBe(false);
    expect(isRangeFree(grid, 2, 4)).toBe(false);
  });
});

describe("datesBetween — 두 날짜 사이를 하루도 빠뜨리지 않고 잇는다", () => {
  it("양 끝을 포함한다", () => {
    expect(datesBetween("2026-09-14", "2026-09-17")).toEqual([
      "2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17",
    ]);
  });

  it("같은 날이면 하루만 돌려준다", () => {
    expect(datesBetween("2026-09-14", "2026-09-14")).toEqual(["2026-09-14"]);
  });

  it("달을 넘어가도 이어진다", () => {
    expect(datesBetween("2026-09-29", "2026-10-02")).toEqual([
      "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02",
    ]);
  });

  it("끝이 시작보다 앞이면 비운다", () => {
    expect(datesBetween("2026-09-17", "2026-09-14")).toEqual([]);
  });
});

describe("roomBounds — 합주실 여닫는 시각으로 달력의 앞뒤를 잡는다", () => {
  it("가장 이른 여는 시각과 가장 늦은 닫는 시각을 쓴다", () => {
    expect(roomBounds([
      { opens_at: "18:00", closes_at: "22:00" },
      { opens_at: "19:00", closes_at: "21:00" },
    ])).toEqual({ open: 18, close: 22 });
  });

  it("30분에 닫으면 다음 정시까지 칸을 넓힌다", () => {
    expect(roomBounds([{ opens_at: "18:00", closes_at: "22:30" }])).toEqual({ open: 18, close: 23 });
  });

  it("합주실이 없으면 기본값을 쓴다", () => {
    expect(roomBounds([])).toEqual({ open: 10, close: 22 });
  });
});

describe("focusedRange — 집중 합주기간의 날짜 범위", () => {
  it("여럿이면 시작일이 가장 이른 것을 고른다", () => {
    expect(focusedRange([
      { kind: "focused", starts_on: "2026-09-21", ends_on: "2026-09-27" },
      { kind: "focused", starts_on: "2026-09-14", ends_on: "2026-09-20" },
      { kind: "open", starts_on: "2026-01-01", ends_on: "2026-12-31" },
    ])).toEqual({ from: "2026-09-14", to: "2026-09-20" });
  });

  it("집중기간이 없으면 null", () => {
    expect(focusedRange([{ kind: "open", starts_on: "2026-01-01", ends_on: "2026-12-31" }])).toBeNull();
  });
});
