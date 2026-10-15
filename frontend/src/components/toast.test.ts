import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { readToast, say } from "./toast";

// vitest 는 Node 에서 실행되어 window 가 없으므로 timer 만 있는 window 를 만듭니다.
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("window", { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("문구를 다시 표시하면 앞 문구의 timer 가 취소되고, 새 문구는 HOLD_MS 뒤에 사라진다", () => {
  say("첫 문구");
  vi.advanceTimersByTime(2500);

  say("둘째 문구");
  vi.advanceTimersByTime(200);
  expect(readToast()).toBe("둘째 문구");

  vi.advanceTimersByTime(2400);
  expect(readToast()).toBe("");
});
