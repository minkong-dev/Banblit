import { describe, expect, test } from "vitest";

import { objectParticle } from "./confirm";

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
