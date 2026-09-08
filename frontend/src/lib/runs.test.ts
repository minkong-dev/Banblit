import { describe, expect, test } from "vitest";

import { checkRunTimes, slotCountLabel } from "./runs";

describe("slotCountLabel", () => {
  test("칸 수를 사람이 읽는 말로 바꾼다", () => {
    expect(slotCountLabel(48)).toBe("48칸");
  });

  test("한 칸도 없는 회차는 비어 있다고 말한다", () => {
    expect(slotCountLabel(0)).toBe("빈 회차");
  });
});

describe("checkRunTimes", () => {
  test("서로 다른 두 시각은 통과한다", () => {
    expect(checkRunTimes("09:00", "18:00")).toBe("");
  });

  test("두 시각이 같으면 거른다", () => {
    // 같은 시각을 두 번 두면 하루 두 번이 아니라 한 번이 된다.
    expect(checkRunTimes("09:00", "09:00")).toBe("두 계산 시각은 서로 달라야 합니다");
  });

  test("한쪽이 비어 있으면 거른다", () => {
    // <input type="time"> 은 성한 "HH:MM" 아니면 빈 값만 준다. 빈 값만 거르면 된다.
    expect(checkRunTimes("09:00", "")).toBe("계산 시각을 두 개 다 정해 주세요");
    expect(checkRunTimes("", "18:00")).toBe("계산 시각을 두 개 다 정해 주세요");
  });
});
