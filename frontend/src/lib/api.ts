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

// 파일 하나를 다 올릴 때까지 기다려 주는 시간(밀리초).
export const UPLOAD_TIMEOUT_MS = 30 * 60 * 1000;

/** 서버 통로의 전체 주소. 파일을 내려받는 <a href> 처럼 fetch 를 거치지 않는 자리에 쓴다. */
export function apiUrl(path: string): string {
  return API_PREFIX + path;
}

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
      // 본문을 실었으면 JSON 이라고 알린다. 이것이 없으면 브라우저가 text/plain 으로
      // 보내고 서버는 본문을 못 읽어 422 로 거절한다. 부르는 곳마다 붙이면 한 곳이
      // 빠졌을 때 그 화면만 조용히 깨지므로 여기서 한 번에 붙인다.
      // 파일 올리기는 sendFile 이 따로 맡는다 — multipart 는 경계 문자열이 필요해
      // 브라우저가 직접 정해야 한다.
      headers: init?.body === undefined
        ? init?.headers
        : { "Content-Type": "application/json", ...init.headers },
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

export function sendFile<T>(
  path: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<T> {
  // file 을 multipart/form-data 로 path 에 올리고, 서버의 답장 본문을 돌려준다.
  // 올라간 만큼을 0~100 으로 onProgress 에 알린다.
  // fetch 는 얼마나 올라갔는지 알려주지 않는다 — 그것을 알려주는 것은 XMLHttpRequest 뿐이다.
  // ponytail: 올리는 도중 멈추는 자리는 두지 않았다. 화면을 옮겨도 남은 전송이
  // 이어진다. 멈출 수 있어야 하면 이 함수가 XMLHttpRequest 를 밖으로 내주고
  // 부르는 쪽이 abort() 를 걸면 된다.
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);

    const request = new XMLHttpRequest();
    request.open("POST", apiUrl(path));
    // Content-Type 을 직접 붙이지 않는다. multipart/form-data 는 항목을 가르는 경계
    // 글자(boundary)를 헤더에 함께 실어야 하고, 그 글자는 브라우저가 FormData 를 보고
    // 스스로 짓는다. 손으로 붙이면 경계 글자가 빠져 서버가 본문을 못 읽는다.
    request.timeout = UPLOAD_TIMEOUT_MS;

    request.upload.onprogress = (event) => {
      // lengthComputable 은 전체 크기를 알 수 있을 때만 참이다. 모르면 백분율을 낼 수 없다.
      if (event.lengthComputable) {
        onProgress(Math.floor((event.loaded / event.total) * 100));
      }
    };
    request.onload = () => {
      const body = parseJSON(request.responseText);
      if (request.status >= 200 && request.status < 300) {
        resolve(body as T);
        return;
      }
      reject(new Error(detailOf(body) ?? `${request.status} ${request.statusText}`));
    };
    request.onerror = () => reject(new Error("서버에 닿지 못했습니다"));
    request.ontimeout = () =>
      reject(new Error(`파일을 ${UPLOAD_TIMEOUT_MS / 60000}분 안에 다 올리지 못해 끊었습니다`));

    request.send(form);
  });
}

function parseJSON(text: string): unknown {
  // 본문이 없거나 JSON 이 아닌 답장도 있다. 그때는 null 로 본다.
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}
