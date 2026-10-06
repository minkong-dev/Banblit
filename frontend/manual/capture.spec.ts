// 매뉴얼 그림을 캡쳐합니다. 무엇을 캡쳐할지는 이 파일이 아니라 docs/manual/shots.json 이 정합니다 —
// 그림을 추가·삭제하거나 강조 표시를 옮길 때 코드를 수정하지 않게 하기 위한 분리입니다.
import { test } from "@playwright/test";
import type { Browser, Page } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";

import { annotate, clearAnnotations, freeze } from "./annotate";
import type { Annotation } from "./annotate";
import { SHOTS_DIR, SHOTS_PATH, VIEWPORT } from "./config";

/** 캡쳐 전에 화면에서 수행하는 동작 1개입니다. */
type Step = {
  /** 이동할 주소입니다. */
  goto?: string;
  /** 누를 요소의 선택자입니다. */
  click?: string;
  /** 입력칸의 선택자와 넣을 값입니다. */
  fill?: [string, string];
  /** 선택자와 입력할 글입니다. fill 과 달리 키 입력을 흉내내므로 본문 편집기처럼 input 이 아닌 칸에도 넣을 수 있습니다. */
  type?: [string, string];
  /** 선택자와 세로 스크롤 위치(px)입니다. 모달 본문처럼 안쪽이 스크롤되는 영역에 사용합니다. */
  scroll?: [string, number];
  /** select 의 선택자와 고를 값입니다. */
  select?: [string, string];
  /** 마우스를 올릴 요소의 선택자입니다. */
  hover?: string;
  /** 선택자와 누를 키입니다. */
  press?: [string, string];
  /** 선택자와 세로 시작·종료 위치(0~1)입니다. 날짜 모달의 타임라인 드래그에 사용합니다. */
  drag?: [string, number, number];
  /** 나타날 때까지 기다릴 요소의 선택자입니다. */
  waitFor?: string;
  /** 기다릴 시간(ms)입니다. */
  wait?: number;
  /** 같은 선택자에 여러 요소가 해당될 때 몇 번째인지입니다. */
  nth?: number;
};

/** 그림 1장의 사양입니다. */
type Shot = {
  /** 파일 이름입니다. `shots/<이름>.png` 로 저장되고 원고가 같은 경로로 참조합니다. */
  name: string;
  /** 로그인하지 않은 화면을 캡쳐할 때 "none" 을 적습니다. 생략하면 전체 권한 계정입니다. */
  auth?: "none";
  /** true 면 앞 그림의 화면 상태를 그대로 이어 씁니다. 모달을 단계별로 캡쳐할 때 사용합니다. */
  continue?: boolean;
  steps?: Step[];
  /** 잘라낼 범위입니다. 적으면 그 요소만 확대한 그림이 됩니다.
   *  `to` 를 적으면 target 의 왼쪽 위부터 to 의 오른쪽 아래까지를 범위로 합니다 —
   *  내용보다 높이가 큰 요소에서 아래쪽 빈 자리를 잘라낼 때 사용합니다. */
  clip?: { target: string; to?: string; pad?: number; nth?: number };
  /** true 면 창 높이가 아니라 내용 전체 높이로 캡쳐합니다. 회원가입처럼 창보다 긴 화면에 사용합니다. */
  fullPage?: boolean;
  annotate?: Annotation[];
};

type ShotFile = { shots: Shot[] };

/** 화면을 옮긴 뒤 렌더링이 끝날 때까지 기다리는 기본 대기 시간(ms)입니다. */
const SETTLE_MS = 700;

/** shots.json 의 문자열에서 날짜 자리표시자를 오늘 기준의 값으로 교체합니다.
 *
 *  `{{d+2}}` 는 오늘부터 2일 뒤의 일(day) 숫자, `{{date+2}}` 는 같은 날짜의 "2026-10-07" 형식입니다.
 *  달력 칸을 누르는 선택자가 특정 날짜에 묶이지 않게 하려고 둡니다. */
function resolve(text: string): string {
  return text.replace(/\{\{(d|date)\+(\d+)\}\}/g, (_match, kind: string, offset: string) => {
    const date = new Date();
    date.setDate(date.getDate() + Number(offset));
    if (kind === "d") return String(date.getDate());
    const pad = (value: number): string => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  });
}

async function runStep(page: Page, step: Step): Promise<void> {
  const at = (selector: string): ReturnType<Page["locator"]> => page.locator(resolve(selector)).nth(step.nth ?? 0);
  if (step.goto !== undefined) {
    await page.goto(step.goto);
    await page.waitForLoadState("networkidle").catch(() => undefined);
    await freeze(page);
    await page.waitForTimeout(SETTLE_MS);
  }
  if (step.waitFor !== undefined) await at(step.waitFor).waitFor({ state: "visible" });
  if (step.click !== undefined) await at(step.click).click();
  if (step.fill !== undefined) await at(step.fill[0]).fill(resolve(step.fill[1]));
  if (step.select !== undefined) {
    const value = resolve(step.select[1]);
    // 저장된 값이 번호(기간 id 등)라 미리 적을 수 없을 때 "index:1" 처럼 순서로 고릅니다.
    const choice = value.startsWith("index:") ? { index: Number(value.slice("index:".length)) } : value;
    await at(step.select[0]).selectOption(choice);
  }
  if (step.type !== undefined) {
    await at(step.type[0]).click();
    await page.keyboard.type(resolve(step.type[1]));
  }
  if (step.scroll !== undefined) {
    const [selector, top] = step.scroll;
    await at(selector).evaluate((node, value: number) => { node.scrollTop = value; }, top);
  }
  if (step.hover !== undefined) await at(step.hover).hover();
  if (step.press !== undefined) await at(step.press[0]).press(step.press[1]);
  if (step.drag !== undefined) {
    const [selector, from, to] = step.drag;
    const box = await at(selector).boundingBox();
    if (box === null) throw new Error(`드래그 대상 '${selector}' 을 찾지 못했습니다`);
    const x = box.x + box.width / 2;
    await page.mouse.move(x, box.y + box.height * from);
    await page.mouse.down();
    await page.mouse.move(x, box.y + box.height * to, { steps: 12 });
    await page.mouse.up();
  }
  if (step.wait !== undefined) await page.waitForTimeout(step.wait);
}

/** auth 가 "none" 인 그림은 로그인 cookie 가 없는 page 를 따로 만들어 씁니다. */
async function signedOutPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
  });
  return context.newPage();
}

test("매뉴얼 그림을 캡쳐합니다", async ({ page, browser }) => {
  mkdirSync(SHOTS_DIR, { recursive: true });
  const { shots } = JSON.parse(readFileSync(SHOTS_PATH, "utf8")) as ShotFile;
  let guest: Page | null = null;
  let previous: Page = page;
  const failed: string[] = [];

  for (const shot of shots) {
    await test.step(shot.name, async () => {
      let target = page;
      if (shot.auth === "none") {
        guest ??= await signedOutPage(browser);
        target = guest;
      }
      if (shot.continue === true) target = previous;
      previous = target;

      // 동작 1개가 실패해도 남은 그림을 계속 캡쳐합니다. 선택자 1개 때문에 전체 실행이
      // 중단되면 어느 그림이 더 잘못되었는지 한 번에 확인할 수 없습니다.
      for (const step of shot.steps ?? []) {
        await runStep(target, step).catch((error: unknown) => {
          failed.push(`${shot.name}: ${String(error).split("\n")[0]}`);
        });
      }
      await annotate(target, (shot.annotate ?? []).map((item) => ({ ...item, target: resolve(item.target) })));

      const clip = shot.clip === undefined
        ? undefined
        : await (async () => {
          const spec = shot.clip!;
          const box = await target.locator(resolve(spec.target)).nth(spec.nth ?? 0).boundingBox();
          if (box === null) throw new Error(`잘라낼 대상 '${spec.target}' 을 찾지 못했습니다`);
          const pad = spec.pad ?? 16;
          let bottom = box.y + box.height;
          if (spec.to !== undefined) {
            const end = await target.locator(resolve(spec.to)).last().boundingBox();
            if (end === null) throw new Error(`잘라낼 끝 '${spec.to}' 을 찾지 못했습니다`);
            bottom = end.y + end.height;
          }
          return {
            x: Math.max(0, box.x - pad),
            y: Math.max(0, box.y - pad),
            width: box.width + pad * 2,
            height: bottom - box.y + pad * 2,
          };
        })();

      await target.screenshot({
        path: `${SHOTS_DIR}/${shot.name}.png`,
        clip,
        // clip 과 fullPage 는 함께 쓸 수 없습니다. clip 이 있으면 그 범위가 곧 잘라낼 높이입니다.
        fullPage: clip === undefined && shot.fullPage === true,
        animations: "disabled",
      });
      await clearAnnotations(target);
    });
  }

  if (failed.length > 0) {
    console.warn(`수행하지 못한 동작 ${failed.length}건\n${failed.map((row) => `  - ${row}`).join("\n")}`);
  }
});
