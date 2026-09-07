// 밝은 화면과 어두운 화면을 고르는 값. 고른 것은 브라우저에 남겨 다음에 열 때도
// 그대로 쓴다 — 예전에는 남기지 않아 새로 고칠 때마다 화면 설정으로 되돌아갔다.

export type Theme = "dark" | "light";

const STORAGE_KEY = "banblit_theme";

/** 지금 것의 반대쪽. */
export function nextTheme(now: Theme): Theme {
  return now === "dark" ? "light" : "dark";
}

/** 사람이 고른 것이 있으면 그것을, 없으면 화면 설정을 따른다.
 *  남아 있는 값이 우리가 아는 둘 중 하나가 아니면 없는 것으로 본다. */
export function readSavedTheme(): Theme {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(STORAGE_KEY);
  } catch {
    // 저장소를 못 읽는 브라우저에서는 화면 설정으로 간다.
  }
  if (saved === "dark" || saved === "light") return saved;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** 고른 것을 화면에 붙이고 다음에도 쓰도록 남긴다.
 *  남기지 못해도 화면에는 붙는다 — 이번 화면이 안 바뀌는 것이 더 나쁘다. */
export function applyTheme(theme: Theme): Theme {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // 사생활 보호 모드처럼 저장이 막힌 경우다. 이번 화면만 바뀌고 끝난다.
  }
  return theme;
}
