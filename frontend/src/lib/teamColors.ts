// 팀 색 20가지와 그 CSS 입니다. 화면이나 서버와 상호작용하지 않습니다.
// 색 값은 @radix-ui/colors(MIT)가 정하고, 이 파일은 이름 20개와 쓸 단계만 고릅니다.

import {
  amber, amberDark, blue, blueDark, brown, brownDark, crimson, crimsonDark, gold, goldDark,
  green, greenDark, indigo, indigoDark, iris, irisDark, jade, jadeDark, lime, limeDark,
  mint, mintDark, orange, orangeDark, pink, pinkDark, plum, plumDark, purple, purpleDark,
  red, redDark, sky, skyDark, teal, tealDark, tomato, tomatoDark, yellow, yellowDark,
} from "@radix-ui/colors";

/** 팀 색 20가지입니다. 서버 쪽 정본은 backend/src/backend/db/models.py 의 TEAM_COLORS 이고, 순서가 곧 자동 배정 순서입니다. */
export const TEAM_COLORS = [
  "tomato", "red", "crimson", "pink", "plum", "purple", "iris", "indigo", "blue", "sky",
  "teal", "jade", "green", "mint", "lime", "yellow", "amber", "orange", "gold", "brown",
] as const;

export type TeamColor = (typeof TEAM_COLORS)[number];

type Scale = Record<string, string>;

/** 색 이름마다 [밝은 화면 12단계, 어두운 화면 12단계] 입니다. 두 쪽의 key 이름(tomato1…tomato12)이 같습니다. */
const SCALES: Record<TeamColor, [Scale, Scale]> = {
  tomato: [tomato, tomatoDark], red: [red, redDark], crimson: [crimson, crimsonDark],
  pink: [pink, pinkDark], plum: [plum, plumDark], purple: [purple, purpleDark],
  iris: [iris, irisDark], indigo: [indigo, indigoDark], blue: [blue, blueDark], sky: [sky, skyDark],
  teal: [teal, tealDark], jade: [jade, jadeDark], green: [green, greenDark], mint: [mint, mintDark],
  lime: [lime, limeDark], yellow: [yellow, yellowDark], amber: [amber, amberDark],
  orange: [orange, orangeDark], gold: [gold, goldDark], brown: [brown, brownDark],
};

// 막대 배경은 4단계입니다. 3단계는 거의 흰색이라 색이 보이지 않습니다. 글자는 11단계입니다. 11단계는
// Radix 가 같은 색의 배경 단계 위 글자 대비를 보장하는 단계라, 어느 색을 골라도 글자가 읽힙니다(사용자 결정 2026-09-15).
const TINT_STEP = 4;
const INK_STEP = 11;

/** 팀 색 이름을 CSS key 로 바꿉니다. "jade" → "team-jade". 이 key 가 class 이름이자 CSS 변수 이름입니다. */
export function teamColorKey(color: string): string {
  return `team-${color}`;
}

/** 20색의 CSS 를 반환합니다. 색마다 `:root` 의 --team-<색>(글자)·--team-<색>-tint(배경) 한 쌍과,
 *  `.team-<색>` class 가 --tc·--tc-tint 로 그 값을 가리키게 하는 규칙 하나입니다. 막대·점 CSS 는 --tc 만 씁니다.
 *  값은 light-dark(밝은 값, 어두운 값) 이라 테마가 바뀌어도 다시 계산하지 않습니다. */
export function teamColorCss(): string {
  return TEAM_COLORS.map((name) => {
    const [light, dark] = SCALES[name];
    const key = teamColorKey(name);
    const pair = (step: number): string => `light-dark(${light[`${name}${step}`]}, ${dark[`${name}${step}`]})`;
    return [
      `:root { --${key}: ${pair(INK_STEP)}; --${key}-tint: ${pair(TINT_STEP)}; }`,
      `.${key} { --tc: var(--${key}); --tc-tint: var(--${key}-tint); }`,
    ].join("\n");
  }).join("\n");
}
