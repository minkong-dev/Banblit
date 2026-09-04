import { expect, test } from "@playwright/test";

import { escapeRegExp, loginForTests } from "./helpers";

type Team = { id: number; name: string; member_count: number };
type Member = { id: number; name: string; positions: string[] };

test.beforeEach(async ({ page }) => {
  await loginForTests(page);
});

test("팀 찾기에서 팀을 누르면 명단이 나온다", async ({ page, request }) => {
  const { teams } = (await (await request.get("/api/teams")).json()) as { teams: Team[] };
  const team = teams.find((item) => item.member_count > 0);
  if (team === undefined) {
    test.skip(true, "명단이 있는 팀이 없어 건너뜀");
    return;
  }
  const { members } = (await (
    await request.get(`/api/teams/${team.id}/members`)
  ).json()) as { members: Member[] };

  await page.goto("/teams");
  await page.getByRole("button", { name: new RegExp(escapeRegExp(team.name)) }).click();

  await expect(page.getByText(members[0].name)).toBeVisible();
});
