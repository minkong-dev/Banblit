import { expect, test } from "@playwright/test";

import { E2E_ACCOUNT_TEAM, escapeRegExp, loginForTests } from "./helpers";

type Team = { id: number; name: string; member_count: number; join_policy: "auto" | "approval" };
type Member = { id: number; name: string; positions: string[] };
type Position = { id: number; name: string };

test.beforeEach(async ({ page, request }) => {
  await loginForTests(page.request, request);
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

// 승인하는 쪽은 page 와 page.request(시드가 넣은 E2E 계정, join_approve 를 가졌다),
// 신청하는 쪽은 request 를 로그아웃하고 새 계정으로 갈아 쓴다 — 쿠키 저장소가 둘로
// 갈려 있어야 한 테스트 안에서 두 사람을 흉내낼 수 있다.
test("직접 승인 팀은 승인해야 명단에 오르고 그전에는 인원 수에 안 세진다", async ({
  page,
  request,
}) => {
  const { teams } = (await (await page.request.get("/api/teams")).json()) as { teams: Team[] };
  const team = teams.find((item) => item.name !== E2E_ACCOUNT_TEAM);
  if (team === undefined) {
    test.skip(true, "E2E 계정이 속하지 않은 팀이 없어 건너뜀");
    return;
  }
  const { positions } = (await (await page.request.get("/api/positions")).json()) as {
    positions: Position[];
  };
  await page.request.patch(`/api/teams/${team.id}`, {
    data: { name: team.name, join_policy: "approval" },
  });

  const stamp = Date.now();
  const applicantName = `E2E 참가 신청 ${stamp}`;
  await request.post("/api/logout");
  const signup = await request.post("/api/signup", {
    data: {
      name: applicantName,
      email: `e2e-join-${stamp}@banblit.test`,
      password: "password123",
      positions: [positions[0].name],
    },
  });
  const { account } = (await signup.json()) as { account: { id: number } };

  const joined = await request.post(`/api/teams/${team.id}/members`, {
    data: { position_id: positions[0].id },
  });
  const { membership } = (await joined.json()) as { membership: { status: string } };
  expect(membership.status).toBe("pending");

  const waiting = (await (await page.request.get("/api/teams")).json()) as { teams: Team[] };
  expect(waiting.teams.find((item) => item.id === team.id)?.member_count).toBe(team.member_count);

  await page.goto("/teams");
  await page.getByRole("button", { name: new RegExp(escapeRegExp(team.name)) }).click();
  await page.getByRole("button", { name: `${applicantName} 참가 승인` }).click();

  // 기다리는 신청과 명단이 같은 상자를 쓴다. 승인 단추가 사라지는 것을 먼저 기다리지 않으면
  // 신청 줄에 그대로 있는 이름을 명단으로 잘못 보고, 아직 끝나지 않은 승인을 통과시킨다.
  await expect(page.getByRole("button", { name: `${applicantName} 참가 승인` })).toHaveCount(0);
  await expect(page.getByText(applicantName)).toBeVisible();
  const approved = (await (await page.request.get("/api/teams")).json()) as { teams: Team[] };
  expect(approved.teams.find((item) => item.id === team.id)?.member_count).toBe(
    team.member_count + 1,
  );

  // 되돌린다 — 명단과 승인 방식을 테스트 전으로 돌려놓지 않으면 다음 실행이 다른 값을 본다.
  await page.request.delete(`/api/teams/${team.id}/members/${account.id}`);
  await page.request.patch(`/api/teams/${team.id}`, {
    data: { name: team.name, join_policy: team.join_policy },
  });
});
