import { describe, expect, it } from "vitest";

import { edgeChoice, moveChoice, openAt } from "./dropdown";
import type { Choice } from "./dropdown";

const CHOICES: Choice<number>[] = [
  { value: 5, label: "5분" },
  { value: 10, label: "10분", disabled: true },
  { value: 15, label: "15분" },
  { value: 20, label: "20분", disabled: true },
];

describe("moveChoice — 화살표로 선택지를 옮긴다", () => {
  it("고를 수 없는 선택지를 건너뛴다", () => {
    expect(moveChoice(CHOICES, 0, 1)).toBe(2);
  });

  it("끝에서 더 내려가면 제자리에 남는다", () => {
    expect(moveChoice(CHOICES, 2, 1)).toBe(2);
  });

  it("위로도 같은 규칙으로 건너뛴다", () => {
    expect(moveChoice(CHOICES, 2, -1)).toBe(0);
  });

  it("고를 수 있는 선택지가 하나도 없으면 -1 이다", () => {
    expect(moveChoice([{ value: 1, label: "하나", disabled: true }], 0, 1)).toBe(-1);
  });
});

describe("edgeChoice — Home 과 End", () => {
  it("처음에서 고를 수 있는 첫 선택지를 찾는다", () => {
    expect(edgeChoice(CHOICES, 1)).toBe(0);
  });

  it("끝에서는 고를 수 없는 마지막을 건너뛴다", () => {
    expect(edgeChoice(CHOICES, -1)).toBe(2);
  });
});

describe("openAt — 목록을 열 때 커서 위치", () => {
  it("지금 고른 값에 커서를 둔다", () => {
    expect(openAt(CHOICES, 15)).toBe(2);
  });

  it("지금 고른 값이 고를 수 없으면 첫 번째로 간다", () => {
    expect(openAt(CHOICES, 10)).toBe(0);
  });

  it("목록에 없는 값이어도 첫 번째로 간다", () => {
    expect(openAt(CHOICES, 99)).toBe(0);
  });
});
