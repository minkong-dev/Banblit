import { describe, expect, it } from "vitest";

import {
  currentMonth,
  datesBetween,
  dayLabel,
  dayWithWeekday,
  focusedRange,
  hoursLabel,
  isRangeFree,
  monthCells,
  roomBounds,
  slotCountOf,
  slotLabel,
  stampLabel,
  takenGrid,
  WEEKDAY_NAMES,
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
  it("여는 시각이 0번이고 한 시간마다 하나씩 간다", () => {
    expect(slotLabel(0, 18)).toBe("18:00");
    expect(slotLabel(1, 18)).toBe("19:00");
    expect(slotLabel(4, 18)).toBe("22:00");
  });

  it("한 자리 시각에도 0을 붙인다", () => {
    expect(slotLabel(0, 9)).toBe("09:00");
  });
});

describe("hoursLabel — 칸 개수를 사람이 읽는 시간으로", () => {
  it("한 칸이 한 시간이다", () => {
    expect(hoursLabel(7)).toBe("7시간");
    expect(hoursLabel(1)).toBe("1시간");
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

describe("currentMonth", () => {
  it("달력은 오늘이 든 달로 연다 — month 는 0부터 센다", () => {
    expect(currentMonth(new Date(2027, 0, 15))).toEqual({ year: 2027, month: 0 });
  });
});

describe("dayLabel — 날짜 열쇠를 사람이 읽는 날짜로", () => {
  it("월과 일만 적는다", () => {
    expect(dayLabel("2026-09-13")).toBe("9월 13일");
  });

  it("앞에 붙은 0 은 떼고 적는다", () => {
    expect(dayLabel("2026-01-05")).toBe("1월 5일");
  });

  it("뒤에 시각이 붙어 있어도 날짜만 읽는다", () => {
    expect(dayLabel("2026-09-13T18:00:00")).toBe("9월 13일");
  });

  it("모양이 다르면 받은 값을 그대로 돌려준다", () => {
    expect(dayLabel("모르는 값")).toBe("모르는 값");
  });
});

describe("dayWithWeekday — 날짜에 요일을 붙인다", () => {
  it("요일까지 적는다", () => {
    // 2026년 9월 13일은 일요일이다.
    expect(dayWithWeekday("2026-09-13")).toBe("9월 13일 일요일");
  });

  it("모양이 다르면 받은 값을 그대로 돌려준다", () => {
    expect(dayWithWeekday("")).toBe("");
  });
});

describe("stampLabel — 적힌 시각을 사람이 읽는 값으로", () => {
  it("날짜 뒤에 시각을 붙인다", () => {
    expect(stampLabel("2026-09-04T14:30:00")).toBe("9월 4일 14:30");
  });

  it("시각은 두 자리로 맞춰 적는다", () => {
    expect(stampLabel("2026-01-05T09:05:00")).toBe("1월 5일 09:05");
  });

  it("뒤에 시간대가 붙어 와도 적힌 시각을 그대로 쓴다", () => {
    // 브라우저의 시간대로 옮기면 이 값이 하루 앞뒤로 밀 수 있다.
    expect(stampLabel("2026-01-31T23:30:00+09:00")).toBe("1월 31일 23:30");
  });

  it("시각이 없으면 날짜만 적는다", () => {
    expect(stampLabel("2026-09-04")).toBe("9월 4일");
  });

  it("모양이 다르면 받은 값을 그대로 돌려준다", () => {
    expect(stampLabel("모르는 값")).toBe("모르는 값");
  });
});

describe("WEEKDAY_NAMES — 달력 머리글의 요일 이름", () => {
  it("일요일부터 이레를 한 글자로 든다", () => {
    expect(WEEKDAY_NAMES).toEqual(["일", "월", "화", "수", "목", "금", "토"]);
  });
});

describe("slotCountOf — 여닫는 시각 사이의 칸 수", () => {
  it("칸 하나가 한 시간이라 시각 차이가 곧 칸 수다", () => {
    // 10시에 열고 22시에 닫으면 열두 칸이다.
    expect(slotCountOf(10, 22)).toBe(12);
  });

  it("마지막 칸은 닫는 시각에 끝난다", () => {
    // 마지막 칸 번호로 만든 시각이 닫는 시각과 맞아야 그 뒤로 칸이 남지 않는다.
    const count = slotCountOf(10, 22);
    expect(slotLabel(count - 1, 10)).toBe("21:00");
    expect(slotLabel(count, 10)).toBe("22:00");
  });
});
