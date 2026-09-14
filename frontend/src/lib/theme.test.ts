import { afterEach, describe, expect, test, vi } from "vitest";

import { applyTheme, readSavedTheme, type Theme } from "./theme";

const KEY = "banblit_theme";

/** vitest 는 브라우저가 아니라 Node 에서 실행됩니다. document·localStorage·matchMedia 를
 *  기본으로 제공하지 않으므로 pipeline.test.ts 가 document 를 mock 으로 만든 것과 같은 방식으로 만듭니다. */
function stubBrowser(options: { systemDark: boolean; saved?: string; canSave?: boolean }): {
  root: { dataset: { theme?: string } };
  store: Map<string, string>;
} {
  const { systemDark, saved, canSave = true } = options;
  const root = { dataset: {} as { theme?: string } };
  const store = new Map<string, string>();
  if (saved !== undefined) store.set(KEY, saved);

  vi.stubGlobal("document", { documentElement: root });
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("dark") && systemDark,
  }));
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (!canSave) throw new Error("저장할 수 없습니다");
      store.set(key, value);
    },
  });
  return { root, store };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("readSavedTheme", () => {
  test("고른 적이 없으면 화면 설정을 따른다", () => {
    // Arrange
    stubBrowser({ systemDark: true });

    // Act
    const theme = readSavedTheme();

    // Assert
    expect(theme).toBe("dark");
  });

  test("고른 적이 없고 화면 설정도 밝으면 밝은 화면이다", () => {
    stubBrowser({ systemDark: false });
    expect(readSavedTheme()).toBe("light");
  });

  test("고른 것이 있으면 화면 설정보다 그것을 따른다", () => {
    // Arrange: 운영체제 설정은 어두운 화면이지만 사용자가 밝은 화면을 선택해 두었습니다.
    stubBrowser({ systemDark: true, saved: "light" });

    // Act & Assert
    expect(readSavedTheme()).toBe("light");
  });

  test("모르는 값이 남아 있으면 화면 설정으로 돌아간다", () => {
    stubBrowser({ systemDark: true, saved: "보라색" });
    expect(readSavedTheme()).toBe("dark");
  });
});

describe("applyTheme", () => {
  test("고른 것을 화면에 붙이고 다음에도 쓰도록 남긴다", () => {
    // Arrange
    const { root, store } = stubBrowser({ systemDark: false });

    // Act
    applyTheme("dark");

    // Assert
    expect(root.dataset.theme).toBe("dark");
    expect(store.get(KEY)).toBe("dark");
  });

  test("남길 수 없는 브라우저에서도 화면에는 붙는다", () => {
    // Arrange: 사생활 보호 모드처럼 저장 자체가 차단된 경우를 재현합니다.
    const { root } = stubBrowser({ systemDark: false, canSave: false });

    // Act
    const applied: Theme = applyTheme("light");

    // Assert
    expect(applied).toBe("light");
    expect(root.dataset.theme).toBe("light");
  });
});
