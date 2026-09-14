import { describe, expect, test } from "vitest";

import { checkRunTimes, slotCountLabel } from "./runs";

describe("slotCountLabel", () => {
  test("칸 수를 사람이 읽는 말로 바꾼다", () => {
    expect(slotCountLabel(48)).toBe("48건");
  });

  test("한 칸도 없는 배정기록은 비어 있다고 말한다", () => {
    expect(slotCountLabel(0)).toBe("빈 배정기록");
  });
});

describe("checkRunTimes", () => {
  test("서로 다른 두 시각은 통과한다", () => {
    expect(checkRunTimes("09:00", "18:00")).toBe("");
  });

  test("두 시각이 같으면 거른다", () => {
    // 같은 시각을 2번 지정하면 하루 2번이 아니라 1번 계산됩니다.
    expect(checkRunTimes("09:00", "09:00")).toBe("1차와 2차 스케줄링 시간은 같을 수 없어요.");
  });

  test("한쪽이 비어 있으면 거른다", () => {
    // <input type="time"> 은 유효한 "HH:MM" 또는 빈 값만 제공합니다. 빈 값만 검증하면 됩니다.
    expect(checkRunTimes("09:00", "")).toBe("1차와 2차 스케줄링 시간을 모두 지정해주세요.");
    expect(checkRunTimes("", "18:00")).toBe("1차와 2차 스케줄링 시간을 모두 지정해주세요.");
  });
});
