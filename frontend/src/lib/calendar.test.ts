import { describe, expect, it } from "vitest";

import {
  currentMonth,
  datesBetween,
  dayLabel,
  dayWithWeekday,
  focusedRanges,
  hoursLabel,
  inRanges,
  firstTaken,
  isRangeFree,
  acceptsDrag,
  monthCells,
  roomBounds,
  slotCountOf,
  slotLabel,
  dragRange,
  slotSteps,
  stampLabel,
  takenGrid,
  unitLabel,
  WEEKDAY_NAMES,
} from "./calendar";

describe("monthCells — 한 달을 7칸씩 나눠 담는다", () => {
  // 2026년 9월 1일은 화요일이라 앞에 빈 칸 2개가 붙습니다. month 는 0부터 세는 값입니다.
  it("첫날의 요일만큼 앞을 비우고, 7의 배수가 되도록 뒤를 채운다", () => {
    const cells = monthCells(2026, 8);

    expect(cells.length % 7).toBe(0);
    expect(cells.slice(0, 2)).toEqual([null, null]);
    expect(cells[2]).toBe(1);
    expect(cells[31]).toBe(30);
    expect(cells.slice(32)).toEqual([null, null, null]);
  });

  it("1일이 일요일이면 앞을 비우지 않는다", () => {
    // 2026년 3월 1일은 일요일입니다.
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

  it("소수 칸 번호는 분까지 표시한다", () => {
    expect(slotLabel(1.5, 18)).toBe("19:30");
    expect(slotLabel(1 / 6, 18)).toBe("18:10");
  });
});

describe("slotSteps — 설정 단위 간격의 칸 번호 목록", () => {
  it("30분 단위면 0.5 간격으로 닫는 시각까지 나열한다", () => {
    expect(slotSteps(2, 30)).toEqual([0, 0.5, 1, 1.5, 2]);
  });

  it("60분 단위면 정수만 나열한다", () => {
    expect(slotSteps(12, 60)).toHaveLength(13);
    expect(slotSteps(12, 60)[12]).toBe(12);
  });

  it("10분 단위는 부동소수점 오차 없이 slotLabel 로 분이 나온다", () => {
    expect(slotLabel(slotSteps(1, 10)[5], 18)).toBe("18:50");
  });
});

describe("dragRange — 타임라인을 드래그해 고른 구간", () => {
  it("한 칸 안에서 누르고 떼면 그 칸 하나다", () => {
    expect(dragRange(2.3, 2.3, 60, 12)).toEqual({ a: 2, b: 3 });
  });

  it("위로 끌어도 시작이 앞이고, 10분 단위로 내림한 뒤 끝에 한 칸을 더한다", () => {
    // 누른 곳 1.9(18:54) → 1:50, 지금 0.25(18:15) → 0:10. 구간은 0:10 ~ 2:00 입니다.
    expect(dragRange(1.9, 0.25, 10, 12)).toEqual({ a: 10 / 60, b: 2 });
  });

  it("타임라인 밖으로 나가면 여는 시각과 닫는 시각에서 자른다", () => {
    expect(dragRange(-1, 99, 60, 12)).toEqual({ a: 0, b: 12 });
  });
});

describe("unitLabel — 설정 단위를 머리글 문구로", () => {
  it("60분이면 1시간 단위, 그 외는 분 단위로 적는다", () => {
    expect(unitLabel(60)).toBe("1시간 단위");
    expect(unitLabel(10)).toBe("10분 단위");
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

  it("소수 구간은 일부라도 걸친 칸을 전부 찬 것으로 표시한다", () => {
    expect(takenGrid([{ a: 1 / 6, b: 1.5 }], 3)).toEqual([true, true, false]);
  });

  it("고른 구간에 찬 칸이 하나라도 있으면 막는다", () => {
    const grid = takenGrid([{ a: 2, b: 4 }], 6);

    expect(isRangeFree(grid, 0, 2)).toBe(true);
    expect(isRangeFree(grid, 4, 6)).toBe(true);
    expect(isRangeFree(grid, 1, 3)).toBe(false);
    expect(isRangeFree(grid, 2, 4)).toBe(false);
  });

  it("점유 단위가 30분이면 18:00–18:30 예약이 18:30–19:00 을 막지 않는다", () => {
    const grid = takenGrid([{ a: 0, b: 0.5 }], 2, 30);

    expect(grid).toEqual([true, false, false, false]);
    expect(isRangeFree(grid, 0.5, 1, 30)).toBe(true);
    expect(isRangeFree(grid, 0, 0.5, 30)).toBe(false);
    expect(acceptsDrag(grid, { a: 0.5, b: 1 }, 30)).toBe(true);
  });

  it("firstTaken 은 고른 구간에서 처음으로 찬 칸의 시작 위치를 시간 단위로 반환한다", () => {
    const grid = takenGrid([{ a: 0.5, b: 1 }], 2, 30);

    expect(firstTaken(grid, 0, 2, 30)).toBe(0.5);
    expect(firstTaken(grid, 1, 2, 30)).toBeNull();
  });

  it("점유 단위가 10분이어도 칸 경계가 소수 오차로 밀리지 않는다", () => {
    expect(takenGrid([{ a: 1 / 6, b: 3 / 6 }], 1, 10)).toEqual([false, true, true, false, false, false]);
  });
});

describe("acceptsDrag — 드래그가 찬 칸을 넘지 못한다", () => {
  const grid = takenGrid([{ a: 2, b: 4 }], 6);

  it("grid 가 없으면 어떤 구간이든 반영한다", () => {
    expect(acceptsDrag(undefined, dragRange(2.5, 3.5, 60, 6))).toBe(true);
  });

  it("빈 칸만 걸치면 반영한다", () => {
    expect(acceptsDrag(grid, dragRange(0.2, 1.8, 60, 6))).toBe(true);
  });

  it("찬 칸을 지나가면 반영하지 않아 선택이 그 앞에서 멈춘다", () => {
    expect(acceptsDrag(grid, dragRange(1.2, 4.8, 60, 6))).toBe(false);
  });

  it("찬 칸에서 시작해도 반영하지 않는다", () => {
    expect(acceptsDrag(grid, dragRange(2.5, 2.5, 60, 6))).toBe(false);
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

describe("focusedRanges — 집중 합주기간의 날짜 범위", () => {
  it("집중기간 전부를 시작일 순서로 반환하고 상시 개방은 제외한다", () => {
    expect(focusedRanges([
      { kind: "focused", starts_on: "2026-09-21", ends_on: "2026-09-27", everyday: false },
      { kind: "focused", starts_on: "2026-09-14", ends_on: "2026-09-20", everyday: false },
      { kind: "open", starts_on: "2026-01-01", ends_on: "2026-12-31", everyday: false },
    ])).toEqual([
      { from: "2026-09-14", to: "2026-09-20" },
      { from: "2026-09-21", to: "2026-09-27" },
    ]);
  });

  it("매일 기간은 종료일이 없어 to 가 null 이다", () => {
    expect(focusedRanges([
      { kind: "focused", starts_on: "2026-09-14", ends_on: "2026-09-14", everyday: true },
    ])).toEqual([{ from: "2026-09-14", to: null }]);
  });

  it("전체합주 날짜 범위는 팀별 배정에서 제외되어 범위가 앞뒤로 나뉜다", () => {
    expect(focusedRanges([
      {
        kind: "focused", starts_on: "2026-09-01", ends_on: "2026-09-20", everyday: false,
        ensemble: { starts_on: "2026-09-11", ends_on: "2026-09-13" },
      },
    ])).toEqual([
      { from: "2026-09-01", to: "2026-09-10" },
      { from: "2026-09-14", to: "2026-09-20" },
    ]);
  });

  it("전체합주가 기간의 앞 끝에 붙으면 뒤쪽 범위 하나만 남는다", () => {
    expect(focusedRanges([
      {
        kind: "focused", starts_on: "2026-09-01", ends_on: "2026-09-20", everyday: false,
        ensemble: { starts_on: "2026-09-01", ends_on: "2026-09-03" },
      },
    ])).toEqual([{ from: "2026-09-04", to: "2026-09-20" }]);
  });

  it("전체합주가 기간 전체를 덮으면 범위가 없다", () => {
    expect(focusedRanges([
      {
        kind: "focused", starts_on: "2026-09-01", ends_on: "2026-09-03", everyday: false,
        ensemble: { starts_on: "2026-09-01", ends_on: "2026-09-03" },
      },
    ])).toEqual([]);
  });

  it("매일 기간은 전체합주 뒤쪽 범위가 끝없이 이어진다. 월말을 넘겨 날짜를 센다", () => {
    expect(focusedRanges([
      {
        kind: "focused", starts_on: "2026-09-01", ends_on: "2026-09-01", everyday: true,
        ensemble: { starts_on: "2026-09-29", ends_on: "2026-09-30" },
      },
    ])).toEqual([
      { from: "2026-09-01", to: "2026-09-28" },
      { from: "2026-10-01", to: null },
    ]);
  });
});

describe("inRanges", () => {
  const ranges = [{ from: "2026-09-14", to: "2026-09-20" }, { from: "2026-10-01", to: null }];

  it("어느 범위든 양 끝 날짜를 포함해 속하면 true", () => {
    expect(inRanges(ranges, "2026-09-20")).toBe(true);
    expect(inRanges(ranges, "2027-05-05")).toBe(true);
  });

  it("범위 사이의 날짜는 false", () => {
    expect(inRanges(ranges, "2026-09-25")).toBe(false);
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
    // 2026년 9월 13일은 일요일입니다.
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
    // 브라우저의 시간대로 변환하면 이 값이 하루 앞뒤로 밀릴 수 있습니다.
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
    // 10시에 열고 22시에 닫으면 12칸입니다.
    expect(slotCountOf(10, 22)).toBe(12);
  });

  it("마지막 칸은 닫는 시각에 끝난다", () => {
    // 마지막 칸 번호로 만든 시각이 닫는 시각과 맞아야 그 뒤로 칸이 남지 않습니다.
    const count = slotCountOf(10, 22);
    expect(slotLabel(count - 1, 10)).toBe("21:00");
    expect(slotLabel(count, 10)).toBe("22:00");
  });
});
