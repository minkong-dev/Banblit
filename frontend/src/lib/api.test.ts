import { afterEach, describe, expect, it, vi } from "vitest";

import { getJSON, REQUEST_TIMEOUT_MS } from "./api";
import { getJSON as gatedJSON, setDevOffline } from "./pipeline";

/** fetch 를 가짜로 세운다. 단위 테스트는 실제 서버에 닿지 않는다. */
function stubFetch(handler: () => Promise<Response> | Promise<never>): void {
  vi.stubGlobal("fetch", vi.fn(handler));
}

/** AbortSignal.timeout 이 시간을 넘겼을 때 fetch 가 던지는 것과 같은 모양. */
function timeoutError(): DOMException {
  return new DOMException("signal timed out", "TimeoutError");
}

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

afterEach(() => {
  vi.unstubAllGlobals();
  setDevOffline(false);
});

describe("getJSON", () => {
  it("정상 답장의 본문을 그대로 돌려준다", async () => {
    stubFetch(async () => jsonResponse({ rows: [] }));

    await expect(getJSON("/periods/1/schedule")).resolves.toEqual({ rows: [] });
  });

  it("모든 요청에 시간 제한을 붙인다", async () => {
    const spy = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse({}));
    vi.stubGlobal("fetch", spy);

    await getJSON("/health");

    const init = spy.mock.calls[0][1];
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("시간을 넘기면 사람이 읽는 문구로 바꿔 올린다", async () => {
    stubFetch(async () => {
      throw timeoutError();
    });

    await expect(getJSON("/health")).rejects.toThrow(
      `서버가 ${REQUEST_TIMEOUT_MS / 1000}초 안에 답하지 않아 끊었습니다`,
    );
  });

  it("서버에 닿지 못하면 그 사실을 알린다", async () => {
    stubFetch(async () => {
      throw new TypeError("Failed to fetch");
    });

    await expect(getJSON("/health")).rejects.toThrow("서버에 닿지 못했습니다");
  });

  it("서버가 거절하면 서버가 적어 보낸 사유를 그대로 올린다", async () => {
    stubFetch(async () => jsonResponse({ detail: "그런 기간이 없습니다" }, 422));

    await expect(getJSON("/periods/9/schedule")).rejects.toThrow("그런 기간이 없습니다");
  });

  it("사유 없는 거절도 상태 번호로 알린다", async () => {
    stubFetch(async () => new Response("", { status: 503 }));

    await expect(getJSON("/health")).rejects.toThrow("503");
  });

  it("연결 끊긴 상태로 보기가 켜져 있으면 실제로 fetch 하지 않고 실패한다", async () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    setDevOffline(true);

    await expect(gatedJSON("/rooms")).rejects.toThrow("서버에 닿지 못했습니다");
    expect(spy).not.toHaveBeenCalled();
  });

  it("보내는 쪽이 준 설정을 지운 채 부르지 않는다", async () => {
    const spy = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse({}));
    vi.stubGlobal("fetch", spy);

    await getJSON("/periods/1/assign", { method: "POST" });

    const init = spy.mock.calls[0][1];
    expect(init?.method).toBe("POST");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });
});
