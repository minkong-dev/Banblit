// 서버를 부르는 자리는 여기 하나다. 값을 들지 않는다 — 부르는 순서와 상태는
// pipeline.ts 가 든다.
// 시간 제한과 실패 시 문구를 한곳에 모아,
// 화면마다 제각각 다른 방식으로 실패하지 않게 한다.

// 서버가 답하지 않을 때 화면이 끝없이 기다리지 않도록 끊는 시각(밀리초).
export const REQUEST_TIMEOUT_MS = 8000;

// 서버 통로 앞에 붙이는 말. 화면 주소와 서버 통로가 같은 이름을 두고 부딪히는 것을
// 막는다 — /teams 는 팀 찾기 화면이면서 팀 목록 통로이기도 했다. 붙이는 자리는 여기
// 하나이고, 떼는 자리도 하나다(개발은 vite.config.ts, 배포는 frontend/nginx.conf.template).
const API_PREFIX = "/api";

export async function getJSON<T>(path: string, init?: RequestInit): Promise<T> {
  // path 를 fetch 에 넣어 본문을 돌려준다. 서버가 거절하면 그 사유를 예외로 올린다.
  // 로그인 세션은 서버가 httpOnly 쿠키(banblit_session)로 관리한다 — 같은 출처로
  // 나가는 요청이면 브라우저가 쿠키를 자동으로 싣는다. 화면은 헤더에 실을 것이 없다.
  let res: Response;
  try {
    // AbortSignal.timeout 은 정해진 밀리초가 지나면 이 요청을 끊고 이름이
    // TimeoutError 인 예외를 던진다. fetch 자체에는 시간 제한이 없다.
    res = await fetch(API_PREFIX + path, {
      ...init,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new Error(
      error instanceof Error && error.name === "TimeoutError"
        ? `서버가 ${REQUEST_TIMEOUT_MS / 1000}초 안에 답하지 않아 끊었습니다`
        : "서버에 닿지 못했습니다",
    );
  }

  // 본문이 없는 답장도 있다.
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(detailOf(body) ?? `${res.status} ${res.statusText}`);
  }
  return body as T;
}

function detailOf(body: unknown): string | null {
  // 서버는 거절 사유를 detail 한 곳에 담아 보낸다. 그 밖의 모양이면 null.
  if (typeof body !== "object" || body === null || !("detail" in body)) {
    return null;
  }
  const detail = body.detail;
  return typeof detail === "string" ? detail : null;
}
