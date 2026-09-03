import { useCallback, useEffect, useRef, useState } from "react";

// 알림 문구가 화면에 머무는 시간(밀리초). 프로토타입 세 화면이 쓰던 값 그대로다.
const HOLD_MS = 2600;

/** 짧은 알림 문구 하나를 띄웠다 지운다. 문구를 어디에 그릴지는 부르는 화면이 정한다. */
export function useToast(): { message: string; say: (message: string) => void } {
  const [message, setMessage] = useState("");
  const timer = useRef<number | undefined>(undefined);

  const say = useCallback((next: string) => {
    setMessage(next);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMessage(""), HOLD_MS);
  }, []);

  // 화면을 떠날 때 남은 시계를 끈다. 없어진 화면에 값을 넣으려 하면 경고가 뜬다.
  useEffect(() => () => window.clearTimeout(timer.current), []);

  return { message, say };
}
