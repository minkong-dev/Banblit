// 짧은 알림 문구 하나. 어디서든 say() 를 부르면 껍데기(AppShell·AccountLayout)가 그린다 —
// 부품 서명에 onSay 를 실어 나르지 않는다.
import { useSyncExternalStore } from "react";

// 문구가 화면에 머무는 시간(밀리초).
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

/** 지금 보여줄 문구. 없으면 빈 문자열. */
export function useToast(): string {
  return useSyncExternalStore(subscribe, () => current, () => "");
}
