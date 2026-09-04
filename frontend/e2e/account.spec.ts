import { expect, test } from "@playwright/test";

test("로그인하지 않으면 스케줄러 대신 로그인 화면으로 간다", async ({ page }) => {
  await page.goto("/scheduler");

  await expect(page).toHaveURL(/\/login$/);
});

test("가입한 뒤 로그인 상태로 스케줄러까지 들어간다", async ({ page }) => {
  const email = `e2e-signup-${Date.now()}@banblit.test`;

  await page.goto("/signup");
  await page.getByLabel("이름").fill("E2E 가입 검사");
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호", { exact: true }).fill("password123");
  await page.getByLabel("비밀번호 확인").fill("password123");
  await page.getByRole("button", { name: "보컬" }).click();
  await page.getByRole("button", { name: "가입하기" }).click();

  await expect(page).toHaveURL(/\/scheduler$/);
});

test("가입한 이메일로 다시 가입하면 서버가 거절한다", async ({ page, request }) => {
  const email = `e2e-dup-${Date.now()}@banblit.test`;
  const body = { name: "먼저 가입", email, password: "password123", positions: ["보컬"] };
  await request.post("/api/signup", { data: body });

  await page.goto("/signup");
  await page.getByLabel("이름").fill("나중 가입");
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호", { exact: true }).fill("password123");
  await page.getByLabel("비밀번호 확인").fill("password123");
  await page.getByRole("button", { name: "기타" }).click();
  await page.getByRole("button", { name: "가입하기" }).click();

  await expect(page.getByText("이미 가입된 이메일입니다")).toBeVisible();
  await expect(page).toHaveURL(/\/signup$/);
});

test("틀린 비밀번호로 로그인하면 거절 문구가 뜬다", async ({ page, request }) => {
  const email = `e2e-login-${Date.now()}@banblit.test`;
  await request.post("/api/signup", {
    data: { name: "로그인 검사", email, password: "password123", positions: ["보컬"] },
  });

  await page.goto("/login");
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호").fill("wrong-password");
  await page.getByRole("button", { name: "로그인" }).click();

  await expect(page.getByText("이메일 또는 비밀번호가 올바르지 않습니다")).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});
