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

// 좁은 창(휴대폰)의 달력 칸 높이는 칸 너비의 0.75 배이고 64~137px 사이입니다. 오른쪽 칸이 달력 아래에 붙어
// 페이지 전체가 스크롤합니다. 넓은 창은 창 높이에 맞춰 줄어듭니다(아래 "스크롤 없이 한 화면" 검사).
// 달력 안쪽(#body)은 어느 폭에서도 따로 스크롤하지 않습니다.
test("좁은 창의 달력 칸 높이가 너비에 비례하고 달력 안쪽은 따로 스크롤하지 않는다", async ({ page }) => {
  for (const size of [{ width: 390, height: 800 }]) {
    await page.setViewportSize(size);
    await page.goto("/scheduler");
    await expect(page.locator(".grid .cell").first()).toBeVisible();
    const m = await page.evaluate(() => {
      const cell = document.querySelector(".grid .cell")!.getBoundingClientRect();
      const body = document.querySelector("#body")!;
      return { w: cell.width, h: cell.height, inner: body.scrollHeight - body.clientHeight };
    });
    const expected = Math.min(137, Math.max(64, m.w * 0.75));
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

// 좁은 창에서 오른쪽 칸은 본문 아래로 내려가고, 본문 카드는 본문 폭을 전부 씁니다.
// 관리자 메뉴는 2026-10-05 에 탭에서 구역별 주소로 바뀌어 이 화면에는 탭이 없습니다. 오른쪽 칸이 있는
// 합주실 구역에서 잽니다. 본문 아래로 내려간 오른쪽 칸은 같은 1열에 놓이므로 두 폭이 같아야 합니다.
test("좁은 창의 합주실 화면에서 본문 카드가 폭을 전부 쓰고 오른쪽 칸이 아래로 내려간다", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto("/rooms");
  await expect(page.locator(".rail")).toBeVisible();
  await expect(page.locator(".main .card").first()).toBeVisible();
  const m = await page.evaluate(() => {
    const rect = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
    return {
      mainWidth: rect(".main").width, railWidth: rect(".rail").width,
      mainBottom: rect(".main").bottom, railTop: rect(".rail").top,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  expect(Math.abs(m.mainWidth - m.railWidth), "본문이 폭을 전부 씀").toBeLessThanOrEqual(2);
  expect(m.railTop, "오른쪽 칸이 본문 아래").toBeGreaterThanOrEqual(m.mainBottom);
  expect(m.overflow, "화면 가로 잘림 없음").toBeLessThanOrEqual(1);
});

// 휴대폰(767px 이하)에서는 사이드 메뉴 줄을 숨기고 상단바의 햄버거 버튼으로 메뉴 판을 엽니다(Material Design 모달 드로어).
// 메뉴를 고르거나 Esc 를 누르면 닫힙니다. 탭은 상단바 바로 아래에 옵니다.
test("휴대폰에서는 햄버거 버튼으로 메뉴를 열고, 메뉴를 고르거나 Esc 를 누르면 닫힌다", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto("/scheduler");
  await expect(page.locator(".side")).toBeHidden();
  const gap = await page.evaluate(() =>
    document.querySelector(".tabs")!.getBoundingClientRect().top - document.querySelector("header.top")!.getBoundingClientRect().bottom);
  expect(gap, "탭이 상단바 바로 아래").toBeLessThanOrEqual(24);

  const open = page.getByRole("button", { name: "메뉴 열기" });
  await open.click();
  const drawer = page.getByRole("dialog", { name: "메뉴" });
  await expect(drawer).toBeVisible();
  await drawer.getByRole("link", { name: "공지사항" }).click();
  await expect(page).toHaveURL(/\/notices$/);
  await expect(drawer).toBeHidden();

  await open.click();
  await expect(drawer).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
});

test("넓은 창에서는 햄버거 버튼이 없고 사이드바가 보인다", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/scheduler");
  await expect(page.getByRole("button", { name: "메뉴 열기" })).toBeHidden();
  await expect(page.locator(".side")).toBeVisible();
});

// 휴대폰에서도 목록은 화면 높이만큼 줄을 채웁니다. 페이지 높이를 풀어 두면 줄 수 계산이 목록 상자를 0 에 가깝게 재서
// 한 쪽에 1줄만 나옵니다. 목록 아래 버튼("+ 새 팀")은 한 줄이어야 합니다.
test("휴대폰의 목록은 한 쪽에 여러 줄이 나오고 버튼이 꺾이지 않는다", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/teams");
  await expect(page.locator(".rows li").first()).toBeVisible();
  await expect.poll(() => page.locator(".rows li").count()).toBeGreaterThanOrEqual(2);
  const button = await page.getByRole("button", { name: "+ 새 팀" }).boundingBox();
  expect(button?.height ?? 0, "+ 새 팀 버튼 한 줄").toBeLessThan(50);
});

// 휴대폰에서 집중합주 기간 띠가 줄바꿈되어도 시계 아이콘은 글자 크기를 유지합니다.
test("휴대폰의 집중합주 기간 띠 아이콘이 커지지 않는다", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/scheduler");
  const icon = await page.locator(".band svg").boundingBox();
  expect(icon?.width ?? 0).toBeLessThanOrEqual(16);
});

// 대시보드만 창 바닥까지 채우고, 나머지 화면의 카드는 내용 높이만큼만 씁니다. 목록은 한 쪽에 10줄이고
// 쪽 넘김 줄은 목록 바로 아래에 옵니다.
test("대시보드만 창 바닥까지 채우고 나머지 화면은 내용 높이만큼 쓴다", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  const gapBelow = (selector: string) => page.evaluate((sel) =>
    innerHeight - document.querySelector(sel)!.getBoundingClientRect().bottom, selector);
  for (const path of ["/teams", "/notices", "/settings"]) {
    await page.goto(path);
    await expect(page.locator(".main .card").first()).toBeVisible();
    expect(await gapBelow(".main .card"), path).toBeGreaterThan(200);
  }
  await page.goto("/scheduler");
  await expect(page.locator(".page > .card")).toBeVisible();
  expect(await gapBelow(".page > .card"), "/scheduler").toBeLessThan(40);
});

// 대시보드 달력은 창 높이 안에 한 달이 전부 들어옵니다(사용자 결정). 칸이 줄어들고 다 들어가지 않는 일정은
// 칸이 자릅니다. 예전에는 줄 최소 높이가 창 너비 기준(최대 137px)이라 6주짜리 달이 창을 넘겨 페이지가 스크롤했습니다.
test("넓은 창에서 대시보드 달력이 스크롤 없이 한 화면에 들어온다", async ({ page }) => {
  for (const size of [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }, { width: 960, height: 700 }]) {
    await page.setViewportSize(size);
    await page.goto("/scheduler");
    await expect(page.locator(".grid .cell").first()).toBeVisible();
    const fit = await page.evaluate(() => ({
      overflow: document.documentElement.scrollHeight - innerHeight,
      gridBottom: document.querySelector(".grid")?.getBoundingClientRect().bottom ?? Infinity,
      viewport: innerHeight,
    }));
    expect(fit.overflow, `창 ${size.width}x${size.height}`).toBeLessThanOrEqual(1);
    expect(fit.gridBottom, `창 ${size.width}x${size.height}`).toBeLessThanOrEqual(fit.viewport);
  }
});

// 프로필 카드는 설정 화면에서 옮겨 왔습니다. 설정 화면 전용 CSS 에 남은 규칙이 있으면 프로필에서는 버튼이
// 글자만 남습니다. 브라우저 기본 파일 선택 칸은 보이지 않아야 합니다.
// 화면은 상자 없이 선으로만 구획하므로(2026-09-30) 입력칸 묶음(.fields)의 왼쪽·오른쪽 끝은 카드의 끝과 같습니다.
test("프로필 편집 상태의 저장 버튼은 바탕색을 갖고 입력칸 묶음은 카드의 양 끝에 맞는다", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/profile");
  await page.getByRole("button", { name: "프로필 편집" }).click();
  await expect(page.locator("#myPhoto")).toBeHidden();
  const background = await page.getByRole("button", { name: "저장", exact: true })
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(background).not.toBe("rgba(0, 0, 0, 0)");
  const gaps = await page.evaluate(() => [...document.querySelectorAll(".card .fields")].map((el) => {
    const card = el.closest(".card")!.getBoundingClientRect();
    const fields = el.getBoundingClientRect();
    return Math.max(fields.left - card.left, card.right - fields.right);
  }));
  expect(gaps.length).toBeGreaterThan(0);
  for (const gap of gaps) expect(gap).toBe(0);
});

// 기준 휴대폰은 갤럭시 S24(360×780)와 아이폰 17(402×874)입니다(2026-09-28 사용자 결정).
const PHONES = [{ width: 360, height: 780 }, { width: 402, height: 874 }];

test("기준 휴대폰 폭에서 어느 화면도 가로로 밀리지 않는다", async ({ browser, page }) => {
  const overflow = (target: typeof page) =>
    target.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  for (const size of PHONES) {
    await page.setViewportSize(size);
    for (const path of ["/scheduler", "/notices", "/notices/new", "/board", "/teams", "/settings", "/admin", "/profile"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      expect(await overflow(page), `${path} ${size.width}px`).toBeLessThanOrEqual(1);
    }
    // 계정 화면은 로그인하지 않은 상태로 엽니다. 로그인 상태면 대시보드로 이동합니다.
    const guest = await browser.newContext({ viewport: size, baseURL: "http://localhost:5173", storageState: { cookies: [], origins: [] } });
    const out = await guest.newPage();
    for (const path of ["/login", "/signup", "/find-id", "/find-password"]) {
      await out.goto(path);
      await out.waitForLoadState("networkidle");
      expect(await overflow(out), `${path} ${size.width}px`).toBeLessThanOrEqual(1);
    }
    await guest.close();
  }
});

test("기준 휴대폰 폭에서 알림 말풍선이 화면 안에 들어온다", async ({ page }) => {
  for (const size of PHONES) {
    await page.setViewportSize(size);
    await page.goto("/scheduler");
    await page.locator(".notes .bell").click();
    const box = await page.locator(".notes .notepop").boundingBox();
    expect(box, `${size.width}px`).not.toBeNull();
    expect(box!.x, `${size.width}px 왼쪽`).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width, `${size.width}px 오른쪽`).toBeLessThanOrEqual(size.width);
  }
});

// 휴대폰에서 날짜 dialog 의 카드 3장은 세로로 쌓이고 dialog 가 스크롤합니다. 카드가 dialog 높이에 맞춰 줄어들면
// 가운데 입력 카드가 잘리고 버튼 줄이 입력칸을 가립니다.
test("기준 휴대폰 폭에서 날짜 dialog 의 입력 카드가 잘리지 않는다", async ({ page }) => {
  await page.setViewportSize(PHONES[0]);
  await page.goto("/scheduler");
  await page.locator(".grid .cell:not(:disabled)").nth(10).click();
  const col = page.locator("dialog[open] .pane .col").first();
  await expect(col).toBeVisible();
  const clipped = await col.evaluate((el) => el.scrollHeight - el.clientHeight);
  expect(clipped).toBeLessThanOrEqual(1);
});

test("글쓰기 화면은 아무것도 입력하지 않으면 오류를 표시하지 않는다", async ({ page }) => {
  await page.goto("/notices/new");
  await expect(page.locator(".rtbody")).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.locator("#postWhy")).toHaveCount(0);
});

test("기준 휴대폰 폭에서 랜딩 3단은 좌우로 넘기는 카드이고 글이 카드 안에 들어간다", async ({ browser }) => {
  for (const size of PHONES) {
    const guest = await browser.newContext({ viewport: size, isMobile: true, hasTouch: true, baseURL: "http://localhost:5173", storageState: { cookies: [], origins: [] } });
    const page = await guest.newPage();
    await page.goto("/");
    const m = await page.locator(".three").evaluate((row) => ({
      swipes: row.scrollWidth > row.clientWidth,
      page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      clipped: [...row.querySelectorAll(".box")].map((box) => box.querySelector(".full")!.getBoundingClientRect().height - box.getBoundingClientRect().height),
    }));
    expect(m.swipes, `${size.width}px`).toBe(true);
    expect(m.page, `${size.width}px 페이지 가로 밀림`).toBeLessThanOrEqual(1);
    for (const over of m.clipped) expect(over, `${size.width}px 카드 글 잘림`).toBeLessThanOrEqual(0);
    await guest.close();
  }
});

test("기준 휴대폰 폭에서 멤버 화면의 권한 카드와 멤버 목록이 잘리지 않는다", async ({ page }) => {
  for (const size of PHONES) {
    await page.setViewportSize(size);
    await page.goto("/members");
    // 권한 목록이 도착한 뒤에 잽니다. 도착 전에는 "+ 새 권한" 카드만 있어 잘림이 드러나지 않습니다.
    await expect(page.locator(".tiles li:not(.add)").first()).toBeVisible();
    await page.waitForTimeout(300);
    const m = await page.evaluate(() => {
      const card = document.querySelector(".tiles")!.closest(".card")!.getBoundingClientRect();
      const first = document.querySelector(".tiles li")!.getBoundingClientRect();
      const roster = document.querySelector(".roster")!;
      return { firstLeft: first.left - card.left, rosterOver: roster.scrollWidth - roster.clientWidth };
    });
    expect(m.firstLeft, `${size.width}px 첫 권한 카드`).toBeGreaterThanOrEqual(0);
    expect(m.rosterOver, `${size.width}px 멤버 목록 가로 넘침`).toBeLessThanOrEqual(1);
  }
});

// 칸 폭에 들어가지 않는 글자는 옆으로 넘치지 않고 꺾여 아래로 밀립니다. 그래서 세로 방향 잘림도 잽니다.
test("기준 휴대폰 폭에서 예약 달력의 날짜 칸 글씨와 막대가 칸을 넘지 않는다", async ({ page }) => {
  for (const size of PHONES) {
    await page.setViewportSize(size);
    await page.goto("/scheduler");
    await page.getByRole("tab", { name: "예약" }).click();
    await expect(page.locator(".grid .avail").first()).toBeVisible();
    const over = await page.evaluate(() => Math.max(...[...document.querySelectorAll(".grid .cell")].map((cell) =>
      Math.max(0, ...[...cell.querySelectorAll(".avail > *")].map((part) => {
        // 상자가 아니라 글자·막대가 실제로 그려진 영역을 잽니다. 상자는 칸 폭에 맞춰지고 글자만 넘칠 수 있습니다.
        const box = cell.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(part);
        const r = range.getBoundingClientRect();
        return r.width === 0 ? 0 : Math.max(r.right - box.right, box.left - r.left, r.bottom - box.bottom);
      })))));
    expect(over, `${size.width}px`).toBeLessThanOrEqual(0);
  }
});

// 멤버 목록의 휴대폰 묶음 배치는 멤버 표에만 씁니다. 같은 .roster 를 쓰는 예약·블라인드 표는 열 구성이 달라
// 표 모양을 유지하고 표 안에서만 가로로 스크롤합니다.
test("기준 휴대폰 폭에서 관리자 메뉴의 예약·블라인드 표는 표 모양을 유지하고 화면을 밀지 않는다", async ({ page }) => {
  await page.setViewportSize(PHONES[0]);
  for (const [tab, path] of [["예약", "/reservations"], ["블라인드", "/blinded"]]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const m = await page.evaluate(() => ({
      table: getComputedStyle(document.querySelector(".roster table")!).display,
      page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }));
    expect(m.table, tab).toBe("table");
    expect(m.page, tab).toBeLessThanOrEqual(1);
  }
});

test("멤버 표는 휴대폰 묶음 배치에서도 표 구조를 화면 읽기에 전달한다", async ({ page }) => {
  await page.setViewportSize(PHONES[0]);
  await page.goto("/members");
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "학과" })).toHaveCount(1);
  await expect(page.getByRole("cell", { name: "검사학과" }).first()).toBeVisible();
});

// 배정 결과 화면 오른쪽 칸의 시각 입력칸 2개는 카드 안에 들어가야 합니다. 입력칸은 글자 폭보다 좁아지지 않는
// 것이 브라우저 기본값이라, 칸 폭이 좁으면 두 번째 칸이 카드 오른쪽 밖으로 잘렸습니다(2026-09-30 캡처로 발견).
// 오른쪽 칸 제목("이전 배정기록")도 설명 문구에 밀려 두 줄로 꺾이지 않아야 합니다.
test("배정 결과 화면 오른쪽 칸의 시각 입력칸이 카드 안에 들어가고 제목이 한 줄이다", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/admin");
  await expect(page.locator(".times input[type='time']").first()).toBeVisible();
  const m = await page.evaluate(() => {
    const times = document.querySelector(".times")!.getBoundingClientRect();
    const inputs = [...document.querySelectorAll(".times input[type='time']")].map((el) => el.getBoundingClientRect());
    const head = document.querySelector(".rail .panel > .ph")!;
    const lineHeight = parseFloat(getComputedStyle(head).lineHeight);
    const title = document.createRange();
    title.selectNodeContents(head.firstChild!);
    return {
      overflow: Math.max(...inputs.map((rect) => rect.right)) - times.right,
      titleLines: Math.round(title.getBoundingClientRect().height / lineHeight),
    };
  });
  expect(m.overflow, "시각 입력칸이 카드 오른쪽 밖으로 나감").toBeLessThanOrEqual(0);
  expect(m.titleLines, "오른쪽 칸 제목 줄 수").toBe(1);
});

// /me 조회가 실패하면 me 가 null 이 되어 권한 판정이 전부 "권한 없음" 과 같아집니다. 안내가 없으면
// 사용자는 관리자 메뉴가 사라진 것을 권한이 회수된 것으로 읽습니다. 안내를 상단바 아래 한 곳에 두어
// 모든 화면이 함께 씁니다(호출부 9곳을 각각 고치지 않습니다).
test("계정 정보를 불러오지 못하면 안내가 표시되고, 다시 불러오기가 메뉴를 되살린다", async ({ page }) => {
  let failMe = true;
  await page.route("**/api/me", async (route) => {
    if (!failMe) return route.continue();
    return route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ detail: "계정 정보를 불러오지 못했습니다" }),
    });
  });

  await page.goto("/scheduler");
  const notice = page.getByRole("alert", { name: "계정 조회 실패" });
  await expect(notice).toContainText("계정 정보를 불러오지 못했어요");
  await expect(notice).toContainText("계정 정보를 불러오지 못했습니다");
  await expect(page.locator(".side").getByRole("link", { name: "합주실" })).toHaveCount(0);

  failMe = false;
  await notice.getByRole("button", { name: "다시 불러오기" }).click();
  await expect(page.locator(".side").getByRole("link", { name: "합주실" })).toBeVisible();
  await expect(notice).toBeHidden();
});
