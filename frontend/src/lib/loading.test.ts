import { describe, expect, it } from "vitest";

import { firstWhy, loadState, stateText, stillUnresolved } from "./loading";

describe("firstWhy — 조회 여러 개 중 처음 실패한 사유", () => {
  it("전부 성공했을 경우 빈 문자열을 반환한다", () => {
    expect(firstWhy([null, null, null])).toBe("");
  });

  it("조회가 하나도 없을 경우 빈 문자열을 반환한다", () => {
    expect(firstWhy([])).toBe("");
  });

  it("실패가 하나면 그 사유를 반환한다", () => {
    expect(firstWhy([null, new Error("합주실을 못 불러왔어요"), null])).toBe("합주실을 못 불러왔어요");
  });

  it("실패가 둘 이상이면 앞의 것을 반환한다", () => {
    expect(firstWhy([new Error("먼저"), new Error("나중")])).toBe("먼저");
  });

  it("undefined 도 성공으로 취급한다", () => {
    // TanStack Query 는 실패하지 않은 조회의 error 를 null 로 둡니다. 조회 결과를 직접
    // 넘기는 호출부가 undefined 를 줄 수 있으므로 둘 다 실패가 아닌 것으로 판정합니다.
    expect(firstWhy([undefined, null])).toBe("");
  });

  it("Error 가 아닌 값이 실패로 들어오면 reason 의 기본 문구를 반환한다", () => {
    expect(firstWhy(["문자열 오류"])).toBe("알 수 없는 오류가 발생했어요. 잠시 후 다시 시도해주세요.");
  });
});

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
    // 다시 불러오는 동안에는 이전 오류 메시지가 아니라 불러오는 중 상태여야 합니다.
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
    // 문자열 값 하나에 상태 3가지를 담았을 때 오류 메시지와 상태가 충돌하던 경우입니다.
    expect(stateText({ kind: "failed", why: "loading" }, "아직 없습니다")).toBe("loading");
  });
});

describe("stillUnresolved — 한 번 실패한 뒤 아직 받아 둔 값이 없는 조회", () => {
  it("실패한 적이 있고 받아 둔 값이 없으면 true 를 반환한다", () => {
    expect(stillUnresolved({ data: undefined, errorUpdateCount: 1 })).toBe(true);
  });

  it("다시 조회하는 중에도 true 를 유지한다", () => {
    // 받아 둔 값이 없는 조회를 다시 조회하면 TanStack Query 가 error 를 null 로, status 를 pending 으로
    // 되돌립니다(query-core 의 fetchState). error 로 판정하면 재조회마다 안내가 사라졌다가 다시 나타납니다.
    expect(stillUnresolved({ data: undefined, errorUpdateCount: 2 })).toBe(true);
  });

  it("받아 둔 값이 있으면 false 를 반환한다", () => {
    expect(stillUnresolved({ data: { account: { id: 1 } }, errorUpdateCount: 3 })).toBe(false);
  });

  it("한 번도 실패하지 않았으면 false 를 반환한다", () => {
    expect(stillUnresolved({ data: undefined, errorUpdateCount: 0 })).toBe(false);
  });
});
