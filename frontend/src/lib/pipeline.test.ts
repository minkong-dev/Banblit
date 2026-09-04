import { afterEach, describe, expect, it, vi } from "vitest";

import { isSignedIn, logOut } from "./pipeline";

/** vitest는 브라우저가 아니라 Node에서 돈다 — document 를 기본으로 주지 않아
 *  api.test.ts 가 localStorage 를 세우던 것과 같은 방식으로 흉내낸다. */
function stubCookie(value: string): void {
  vi.stubGlobal("document", { cookie: value });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isSignedIn", () => {
  it("쿠키가 아예 없으면 false다", () => {
    stubCookie("");
    expect(isSignedIn()).toBe(false);
  });

  it("banblit_signed_in=1 이 있으면 true다", () => {
    stubCookie("banblit_signed_in=1");
    expect(isSignedIn()).toBe(true);
  });

  it("다른 쿠키와 섞여 있어도 찾는다", () => {
    stubCookie("theme=dark; banblit_signed_in=1; other=x");
    expect(isSignedIn()).toBe(true);
  });

  it("값이 1이 아니면 false다 — 로그아웃 뒤 서버가 지운 자리를 흉내낸 값은 세지 않는다", () => {
    stubCookie("banblit_signed_in=0");
    expect(isSignedIn()).toBe(false);
  });
});

describe("logOut", () => {
  it("/logout 을 POST 로 부른다", async () => {
    const spy = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", spy);

    await logOut();

    const [url, init] = spy.mock.calls[0];
    expect(url).toBe("/api/logout");
    expect(init?.method).toBe("POST");
  });
});
