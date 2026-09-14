// 밝은 화면과 어두운 화면을 고르는 값입니다. 선택한 것은 브라우저에 저장하여 다음에 열 때도 그대로 사용합니다.

export type Theme = "dark" | "light";

const STORAGE_KEY = "banblit_theme";

/** 사용자가 선택한 것이 있으면 그것을, 없으면 화면 설정을 따릅니다.
 *  저장된 값이 우리가 아는 둘 중 하나가 아니면 없는 것으로 봅니다. */
export function readSavedTheme(): Theme {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(STORAGE_KEY);
  } catch {
    // 저장소를 읽지 못하는 브라우저에서는 화면 설정으로 진행합니다.
  }
  if (saved === "dark" || saved === "light") return saved;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** 선택한 것을 화면에 적용하고 다음에도 사용하도록 저장합니다.
 *  저장하지 못해도 화면에는 적용됩니다 — 이번 화면이 바뀌지 않는 것이 더 나쁩니다. */
export function applyTheme(theme: Theme): Theme {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // 사생활 보호 모드처럼 저장이 차단된 경우입니다. 이번 화면만 바뀌고 끝납니다.
  }
  return theme;
}
