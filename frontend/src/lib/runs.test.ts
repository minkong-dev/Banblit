import { describe, expect, test } from "vitest";

import { appliedLabel, checkRunTimes, scoreLabel } from "./runs";

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

describe("scoreLabel", () => {
  test("100점 만점 점수만 적는다", () => {
    expect(scoreLabel({ fewest: 2, sessions: 6, absences: 1, joined: 3, points: 92 })).toBe("92점");
  });

  test("점수가 없으면 빈 문자열이다", () => {
    expect(scoreLabel(null)).toBe("");
  });
});

describe("appliedLabel", () => {
  test("확정한 기록에는 날짜와 확정을 붙인다", () => {
    expect(appliedLabel("2026-10-15T21:03:00")).toBe("10월 15일 확정");
  });

  test("확정한 적 없는 기록은 빈 문자열이다", () => {
    expect(appliedLabel(null)).toBe("");
  });
});
