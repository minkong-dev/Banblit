import { afterEach, describe, expect, it, vi } from "vitest";

import { getJSON, REQUEST_TIMEOUT_MS, sendFile, UPLOAD_TIMEOUT_MS } from "./api";

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
      `서버가 ${REQUEST_TIMEOUT_MS / 1000}초 내 응답하지 않아 요청을 실행하지 못했어요`,
    );
  });

  it("서버에 닿지 못하면 그 사실을 알린다", async () => {
    stubFetch(async () => {
      throw new TypeError("Failed to fetch");
    });

    await expect(getJSON("/health")).rejects.toThrow("서버로부터 응답을 받지 못했어요");
  });

  it("서버가 거절하면 서버가 적어 보낸 사유를 그대로 올린다", async () => {
    stubFetch(async () => jsonResponse({ detail: "그런 기간이 없습니다" }, 422));

    await expect(getJSON("/periods/9/schedule")).rejects.toThrow("그런 기간이 없습니다");
  });

  it("사유 없는 거절도 상태 번호로 알린다", async () => {
    stubFetch(async () => new Response("", { status: 503 }));

    await expect(getJSON("/health")).rejects.toThrow("503");
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

/** XMLHttpRequest 를 가짜로 세운다. 단위 테스트는 실제 서버에 닿지 않는다. */
class FakeUpload {
  static last: FakeUpload;
  headers: Record<string, string> = {};
  upload = {} as { onprogress: (event: { lengthComputable: boolean; loaded: number; total: number }) => void };
  status = 201;
  statusText = "Created";
  responseText = "{}";
  timeout = 0;
  sent: FormData | null = null;
  onload!: () => void;
  onerror!: () => void;
  ontimeout!: () => void;

  constructor() {
    FakeUpload.last = this;
  }
  open(_method: string, _url: string): void {}
  setRequestHeader(name: string, value: string): void {
    this.headers[name] = value;
  }
  send(body: FormData): void {
    this.sent = body;
  }
}

describe("sendFile", () => {
  function upload(): { promise: Promise<unknown>; request: FakeUpload } {
    vi.stubGlobal("XMLHttpRequest", FakeUpload);
    const file = new File(["악보"], "악보.pdf", { type: "application/pdf" });
    const promise = sendFile("/posts/1/attachments", file, () => {});
    return { promise, request: FakeUpload.last };
  }

  it("파일 항목 이름은 file 이고, Content-Type 을 손으로 붙이지 않는다", async () => {
    const { promise, request } = upload();

    expect((request.sent?.get("file") as File).name).toBe("악보.pdf");
    expect(request.headers).toEqual({});

    request.responseText = JSON.stringify({ attachment: { id: 7 } });
    request.onload();
    await expect(promise).resolves.toEqual({ attachment: { id: 7 } });
  });

  it("올리는 데도 시간 제한을 붙인다", () => {
    const { promise, request } = upload();
    expect(request.timeout).toBe(UPLOAD_TIMEOUT_MS);
    request.onload();
    return promise;
  });

  it("올라간 만큼을 백분율로 알린다", () => {
    vi.stubGlobal("XMLHttpRequest", FakeUpload);
    const seen: number[] = [];
    const file = new File(["악보"], "악보.pdf");
    const promise = sendFile("/posts/1/attachments", file, (percent) => seen.push(percent));
    const request = FakeUpload.last;

    request.upload.onprogress({ lengthComputable: true, loaded: 50, total: 200 });
    request.upload.onprogress({ lengthComputable: false, loaded: 100, total: 200 });

    expect(seen).toEqual([25]);
    request.onload();
    return promise;
  });

  it("서버가 거절하면 서버가 적어 보낸 사유를 그대로 올린다", async () => {
    const { promise, request } = upload();

    request.status = 413;
    request.responseText = JSON.stringify({ detail: "파일이 너무 큽니다" });
    request.onload();

    await expect(promise).rejects.toThrow("파일이 너무 큽니다");
  });
});
