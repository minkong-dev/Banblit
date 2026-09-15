import { describe, expect, it } from "vitest";

import { TEAM_COLORS, teamColorCss, teamColorKey } from "./teamColors";

describe("TEAM_COLORS", () => {
  it("서버와 같은 20색을 같은 순서로 든다", () => {
    // 서버 쪽 정본은 backend/src/backend/db/models.py 의 TEAM_COLORS 입니다. 순서가 곧 자동 배정 순서입니다.
    expect(TEAM_COLORS).toHaveLength(20);
    expect(TEAM_COLORS[0]).toBe("tomato");
    expect(TEAM_COLORS[TEAM_COLORS.length - 1]).toBe("brown");
  });
});

describe("teamColorCss", () => {
  it("글자는 11단계, 배경은 4단계를 밝은 값·어두운 값 한 쌍으로 적는다", () => {
    const css = teamColorCss();
    expect(css).toContain("--team-tomato: light-dark(#d13415, #ff977d);");
    expect(css).toContain("--team-tomato-tint: light-dark(#ffdcd3, #4e1511);");
    expect(css).toContain(".team-tomato { --tc: var(--team-tomato); --tc-tint: var(--team-tomato-tint); }");
  });
});

describe("teamColorKey", () => {
  it("팀 색 이름을 CSS 가 쓰는 key 로 바꾼다", () => {
    expect(teamColorKey("jade")).toBe("team-jade");
  });
});
