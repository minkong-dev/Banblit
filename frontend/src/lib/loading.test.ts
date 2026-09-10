import { describe, expect, it } from "vitest";

import { loadState, stateText } from "./loading";

describe("loadState — 물어본 결과를 상태 값으로", () => {
  it("아직 오지 않았으면 loading", () => {
    expect(loadState({ isPending: true, error: null })).toEqual({ kind: "loading" });
  });

  it("성하게 왔으면 ready", () => {
    expect(loadState({ isPending: false, error: null })).toEqual({ kind: "ready" });
  });

  it("걸렸으면 사유를 함께 든다", () => {
    const state = loadState({ isPending: false, error: new Error("서버로부터 응답을 받지 못했어요") });
    expect(state).toEqual({ kind: "failed", why: "서버로부터 응답을 받지 못했어요" });
  });

  it("사유가 Error 가 아니어도 한 줄로 만든다", () => {
    expect(loadState({ isPending: false, error: "쿵" })).toEqual({
      kind: "failed",
      why: "알 수 없는 오류가 발생했어요. 잠시 후 다시 시도해주세요.",
    });
  });

  it("불러오는 중이면 걸린 것보다 그쪽을 먼저 말한다", () => {
    // 다시 불러오는 동안에는 지난번 사유가 아니라 불러오는 중이 맞다.
    expect(loadState({ isPending: true, error: new Error("지난번 사유") })).toEqual({
      kind: "loading",
    });
  });
});

describe("stateText — 목록 대신 넣을 한 줄", () => {
  it("불러오는 중이라고 말한다", () => {
    expect(stateText({ kind: "loading" }, "아직 없습니다")).toBe("불러오는 중…");
  });

  it("걸렸으면 그 사유를 그대로 보여준다", () => {
    expect(stateText({ kind: "failed", why: "쿵" }, "아직 없습니다")).toBe("쿵");
  });

  it("성한데 비었으면 비었다고 말한다", () => {
    expect(stateText({ kind: "ready" }, "아직 없습니다")).toBe("아직 없습니다");
  });

  it("사유가 loading 이라는 글자여도 불러오는 중으로 읽지 않는다", () => {
    // 문자열 한 값에 세 의미를 담던 때 서로를 가리던 자리다.
    expect(stateText({ kind: "failed", why: "loading" }, "아직 없습니다")).toBe("loading");
  });
});
