import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { E2E_ACCOUNT, SIGNED_OUT } from "./helpers";

// 이 파일은 로그인하지 않은 사람의 화면을 확인합니다.
// 가입 rate limit 이 1시간에 5번이고 global-setup 이 2번 쓰므로, 이 파일의 가입 요청은 3번을 넘기지 않습니다(지금 2번).
test.use({ storageState: SIGNED_OUT });

/** 가입 form 을 채웁니다. 이름·학과·학번·기수 조합이 겹치면 서버가 거절하므로 이름에 stamp 를 붙여 구분합니다. */
async function fillSignup(page: Page, name: string, email: string): Promise<void> {
  await page.goto("/signup");
  await page.getByLabel("이름").fill(name);
  await page.getByLabel("학과").fill(E2E_ACCOUNT.department);
  await page.getByLabel("학번").fill(String(Date.now()).slice(-8));
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호", { exact: true }).fill(E2E_ACCOUNT.password);
  await page.getByLabel("비밀번호 확인").fill(E2E_ACCOUNT.password);
  await page.getByLabel("기수").fill(String(E2E_ACCOUNT.cohort));
}

test("로그인하지 않으면 스케줄러 대신 로그인 화면으로 간다", async ({ page }) => {
  await page.goto("/scheduler");

  await expect(page).toHaveURL(/\/login$/);
});

test("가입한 뒤 로그인 상태로 스케줄러까지 들어간다", async ({ page }) => {
  const stamp = Date.now();
  await fillSignup(page, `E2E 가입 ${stamp}`, `e2e-signup-${stamp}@banblit.test`);
  await page.getByRole("button", { name: "가입하기" }).click();

  await expect(page).toHaveURL(/\/scheduler$/);
});

// global-setup 이 가입시킨 E2E 계정의 이메일을 그대로 씁니다. 먼저 가입하는 요청을 따로 보내지 않아 가입 rate limit 을 아낍니다.
test("가입한 이메일로 다시 가입하면 서버가 거절한다", async ({ page }) => {
  await fillSignup(page, `E2E 중복 ${Date.now()}`, E2E_ACCOUNT.email);
  await page.getByRole("button", { name: "가입하기" }).click();

  await expect(page.getByText("이미 가입된 이메일입니다")).toBeVisible();
  await expect(page).toHaveURL(/\/signup$/);
});

test("틀린 비밀번호로 로그인하면 거절 문구가 뜬다", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(E2E_ACCOUNT.email);
  // "비밀번호 보기" 버튼도 label 에 걸리므로 exact 로 입력칸만 고릅니다.
  await page.getByLabel("비밀번호", { exact: true }).fill("Wrong-Password1!");
  await page.getByRole("button", { name: "로그인", exact: true }).click();

  await expect(page.getByText("이메일 또는 비밀번호가 올바르지 않습니다")).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

// 크롤러는 JavaScript 를 실행하지 않고 index.html 만 읽습니다. 링크를 붙여넣었을 때 보이는
// 제목·설명·이미지는 화면 코드가 아니라 이 파일의 meta 태그에서 나옵니다.
test("링크 미리보기 태그가 첫 화면에 들어 있다", async ({ page }) => {
  await page.goto("/");

  // og:image 는 절대 주소여야 합니다. 상대 주소를 넣으면 카카오톡·페이스북이 이미지를 받지 못합니다.
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    "content",
    /^https?:\/\/[^%]+\/images\/domain_link_preview\.jpg\?v=\d+$/,
  );
  // 카카오 스크랩은 이미지를 3초 안에 받아야 합니다. 661KB 이미지가 카카오 서버에서 6초 넘게 걸려 회색으로 나왔습니다.
  // 파일이 다시 커지지 않도록 200KB 를 상한으로 둡니다.
  const image = await page.request.get("/images/domain_link_preview.jpg");
  expect(image.headers()["content-type"]).toBe("image/jpeg");
  expect((await image.body()).length).toBeLessThan(200 * 1024);
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", "BANBLIT");
  await expect(page.locator('meta[property="og:description"]')).toHaveAttribute("content", "IN SIX STRINGS");
});

test("등록되지 않은 주소는 없는 주소 화면을 표시한다", async ({ page }) => {
  await page.goto("/이런주소는없습니다");

  await expect(page.getByRole("heading", { name: "Oops!" })).toBeVisible();
  await expect(page.getByText("존재하지 않는 페이지에요")).toBeVisible();

  await page.getByRole("link", { name: "로그인으로 돌아가기" }).click();
  await expect(page).toHaveURL(/\/login$/);
});

// 로그인 표시 cookie 는 남았는데 서버 session 이 없는 경우입니다(다른 기기에서 비밀번호 변경 등).
// 서버가 401 "로그인이 필요합니다" 로 거절하면 표시 cookie 를 삭제하고 로그인 화면으로 보내야 합니다.
// 삭제하지 않으면 SkipIfSignedIn 이 로그인 화면을 대시보드로 되돌려 빠져나올 수 없습니다.
test.describe("서버 session 이 취소된 경우", () => {
  test.use({
    storageState: {
      cookies: [
        { name: "banblit_signed_in", value: "1", domain: "localhost", path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Lax" },
        { name: "banblit_session", value: "revoked", domain: "localhost", path: "/", expires: -1, httpOnly: true, secure: false, sameSite: "Lax" },
      ],
      origins: [],
    },
  });

  test("대시보드 요청이 401 로 거절되면 로그인 화면으로 간다", async ({ page, context }) => {
    await page.goto("/scheduler");
    await expect(page).toHaveURL(/\/login$/);
    const names = (await context.cookies()).map((cookie) => cookie.name);
    expect(names).not.toContain("banblit_signed_in");
  });
});
