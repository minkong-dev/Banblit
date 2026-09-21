import { describe, expect, it } from "vitest";

import { crashDetail } from "./fallback";

describe("crashDetail", () => {
  it("Error 를 받으면 이름과 메시지를 한 줄로 반환한다", () => {
    expect(crashDetail(new TypeError("x is not a function"))).toBe(
      "TypeError: x is not a function",
    );
  });

  it("Error 가 아닌 값을 받으면 그 값을 문자열로 반환한다", () => {
    expect(crashDetail("문자열 오류")).toBe("문자열 오류");
    expect(crashDetail(404)).toBe("404");
  });

  it("null 과 undefined 를 받으면 빈 문자열을 반환한다", () => {
    expect(crashDetail(null)).toBe("");
    expect(crashDetail(undefined)).toBe("");
  });

  it("객체를 받으면 JSON 으로 변환해 반환한다", () => {
    expect(crashDetail({ code: 500, at: "board" })).toBe('{"code":500,"at":"board"}');
  });

  it("JSON 으로 변환할 수 없는 값은 종류만 반환한다", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(crashDetail(cyclic)).toBe("표시할 수 없는 object 오류");
  });

  it("메시지가 없는 Error 는 이름만 반환한다", () => {
    expect(crashDetail(new Error(""))).toBe("Error");
  });
});

describe("crashDetail 의 그 밖의 종류", () => {
  it("함수를 받으면 종류만 반환한다", () => {
    expect(crashDetail(() => 1)).toBe("표시할 수 없는 function 오류");
  });
});
