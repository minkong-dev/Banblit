import { describe, expect, test } from "vitest";

import { checkRunTimes, slotCountLabel } from "./runs";

describe("slotCountLabel", () => {
  test("칸 수를 사람이 읽는 말로 바꾼다", () => {
    expect(slotCountLabel(48)).toBe("48건");
  });

  test("한 칸도 없는 회차는 비어 있다고 말한다", () => {
    expect(slotCountLabel(0)).toBe("빈 배정기록");
  });
});

describe("checkRunTimes", () => {
  test("서로 다른 두 시각은 통과한다", () => {
    expect(checkRunTimes("09:00", "18:00")).toBe("");
  });

  test("두 시각이 같으면 거른다", () => {
    // 같은 시각을 두 번 두면 하루 두 번이 아니라 한 번이 된다.
    expect(checkRunTimes("09:00", "09:00")).toBe("1차와 2차 스케줄링 시간은 같을 수 없어요.");
  });

  test("한쪽이 비어 있으면 거른다", () => {
    // <input type="time"> 은 성한 "HH:MM" 아니면 빈 값만 준다. 빈 값만 거르면 된다.
    expect(checkRunTimes("09:00", "")).toBe("1차와 2차 스케줄링 시간을 모두 지정해주세요.");
    expect(checkRunTimes("", "18:00")).toBe("1차와 2차 스케줄링 시간을 모두 지정해주세요.");
  });
});
