// 짧은 알림 문구 하나입니다. 어디서든 say() 를 호출하면 layout 컴포넌트(AppShell·AccountLayout)가 표시합니다.
// 컴포넌트 props 로 onSay 를 전달하지 않습니다.
import { useSyncExternalStore } from "react";

// 문구가 화면에 표시되는 시간(밀리초)입니다.
const HOLD_MS = 2600;

let current = "";
let timer: number | undefined;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listen of listeners) listen();
}

function subscribe(listen: () => void): () => void {
  listeners.add(listen);
  return () => listeners.delete(listen);
}

export function say(message: string): void {
  current = message;
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    current = "";
    emit();
  }, HOLD_MS);
  emit();
}

/** 현재 표시할 문구를 반환합니다. 없으면 빈 문자열입니다. */
export function readToast(): string {
  return current;
}

/** 현재 표시할 문구입니다. 문구가 변경되면 다시 렌더링합니다. */
export function useToast(): string {
  // 세 번째 인자는 서버 렌더링용 초기값 함수입니다. 이 앱은 브라우저에서만 렌더링하지만 타입이 요구해 빈 문자열을 반환합니다.
  return useSyncExternalStore(subscribe, readToast, () => "");
}
