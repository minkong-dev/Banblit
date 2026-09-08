import { afterEach, describe, expect, test, vi } from "vitest";

import { askCancel, objectParticle } from "./confirm";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("objectParticle", () => {
  test("받침이 있으면 을", () => {
    expect(objectParticle("공지사항")).toBe("을");
  });

  test("받침이 없으면 를", () => {
    expect(objectParticle("새벽 네시")).toBe("를");
  });

  test("끝소리가 트처럼 받침 없는 글자면 를", () => {
    expect(objectParticle("오프비트")).toBe("를");
  });

  test("한글이 아니면 를", () => {
    expect(objectParticle("E2E")).toBe("를");
  });
});

describe("askCancel — 예약에는 취소라고 묻는다", () => {
  test("이름 뒤에 조사를 붙여 취소를 묻는다", () => {
    const asked: string[] = [];
    vi.stubGlobal("window", { confirm: (text: string) => { asked.push(text); return true; } });

    expect(askCancel("여섯줄 18:00–21:00 예약")).toBe(true);
    expect(asked[0]).toBe("여섯줄 18:00–21:00 예약을 취소할까요?");
  });

  test("아니오를 누르면 false 다", () => {
    vi.stubGlobal("window", { confirm: () => false });
    expect(askCancel("예약")).toBe(false);
  });
});
