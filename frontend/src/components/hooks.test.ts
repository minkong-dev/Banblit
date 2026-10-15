// idParam 은 주소의 번호 자리(:postId 등)를 정수로 읽습니다. 정수가 아니면 null 이라 상세 화면을 열지 않습니다.

import { describe, expect, it } from "vitest";

import { idParam } from "./hooks";

describe("idParam — 주소의 번호 자리", () => {
  it("정수 문자열이면 그 번호를 반환한다", () => {
    expect(idParam("42")).toBe(42);
  });

  it("없거나 정수가 아니면 null 을 반환한다", () => {
    expect(idParam(undefined)).toBeNull();
    expect(idParam("abc")).toBeNull();
    expect(idParam("1.5")).toBeNull();
  });
});
