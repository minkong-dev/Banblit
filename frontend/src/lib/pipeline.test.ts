import { afterEach, describe, expect, it, vi } from "vitest";

import { addUnavailable, cancelBooking, checkAttachments, checkPeriod, ensembleSaveOrder, expelMember, findId, loadReservationRows, NO_REPEAT, logOut, openingHours, periodBody, rejectBooking, rejectUnavailable, removeUnavailable, unfixPeriod, requestPasswordReset, saveSettings, resetPassword } from "./pipeline";
import { isSignedIn } from "./api";
import { JOB_DEADLINE_MS, awaitJob } from "./pipeline";
import type { Job } from "./pipeline";
import { AttachmentFailed, loadScheduleRows, publishWithAttachments, repeatConflict, saveSeats, saveTeam } from "./pipeline";
import { weekKeys } from "./calendar";

/** vitest 는 브라우저가 아니라 Node 에서 실행됩니다. document 를 기본으로 제공하지 않으므로
 *  api.test.ts 가 localStorage 를 mock 으로 만든 것과 같은 방식으로 만듭니다. */
function stubCookie(value: string): void {
  vi.stubGlobal("document", { cookie: value });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("openingHours", () => {
  it("점유 단위가 30분이면 30분 자리의 개수를 시간으로 환산해 표시한다", () => {
    const rooms = [{ name: "A", opens_at: "18:30", closes_at: "22:00" }];

    expect(openingHours({ rooms, days: 1, teams: 2, slotMinutes: 30 })).toEqual({
      perDay: "3.5시간", total: "3.5시간", perTeam: "1.5시간", leftover: "0.5시간",
    });
  });
});

describe("loadReservationRows", () => {
  it("합주실 3개의 요청을 앞 요청의 응답을 기다리지 않고 동시에 보낸다", () => {
    // Arrange: 응답이 오지 않는 fetch. 순차 호출이면 1번째 요청에서 멈춰 호출 횟수가 1 입니다.
    const spy = vi.fn(() => new Promise<Response>(() => undefined));
    vi.stubGlobal("fetch", spy);

    // Act
    void loadReservationRows([1, 2, 3], "2026-09-14", "2026-09-20");

    // Assert
    expect(spy).toHaveBeenCalledTimes(3);
  });
});

describe("ensembleSaveOrder — 기간 저장과 전체 합주 저장의 요청 순서", () => {
  const before = {
    starts_on: "2026-09-01",
    ends_on: "2026-09-20",
    everyday: false,
    ensemble: { starts_on: "2026-09-11", ends_on: "2026-09-13" },
  };

  it("새 기간은 기간을 먼저 만들어야 전체 합주를 지정할 번호가 생긴다", () => {
    expect(ensembleSaveOrder(null, { starts_on: "2026-09-01", ends_on: "2026-09-02" }))
      .toEqual(["period", "ensemble"]);
    expect(ensembleSaveOrder(null, null)).toEqual(["period"]);
  });

  it("해제는 기간 수정보다 먼저 보낸다. 줄인 기간 밖에 옛 전체 합주가 남아 거절되지 않게 한다", () => {
    expect(ensembleSaveOrder(before, null)).toEqual(["clearEnsemble", "period"]);
    expect(ensembleSaveOrder({ ...before, ensemble: null }, null)).toEqual(["period"]);
  });

  it("새 전체 합주 범위가 저장된 기간 안이면 전체 합주를 먼저 보낸다", () => {
    expect(ensembleSaveOrder(before, { starts_on: "2026-09-01", ends_on: "2026-09-03" }))
      .toEqual(["ensemble", "period"]);
  });

  it("새 전체 합주 범위가 저장된 기간 밖이면 기간을 먼저 늘린다", () => {
    expect(ensembleSaveOrder(before, { starts_on: "2026-09-20", ends_on: "2026-09-25" }))
      .toEqual(["period", "ensemble"]);
  });

  it("저장된 기간이 매일이면 시작일 이후의 범위는 전부 기간 안이다", () => {
    const everyday = { ...before, ends_on: "2026-09-01", everyday: true };
    expect(ensembleSaveOrder(everyday, { starts_on: "2026-12-01", ends_on: "2026-12-02" }))
      .toEqual(["ensemble", "period"]);
  });
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
    // 2026년 9월 15일은 화요일이고, 그 주 일요일은 9월 13일입니다.
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
    // 2026년 12월 15일이 포함된 주는 12월 13일에 시작합니다. 3주 뒤는 2027년입니다.
    expect(weekKeys(2026, 11, 3)[0]).toBe("2027-01-03");
  });
});

/** fetch 에 전달된 본문은 BodyInit 타입이라 그대로 읽을 수 없습니다. 문자열로 보낸 본문만 다루므로
 *  string 으로 좁혀 JSON 으로 변환합니다. */
function sentBody(init: RequestInit | undefined): Record<string, unknown> {
  return JSON.parse(init?.body as string) as Record<string, unknown>;
}

describe("addUnavailable", () => {
  it("고른 요일을 repeat_weekdays 로 실어 보낸다", async () => {
    const spy = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ time: { id: 1 } }), { status: 201 }),
    );
    vi.stubGlobal("fetch", spy);

    await addUnavailable(7, "2026-09-14T18:00:00", "2026-09-14T20:00:00", { weekdays: 0b0000001, count: null, until: null }, "시험", " 기말 ");

    const [url, init] = spy.mock.calls[0];
    expect(url).toBe("/api/members/7/unavailable");
    expect(sentBody(init)).toEqual({
      starts_at: "2026-09-14T18:00:00",
      ends_at: "2026-09-14T20:00:00",
      repeat_weekdays: 0b0000001,
      repeat_count: null,
      repeat_until: null,
      reason: "시험",
      name: "기말",
    });
  });

  it("일곱 요일 전부와 횟수를 함께 실어 보낸다", async () => {
    const spy = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ time: { id: 1 } }), { status: 201 }),
    );
    vi.stubGlobal("fetch", spy);

    await addUnavailable(7, "2026-09-14T18:00:00", "2026-09-14T20:00:00", { weekdays: 0b1111111, count: 3, until: null }, "", "");

    const body = sentBody(spy.mock.calls[0][1]);
    expect(body.repeat_weekdays).toBe(0b1111111);
    expect(body.repeat_count).toBe(3);
  });

  it("반복하지 않으면 세 값이 전부 null 로 나간다", async () => {
    const spy = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ time: { id: 1 } }), { status: 201 }),
    );
    vi.stubGlobal("fetch", spy);

    await addUnavailable(7, "2026-09-14T18:00:00", "2026-09-14T20:00:00", NO_REPEAT, "", "");

    const body = sentBody(spy.mock.calls[0][1]);
    expect(body.repeat_weekdays).toBeNull();
    expect(body.repeat_count).toBeNull();
    expect(body.repeat_until).toBeNull();
  });

  it("사유가 공백뿐이면 null 로 나간다 — 빈 줄을 남기지 않는다", async () => {
    const spy = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ time: { id: 1 } }), { status: 201 }),
    );
    vi.stubGlobal("fetch", spy);

    await addUnavailable(7, "2026-09-14T18:00:00", "2026-09-14T20:00:00", NO_REPEAT, "   ", "  ");

    const body = sentBody(spy.mock.calls[0][1]);
    expect(body.reason).toBeNull();
    expect(body.name).toBeNull();
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
      "설치.exe: 지원하지 않는 파일 형식이에요. 파일명을 확인해주세요.",
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
  it("예약 한 건을 한 번의 요청으로 취소한다", () => {
    // Arrange: 서버가 구간 한 행으로 들고 있어 두 시간짜리 예약도 요청 한 번입니다.
    const spy = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(null, { status: 204 }),
    );
    vi.stubGlobal("fetch", spy);

    // Act, Assert
    return cancelBooking(11).then(() => {
      expect(spy.mock.calls.map(([url]) => url)).toEqual(["/api/reservations/11"]);
      expect(spy.mock.calls.every(([, init]) => init?.method === "DELETE")).toBe(true);
    });
  });

  it("서버가 거절하면 사유를 올린다", async () => {
    const spy = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ detail: "취소할 예약이 없습니다" }), { status: 404 }));
    vi.stubGlobal("fetch", spy);

    await expect(cancelBooking(11)).rejects.toThrow("취소할 예약이 없습니다");
    expect(spy).toHaveBeenCalledTimes(1);
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

describe("periodBody", () => {
  it("매일이 켜진 집중 합주기간은 종료일 대신 시작일을 보내고, 종료일 검증도 통과한다", () => {
    const form = { kind: "focused", everyday: true, starts_on: "2026-09-20", ends_on: "" };
    expect(periodBody(form).ends_on).toBe("2026-09-20");
    expect(checkPeriod(form)).toBe("");
  });

  it("매일이 꺼져 있으면 입력한 종료일을 그대로 보낸다", () => {
    const form = { kind: "focused", everyday: false, starts_on: "2026-09-20", ends_on: "2026-09-27" };
    expect(periodBody(form)).toEqual(form);
  });
});

describe("saveSettings", () => {
  const reply = (body: object) =>
    vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );

  it("/settings 를 PATCH 로 호출하고 고른 값을 보낸다", async () => {
    const spy = reply({ slot_minutes: 30, session_minutes: 60 });
    vi.stubGlobal("fetch", spy);

    const saved = await saveSettings({ slotMinutes: 30 });

    const [url, init] = spy.mock.calls[0];
    expect(url).toBe("/api/settings");
    expect(init?.method).toBe("PATCH");
    expect(saved).toEqual({ slotMinutes: 30, sessionMinutes: 60 });
  });

  it("두 값을 함께 보내면 한 요청에 담는다", async () => {
    // 30분 합주로 내리려면 칸도 함께 내려야 합니다. 요청을 나누면 중간 상태가 거절됩니다.
    const spy = reply({ slot_minutes: 30, session_minutes: 30 });
    vi.stubGlobal("fetch", spy);

    await saveSettings({ slotMinutes: 30, sessionMinutes: 30 });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(sentBody(spy.mock.calls[0][1])).toEqual({ slot_minutes: 30, session_minutes: 30 });
  });

  it("보내지 않은 값은 요청에 담지 않는다", async () => {
    // 서버는 담기지 않은 값을 그대로 둡니다. null 을 보내면 값을 지우라는 뜻이 되어 다릅니다.
    const spy = reply({ slot_minutes: 60, session_minutes: 90 });
    vi.stubGlobal("fetch", spy);

    await saveSettings({ sessionMinutes: 90 });

    expect(sentBody(spy.mock.calls[0][1])).toEqual({ session_minutes: 90 });
  });
});

describe("expelMember", () => {
  it("/members/{id} 를 DELETE 로 호출한다", async () => {
    const spy = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(null, { status: 204 }),
    );
    vi.stubGlobal("fetch", spy);

    await expelMember(7);

    const [url, init] = spy.mock.calls[0];
    expect(url).toBe("/api/members/7");
    expect(init?.method).toBe("DELETE");
  });
});

// routes/Assignment.tsx 는 ["schedule", activePeriodId](숫자 하나)를, routes/Scheduler.tsx 는
// ["schedule", periodIds](배열 하나)를 queryKey 로 씁니다. 배정을 확정해도 배정 화면이 자신의
// key 만 무효화하면 캘린더 화면의 key 모양이 달라 무효화되지 않아 이전 배정이 그대로 표시되던 문제였습니다.
describe("rejectBooking · rejectUnavailable", () => {
  function stubFetch() {
    const spy = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(null, { status: 204 }),
    );
    vi.stubGlobal("fetch", spy);
    return spy;
  }

  it("예약 반려는 사유를 실어 예약의 reject 주소로 POST 한다", async () => {
    const spy = stubFetch();

    await rejectBooking(11, "점검 날이에요");

    const [url, init] = spy.mock.calls[0];
    expect(url).toBe("/api/reservations/11/reject");
    expect(init?.method).toBe("POST");
    expect(sentBody(init)).toEqual({ reason: "점검 날이에요" });
  });

  it("불가능 일정 반려는 멤버 번호와 일정 번호로 만든 reject 주소로 같은 본문을 보낸다", async () => {
    const spy = stubFetch();

    await rejectUnavailable(3, 7, "리허설이에요");

    const [url, init] = spy.mock.calls[0];
    expect(url).toBe("/api/members/3/unavailable/7/reject");
    expect(init?.method).toBe("POST");
    expect(sentBody(init)).toEqual({ reason: "리허설이에요" });
  });

  it("확정 해제는 사유를 실어 기간의 unfix 주소로 POST 한다", async () => {
    const spy = stubFetch();

    await unfixPeriod(5, "팀 하나가 해체되었어요");

    const [url, init] = spy.mock.calls[0];
    expect(url).toBe("/api/periods/5/unfix");
    expect(init?.method).toBe("POST");
    expect(sentBody(init)).toEqual({ reason: "팀 하나가 해체되었어요" });
  });
});

describe("publishWithAttachments — 첨부를 먼저 올리고 발행한다", () => {
  /** XMLHttpRequest 대신 쓰는 가짜입니다. send 가 불리면 바로 성공하거나 실패합니다. */
  function stubUpload(calls: string[], fail: boolean): void {
    class FakeXhr {
      status = fail ? 422 : 201;
      responseText = JSON.stringify(fail ? { detail: "올릴 수 없는 파일 종류예요" } : { attachment: { id: 1 } });
      upload = { onprogress: null as unknown };
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      ontimeout: (() => void) | null = null;
      timeout = 0;
      withCredentials = false;
      open(_method: string, url: string): void { calls.push(`upload ${url}`); }
      send(): void { this.onload?.(); }
    }
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
  }

  it("첨부 2개를 순서대로 올린 뒤 발행을 요청한다", async () => {
    const calls: string[] = [];
    stubUpload(calls, false);
    vi.stubGlobal("fetch", vi.fn((url: string) => { calls.push(`fetch ${url}`); return Promise.resolve(new Response("{}")); }));
    const files = [new File(["a"], "a.pdf"), new File(["b"], "b.pdf")];

    await publishWithAttachments(7, files, { title: "제목", body: "본문" }, () => undefined);

    expect(calls).toEqual(["upload /api/posts/7/attachments", "upload /api/posts/7/attachments", "fetch /api/posts/7/publish"]);
  });

  it("첨부가 실패하면 발행하지 않고 실패한 파일의 순서를 알린다", async () => {
    const calls: string[] = [];
    stubUpload(calls, true);
    vi.stubGlobal("fetch", vi.fn(() => { calls.push("fetch"); return Promise.resolve(new Response("{}")); }));

    const failed = await publishWithAttachments(7, [new File(["a"], "a.exe")], { title: "t", body: "b" }, () => undefined)
      .catch((error: unknown) => error);

    expect(failed).toBeInstanceOf(AttachmentFailed);
    expect((failed as AttachmentFailed).index).toBe(0);
    expect(calls).not.toContain("fetch");
  });
});

describe("repeatConflict", () => {
  it("반복이 아니면 통과하고, 횟수와 종료일을 함께 쓰면 거절한다", () => {
    expect(repeatConflict({ weekdays: 0, count: 3, until: "2026-12-31" })).toBe("");
    expect(repeatConflict({ weekdays: 1, count: 3, until: "2026-12-31" })).toContain("동시에");
    expect(repeatConflict({ weekdays: 1, count: 3, until: null })).toBe("");
  });
});

describe("loadScheduleRows — 기간 여러 개의 시간표", () => {
  it("실패한 기간은 사유만 모으고 나머지 기간의 행은 반환한다", async () => {
    vi.stubGlobal("fetch", vi.fn((url: string) => Promise.resolve(url.includes("/periods/2/")
      ? new Response(JSON.stringify({ detail: "존재하지 않는 기간이에요" }), { status: 422 })
      : new Response(JSON.stringify({ rows: [{ team_id: 1 }], open_slots: [], report: null })))));

    const result = await loadScheduleRows([1, 2]);

    expect(result.rows).toHaveLength(1);
    expect(result.failures).toEqual(["기간 2: 존재하지 않는 기간이에요"]);
  });
});

describe("saveTeam — 팀 저장", () => {
  it("새 팀은 POST 1번으로 만든다", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${url}`);
      return Promise.resolve(new Response(JSON.stringify({ team: { id: 5, name: "A", color: "red" } })));
    }));
    expect((await saveTeam(null, "A", null, { 보컬: 1 })).id).toBe(5);
    expect(calls).toEqual(["POST /api/teams"]);
  });

  it("이름과 색이 그대로면 PATCH 없이 포지션만 PUT 한다", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${url}`);
      return Promise.resolve(new Response("{}"));
    }));
    const team = { id: 5, name: "A", color: "red", slot_count: 1, filled_count: 0 };
    await saveTeam(team, "A", "red", { 보컬: 2 });
    expect(calls).toEqual(["PUT /api/teams/5/slots"]);
  });
});

describe("saveSeats — 자리 배정 저장", () => {
  it("바뀐 자리가 없으면 저장 요청을 보내지 않는다", async () => {
    const spy = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ slots: [] }))));
    vi.stubGlobal("fetch", spy);
    await saveSeats(5, []);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

function job(status: Job<string>["status"], extra: Partial<Job<string>> = {}): { job: Job<string> } {
  return { job: { id: "j1", status, result: null, error: null, ...extra } };
}

describe("JOB_DEADLINE_MS", () => {
  it("서버가 배정 작업 1개에 쓰는 최대 시간보다 먼저 대기를 중단하지 않는다", () => {
    // 서버 상한은 solver 계산 1회 60초(scheduling/pipeline.py 의 SOLVER_TIME_LIMIT_SECONDS)입니다.
    // 화면이 먼저 중단하면 실패로 표시한 배정이 나중에 저장됩니다.
    expect(JOB_DEADLINE_MS).toBeGreaterThan(60 * 1000);
  });
});

describe("awaitJob", () => {
  const nowait = () => Promise.resolve();

  it("끝난 작업의 결과를 돌려준다", async () => {
    const read = vi.fn().mockResolvedValue(job("done", { result: "결과" }));
    await expect(awaitJob("j1", read, nowait, () => 0)).resolves.toBe("결과");
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("끝날 때까지 되묻는다", async () => {
    const read = vi.fn()
      .mockResolvedValueOnce(job("queued"))
      .mockResolvedValueOnce(job("running"))
      .mockResolvedValueOnce(job("done", { result: "결과" }));
    await expect(awaitJob("j1", read, nowait, () => 0)).resolves.toBe("결과");
    expect(read).toHaveBeenCalledTimes(3);
  });

  it("실패하면 서버가 준 사유를 그대로 올린다", async () => {
    const read = vi.fn().mockResolvedValue(job("failed", { error: "자리를 못 찾았습니다" }));
    await expect(awaitJob("j1", read, nowait, () => 0)).rejects.toThrow("자리를 못 찾았습니다");
  });

  it("사유 없이 실패하면 사람이 읽을 문장을 대신 올린다", async () => {
    const read = vi.fn().mockResolvedValue(job("failed"));
    await expect(awaitJob("j1", read, nowait, () => 0)).rejects.toThrow("연산을 진행하지 못했어요.");
  });

  it("정해둔 시각을 넘기면 기다리기를 그만둔다", async () => {
    const read = vi.fn().mockResolvedValue(job("running"));
    let clock = 0;
    const tick = () => { clock += JOB_DEADLINE_MS / 2; return Promise.resolve(); };
    await expect(awaitJob("j1", read, tick, () => clock)).rejects.toThrow(
      `스케줄링 엔진이 ${JOB_DEADLINE_MS / 1000}초 안에 연산되지 않았어요.`,
    );
  });

  it("결과가 비어 있는 done 은 결과 없음으로 올린다", async () => {
    const read = vi.fn().mockResolvedValue(job("done"));
    await expect(awaitJob("j1", read, nowait, () => 0)).rejects.toThrow("연산된 결과를 받지 못했어요.");
  });
});
