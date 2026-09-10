import { afterEach, describe, expect, it, vi } from "vitest";

import {
  addUnavailable,
  cancelBooking,
  checkAttachments,
  findId,
  isSignedIn,
  logOut,
  removeUnavailable,
  requestPasswordReset,
  resetPassword,
  weekKeys,
} from "./pipeline";

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

describe("weekKeys", () => {
  it("그 달 15일이 든 주를 일요일부터 토요일까지 돌려준다", () => {
    // 2026년 9월 15일은 화요일이고, 그 주 일요일은 9월 13일이다.
    expect(weekKeys(2026, 8, 0)).toEqual([
      "2026-09-13", "2026-09-14", "2026-09-15",
      "2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19",
    ]);
  });

  it("앞으로 한 주 옮기면 이레 뒤 주가 된다", () => {
    expect(weekKeys(2026, 8, 1)[0]).toBe("2026-09-20");
  });

  it("뒤로 한 주 옮기면 이레 앞 주가 된다", () => {
    expect(weekKeys(2026, 8, -1)[0]).toBe("2026-09-06");
  });

  it("달을 넘어가는 주는 앞뒤 달 날짜가 한 줄에 같이 온다", () => {
    const days = weekKeys(2026, 8, 2);
    expect(days[0]).toBe("2026-09-27");
    expect(days[6]).toBe("2026-10-03");
  });

  it("해를 넘어가도 이어진다", () => {
    // 2026년 12월 15일이 든 주는 12월 13일에 시작한다. 세 주 뒤는 2027년이다.
    expect(weekKeys(2026, 11, 3)[0]).toBe("2027-01-03");
  });
});

/** fetch 에 실린 본문은 BodyInit 이라 그대로는 못 읽는다 — 글자로 보낸 것만 다루므로
 *  string 으로 좁혀 JSON 으로 되돌린다. */
function sentBody(init: RequestInit | undefined): Record<string, unknown> {
  return JSON.parse(init?.body as string) as Record<string, unknown>;
}

describe("addUnavailable", () => {
  it("매주 반복을 켜면 repeats_weekly 를 실어 보낸다", async () => {
    const spy = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ time: { id: 1 } }), { status: 201 }),
    );
    vi.stubGlobal("fetch", spy);

    await addUnavailable(7, "2026-09-14T18:00:00", "2026-09-14T20:00:00", "weekly", "시험");

    const [url, init] = spy.mock.calls[0];
    expect(url).toBe("/api/members/7/unavailable");
    expect(sentBody(init)).toEqual({
      starts_at: "2026-09-14T18:00:00",
      ends_at: "2026-09-14T20:00:00",
      repeats_daily: false,
      repeats_weekly: true,
      reason: "시험",
    });
  });

  it("매일 반복을 켜면 repeats_daily 만 실어 보낸다", async () => {
    const spy = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ time: { id: 1 } }), { status: 201 }),
    );
    vi.stubGlobal("fetch", spy);

    await addUnavailable(7, "2026-09-14T18:00:00", "2026-09-14T20:00:00", "daily", "");

    const body = sentBody(spy.mock.calls[0][1]);
    expect(body.repeats_daily).toBe(true);
    expect(body.repeats_weekly).toBe(false);
  });

  it("켜지 않으면 두 반복이 다 거짓으로 나간다", async () => {
    const spy = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ time: { id: 1 } }), { status: 201 }),
    );
    vi.stubGlobal("fetch", spy);

    await addUnavailable(7, "2026-09-14T18:00:00", "2026-09-14T20:00:00", "none", "");

    const body = sentBody(spy.mock.calls[0][1]);
    expect(body.repeats_daily).toBe(false);
    expect(body.repeats_weekly).toBe(false);
  });

  it("사유가 공백뿐이면 null 로 나간다 — 빈 줄을 남기지 않는다", async () => {
    const spy = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ time: { id: 1 } }), { status: 201 }),
    );
    vi.stubGlobal("fetch", spy);

    await addUnavailable(7, "2026-09-14T18:00:00", "2026-09-14T20:00:00", "none", "   ");

    expect(sentBody(spy.mock.calls[0][1]).reason).toBeNull();
  });
});

describe("checkAttachments", () => {
  it("고른 파일이 없으면 통과한다 — 첨부는 선택이다", () => {
    expect(checkAttachments([])).toBe("");
  });

  it("전부 성하면 빈 글자를 돌려준다", () => {
    expect(checkAttachments([
      { name: "악보.pdf", size: 1024 },
      { name: "연습.mp3", size: 2048 },
    ])).toBe("");
  });

  it("걸린 파일이 있으면 어느 파일이 왜 걸렸는지 함께 돌려준다", () => {
    expect(checkAttachments([
      { name: "악보.pdf", size: 1024 },
      { name: "설치.exe", size: 1024 },
    ])).toBe(
      "설치.exe: 올릴 수 없는 형식입니다. 사진·소리·영상과 문서(md, txt, pdf, docx, ppt, pptx, hwp, xlsx, zip)만 올릴 수 있습니다.",
    );
  });

  it("걸린 파일이 여럿이면 앞의 것 하나만 알린다", () => {
    expect(checkAttachments([
      { name: "설치.exe", size: 1024 },
      { name: "공연.mp4", size: 400 * 1024 * 1024 },
    ])).toContain("설치.exe");
  });
});

describe("아이디 찾기와 비밀번호 재설정", () => {
  function okOnce() {
    const spy = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({}), { status: 200 }),
    );
    vi.stubGlobal("fetch", spy);
    return spy;
  }

  it("findId 는 이름과 이메일을 /find-id 로 보낸다", async () => {
    const spy = okOnce();

    await findId("박서연", "seoyeon@example.com");

    const [url, init] = spy.mock.calls[0];
    expect(url).toBe("/api/find-id");
    expect(init?.method).toBe("POST");
    expect(sentBody(init)).toEqual({ name: "박서연", email: "seoyeon@example.com" });
  });

  it("requestPasswordReset 은 이메일만 /password-reset 으로 보낸다", async () => {
    const spy = okOnce();

    await requestPasswordReset("seoyeon@example.com");

    const [url, init] = spy.mock.calls[0];
    expect(url).toBe("/api/password-reset");
    expect(sentBody(init)).toEqual({ email: "seoyeon@example.com" });
  });

  it("resetPassword 는 토큰과 새 비밀번호를 함께 보낸다", async () => {
    const spy = okOnce();

    await resetPassword("tok-en", "Newpass1!");

    const [url, init] = spy.mock.calls[0];
    expect(url).toBe("/api/password-reset/confirm");
    expect(sentBody(init)).toEqual({ token: "tok-en", password: "Newpass1!" });
  });
});

describe("cancelBooking", () => {
  it("이어 잡은 칸을 번호마다 하나씩 지운다", async () => {
    // Arrange — 서버는 칸 하나씩만 지운다. 한 건이 세 칸이면 세 번 불러야 한다.
    const spy = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(null, { status: 204 }),
    );
    vi.stubGlobal("fetch", spy);

    // Act
    await cancelBooking([11, 12, 13]);

    // Assert
    expect(spy.mock.calls.map(([url]) => url)).toEqual([
      "/api/reservations/11",
      "/api/reservations/12",
      "/api/reservations/13",
    ]);
    expect(spy.mock.calls.every(([, init]) => init?.method === "DELETE")).toBe(true);
  });

  it("한 칸이 걸리면 거기서 멈추고 사유를 올린다", async () => {
    // 이미 지운 칸은 되살리지 않는다 — 다시 눌러 남은 것을 마저 지우면 된다.
    const spy = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) =>
      String(input).endsWith("/12")
        ? new Response(JSON.stringify({ detail: "취소할 예약이 없습니다" }), { status: 404 })
        : new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", spy);

    await expect(cancelBooking([11, 12, 13])).rejects.toThrow("취소할 예약이 없습니다");
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe("removeUnavailable", () => {
  it("내 번호와 일정 번호를 주소에 실어 지운다", async () => {
    const spy = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(null, { status: 204 }),
    );
    vi.stubGlobal("fetch", spy);

    await removeUnavailable(7, 42);

    const [url, init] = spy.mock.calls[0];
    expect(url).toBe("/api/members/7/unavailable/42");
    expect(init?.method).toBe("DELETE");
  });
});
