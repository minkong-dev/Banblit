import { expect, test } from "@playwright/test";

// 본문은 사이드바를 뺀 폭을 전부 씁니다. 최대 폭(예전 1440px)으로 묶어 가운데 두면 넓은 모니터에서
// 양옆이 회색으로 비고, 글쓰기·PDF 처럼 넓을수록 좋은 화면이 좁게 나옵니다.
test("넓은 창에서 본문이 사이드바를 뺀 폭을 전부 쓴다", async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1200 });
  for (const path of ["/notices/new", "/settings", "/teams"]) {
    await page.goto(path);
    const gap = await page.evaluate(() => {
      const side = document.querySelector(".side")?.getBoundingClientRect().width ?? 0;
      const body = document.querySelector(".page")?.getBoundingClientRect().width ?? 0;
      return document.documentElement.clientWidth - side - body;
    });
    expect(gap, path).toBeLessThanOrEqual(2);
  }
});

// 내용이 창보다 길면 본문만 따로 스크롤하지 않고 페이지 전체가 스크롤합니다(GitHub Primer PageLayout 방식).
// 상단바와 사이드바는 sticky 로 제자리에 남습니다. body 를 창 높이로 묶고 overflow:hidden 으로 숨기면
// 드래그할 때 숨은 스크롤이 움직여 상단바가 사라지고 아래에 빈 회색이 드러납니다.
test("긴 글쓰기 화면은 페이지 전체가 스크롤하고 상단바·사이드바가 제자리에 남는다", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/notices/new");
  // 임시 저장본이 만들어져야 파일 넣기가 활성화됩니다. 그 전에 넣으면 무시됩니다.
  const picker = page.locator(".rttools .rtpick[aria-label='그림 넣기'] input");
  await expect(picker).toBeEnabled();
  await picker.setInputFiles({
    name: "긴 악보.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"),
  });
  await expect(page.locator(".rtbody .rtpdf")).toBeVisible();

  await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight > innerHeight)).toBe(true);
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  const edges = await page.evaluate(() => ({
    scrolled: scrollY,
    headerTop: document.querySelector("header.top")?.getBoundingClientRect().top ?? -1,
    sideBottom: document.querySelector(".side")?.getBoundingClientRect().bottom ?? -1,
    viewport: innerHeight,
  }));
  expect(edges.scrolled).toBeGreaterThan(0);
  expect(edges.headerTop).toBe(0);
  expect(Math.abs(edges.sideBottom - edges.viewport)).toBeLessThanOrEqual(1);
});

// 모달도 창 폭에 비례합니다. 좁은 창에서는 최소 560px(창보다 넓으면 창 폭 - 40px), 넓은 창에서는 창 폭의 36% 입니다.
// 고정 560px 이면 2560px 창에서 모달이 화면의 1/5 로 작게 보입니다.
test("모달 너비가 창 폭에 따라 달라진다", async ({ page }) => {
  const cases = [
    { width: 1100, expected: 560 },
    { width: 2560, expected: 2560 * 0.36 },
    { width: 390, expected: 390 - 40 },
  ];
  for (const { width, expected } of cases) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/teams");
    await page.getByRole("button", { name: "+ 새 팀" }).click();
    const dialog = page.getByRole("dialog", { name: "새 팀" });
    // 여는 순간 scale 애니메이션이 있어 끝난 뒤의 폭을 잽니다. offsetWidth 는 transform 의 영향을 받지 않습니다.
    const measured = await dialog.evaluate((el) => (el as HTMLElement).offsetWidth);
    expect(Math.abs(measured - expected), `창 ${width}px`).toBeLessThanOrEqual(2);
  }
});

// 창 폭은 세 단계입니다. 넓음(1060px 이상) 사이드바 세로, 중간(768~1059px) 사이드바를 가로 줄로 올리고
// 본문·오른쪽 칸 두 칸 유지, 좁음(767px 이하) 오른쪽 칸을 본문 아래로 내린 한 줄 배치입니다.
// 어느 폭에서도 화면이 가로로 잘리지 않아야 합니다. 예전에는 최소 폭 1060px 과 휴대폰 전환 860px 사이가 잘렸습니다.
test("창 폭 세 단계에서 가로로 잘리지 않고 단계마다 배치가 바뀐다", async ({ page }) => {
  for (const width of [1280, 960, 700]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/scheduler", "/notices", "/teams", "/settings"]) {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${path} 창 ${width}px`).toBeLessThanOrEqual(1);
    }
    await page.goto("/scheduler");
    const box = await page.evaluate(() => {
      const rect = (selector: string) => document.querySelector(selector)?.getBoundingClientRect();
      return { side: rect(".side"), card: rect(".page > .card"), rail: rect(".rail") };
    });
    const sideIsRow = (box.side?.height ?? 0) < 100;
    const railBeside = (box.rail?.left ?? 0) >= (box.card?.right ?? 0);
    const railBelow = (box.rail?.top ?? 0) >= (box.card?.bottom ?? 0);
    if (width >= 1060) expect([sideIsRow, railBeside], `창 ${width}px`).toEqual([false, true]);
    else if (width >= 768) expect([sideIsRow, railBeside], `창 ${width}px`).toEqual([true, true]);
    else expect([sideIsRow, railBelow], `창 ${width}px`).toEqual([true, true]);
  }
});

// 달력 칸 높이는 칸 너비의 0.75 배이고 56~137px 사이입니다. 너비가 줄면 높이도 같이 줄어듭니다.
// 달력 안쪽(#body)은 따로 스크롤하지 않습니다. 달력이 창보다 길면 페이지 전체가 스크롤합니다.
test("달력 칸 높이가 너비에 비례하고 달력 안쪽은 따로 스크롤하지 않는다", async ({ page }) => {
  for (const size of [{ width: 1280, height: 600 }, { width: 960, height: 600 }, { width: 390, height: 800 }]) {
    await page.setViewportSize(size);
    await page.goto("/scheduler");
    await expect(page.locator(".grid .cell").first()).toBeVisible();
    const m = await page.evaluate(() => {
      const cell = document.querySelector(".grid .cell")!.getBoundingClientRect();
      const body = document.querySelector("#body")!;
      return { w: cell.width, h: cell.height, inner: body.scrollHeight - body.clientHeight };
    });
    const expected = Math.min(137, Math.max(56, m.w * 0.75));
    expect(Math.abs(m.h - expected), `창 ${size.width}px 칸 ${m.w}x${m.h}`).toBeLessThanOrEqual(2);
    expect(m.inner, `창 ${size.width}px 달력 안쪽 스크롤`).toBeLessThanOrEqual(1);
    // 달력 아래 "집중합주 기간" 띠가 카드 밖으로 넘치지 않아야 합니다. 좁은 창에서는 줄바꿈합니다.
    const band = await page.evaluate(() => {
      const el = document.querySelector(".band");
      return el === null ? 0 : el.getBoundingClientRect().right - document.querySelector(".page > .card")!.getBoundingClientRect().right;
    });
    expect(band, `창 ${size.width}px 집중합주 띠`).toBeLessThanOrEqual(0);
  }
});

// 좁은 창에서 탭은 한 줄로 두고 가로로 밉니다(사이드 메뉴 줄과 같은 방식). 줄어들지 않는 탭이 좁은 칸에 갇히면
// 글자가 세로로 쪼개집니다. 오른쪽 칸은 본문 아래로 내려가고, 본문 카드는 본문 폭을 전부 씁니다.
test("좁은 창의 설정 화면에서 탭이 한 줄이고 본문 카드가 폭을 전부 쓴다", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto("/settings");
  await expect(page.locator(".rail")).toBeVisible();
  await expect(page.locator(".main .card").first()).toBeVisible();
  const m = await page.evaluate(() => {
    const tabs = [...document.querySelectorAll(".tabs .tab")].map((tab) => tab.getBoundingClientRect());
    const rect = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
    return {
      tabTops: new Set(tabs.map((tab) => Math.round(tab.top))).size,
      tabHeight: Math.max(...tabs.map((tab) => tab.height)),
      mainWidth: rect(".main").width, tabsWidth: rect(".tabs").width,
      mainBottom: rect(".main").bottom, railTop: rect(".rail").top,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  expect(m.tabTops, "탭이 한 줄").toBe(1);
  expect(m.tabHeight, "탭 글자가 세로로 쪼개지지 않음").toBeLessThan(60);
  expect(Math.abs(m.mainWidth - m.tabsWidth), "본문이 폭을 전부 씀").toBeLessThanOrEqual(2);
  expect(m.railTop, "오른쪽 칸이 본문 아래").toBeGreaterThanOrEqual(m.mainBottom);
  expect(m.overflow, "화면 가로 잘림 없음").toBeLessThanOrEqual(1);
});
