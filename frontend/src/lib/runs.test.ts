import { describe, expect, test } from "vitest";

import { backupLabel, checkRunTimes, runTimeOptions, slotCountLabel } from "./runs";

describe("backupLabel", () => {
  test("저장 시각을 월·일·시:분으로 읽는다", () => {
    // Arrange
    const savedAt = "2026-09-07T18:03:00";

    // Act
    const label = backupLabel(savedAt);

    // Assert
    expect(label).toBe("9월 7일 18:03");
  });

  test("시간대가 붙어 와도 글자를 그대로 자른다", () => {
    // 서버는 시간대 없는 값을 주지만, 붙어 오더라도 날짜가 밀지 않아야 한다.
    expect(backupLabel("2026-01-31T23:30:00+09:00")).toBe("1월 31일 23:30");
  });

  test("읽을 수 없는 값은 원문을 그대로 돌려준다", () => {
    expect(backupLabel("모르는 값")).toBe("모르는 값");
  });
});

describe("slotCountLabel", () => {
  test("칸 수를 사람이 읽는 말로 바꾼다", () => {
    expect(slotCountLabel(48)).toBe("48칸");
  });

  test("한 칸도 없는 회차는 비어 있다고 말한다", () => {
    expect(slotCountLabel(0)).toBe("빈 회차");
  });
});

describe("runTimeOptions", () => {
  test("하루를 30분으로 쪼갠 48개를 만든다", () => {
    // Act
    const options = runTimeOptions();

    // Assert
    expect(options).toHaveLength(48);
    expect(options[0]).toBe("00:00");
    expect(options[1]).toBe("00:30");
    expect(options[47]).toBe("23:30");
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

  test("HH:MM 이 아닌 값은 거른다", () => {
    expect(checkRunTimes("9시", "18:00")).toBe("계산 시각은 HH:MM 형식이어야 합니다");
    expect(checkRunTimes("09:00", "")).toBe("계산 시각은 HH:MM 형식이어야 합니다");
  });
});
