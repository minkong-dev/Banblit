// 서버를 호출하는 함수는 이 파일에만 있습니다. 값을 저장하지 않습니다. 호출 순서와 상태는
// pipeline.ts 에서 관리합니다.
// 시간 제한과 실패 시 문구를 한 곳에 모아
// 화면마다 다른 방식으로 실패하지 않도록 합니다.

// 서버가 응답하지 않을 때 화면이 끝없이 기다리지 않도록 요청을 끊는 시간(밀리초)입니다.
export const REQUEST_TIMEOUT_MS = 8000;

// 서버 주소 앞에 붙이는 접두사입니다. 화면 주소와 서버 주소가 같은 이름으로 겹치는 것을 막습니다.
// 예: /teams만으로는 팀 찾기 화면인지 팀 목록 endpoint(API의 요청 주소 단위)인지 구분할 수 없습니다.
// 접두사를 붙이는 곳과 제거하는 곳은 각각 하나입니다(개발은 vite.config.ts, 배포는 frontend/nginx.conf.template).
const API_PREFIX = "/api";

// 파일 업로드가 완료될 때까지 기다리는 시간(밀리초)입니다.
export const UPLOAD_TIMEOUT_MS = 30 * 60 * 1000;

/** 서버 endpoint 의 전체 주소입니다. fetch 를 거치지 않는 곳(예: 파일 다운로드 링크)에 사용합니다. */
export function apiUrl(path: string): string {
  return API_PREFIX + path;
}

export async function getJSON<T>(path: string, init?: RequestInit): Promise<T> {
  // path를 fetch에 넣어 본문을 반환합니다. 서버가 거절하면 그 사유를 예외로 발생시킵니다.
  // 로그인 session 은 서버가 httpOnly cookie(banblit_session)로 관리합니다. 같은 출처로
  // 나가는 요청이면 브라우저가 cookie 를 자동으로 포함합니다. 화면은 header 에 추가할 값이 없습니다.
  let res: Response;
  try {
    // AbortSignal.timeout은 지정된 밀리초가 지나면 요청을 끊고
    // TimeoutError라는 이름의 예외를 발생시킵니다. fetch 자체에는 시간 제한이 없습니다.
    res = await fetch(API_PREFIX + path, {
      ...init,
      // 본문이 있으면 Content-Type 을 application/json 으로 지정합니다. 지정하지 않으면 브라우저가 text/plain 으로
      // 보내고 서버는 본문을 읽지 못해 422 로 거절합니다. 호출 지점마다 지정하면
      // 한 곳이 빠졌을 때 그 화면만 오류 메시지 없이 실패하므로 이 함수에서 한 번에 지정합니다.
      // 파일 업로드는 sendFile 이 별도로 처리합니다. multipart/form-data 는
      // boundary(항목을 구분하는 경계 문자열)가 필요하므로 브라우저가 직접 결정해야 합니다.
      headers: init?.body === undefined
        ? init?.headers
        : { "Content-Type": "application/json", ...init.headers },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new Error(
      error instanceof Error && error.name === "TimeoutError"
        ? `서버가 ${REQUEST_TIMEOUT_MS / 1000}초 내 응답하지 않아 요청을 실행하지 못했어요`
        : "서버로부터 응답을 받지 못했어요",
    );
  }

  // 본문이 없는 응답도 있습니다.
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(detailOf(body) ?? `${res.status} ${res.statusText}`);
  }
  return body as T;
}

function detailOf(body: unknown): string | null {
  // 서버는 거절 사유를 detail 필드에 담아 보냅니다. 그 외에는 null을 반환합니다.
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
  // file을 multipart/form-data로 path에 업로드하고 서버의 응답 본문을 반환합니다.
  // 업로드된 진행도를 0~100 사이의 값으로 onProgress에 전달합니다.
  // fetch 는 업로드 진행도를 제공하지 않습니다. 진행도를 제공하는 API 는 XMLHttpRequest 뿐입니다.
  // ponytail: 업로드 중 중단 기능은 구현하지 않았습니다. 화면을 옮겨도 남은 전송이
  // 계속됩니다. 중단이 필요하면 이 함수가 XMLHttpRequest를 반환하고
  // 호출 지점에서 abort()를 호출하면 됩니다.
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);

    const request = new XMLHttpRequest();
    request.open("POST", apiUrl(path));
    // Content-Type을 직접 붙이지 않습니다. multipart/form-data는 항목을 가르는 경계
    // 문자열(boundary)을 헤더에 함께 포함해야 하며, 이는 브라우저가 FormData를 보고
    // 직접 생성합니다. 직접 붙이면 경계 문자열이 누락되어 서버가 본문을 읽지 못합니다.
    request.timeout = UPLOAD_TIMEOUT_MS;

    request.upload.onprogress = (event) => {
      // lengthComputable 은 전체 크기를 알 수 있을 때만 true 입니다. 알 수 없으면 백분율을 계산할 수 없습니다.
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
    request.onerror = () => reject(new Error("서버로부터 응답을 받지 못했어요"));
    request.ontimeout = () =>
      reject(new Error(`파일 업로드가 ${UPLOAD_TIMEOUT_MS / 60000}분 내 응답하지 않아 요청을 실행하지 못했어요`));

    request.send(form);
  });
}

function parseJSON(text: string): unknown {
  // 본문이 없거나 JSON이 아닌 응답도 있습니다. 그 경우 null을 반환합니다.
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/** 오류를 화면에 표시할 한 줄의 문구입니다. Error이면 그 메시지, 아니면 fallback을 반환합니다. */
export function reason(error: unknown, fallback = "알 수 없는 오류가 발생했어요. 잠시 후 다시 시도해주세요."): string {
  return error instanceof Error ? error.message : fallback;
}
