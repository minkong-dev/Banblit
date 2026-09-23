import { describe, expect, it } from "vitest";

import { PERMISSION_ITEMS, can, roleLabel, teamNavLabel } from "./account";
import type { Account } from "./contract";

function accountWith(
  permissions: Account["permissions"],
  permissionSets: string[] = [],
): Account {
  return {
    id: 1,
    name: "김민수",
    email: "a@b.c",
    login_id: "minsu1",
    avatar: null,
    role: "member",
    permissions,
    permission_sets: permissionSets,
    cohort: 46,
  };
}

describe("teamNavLabel", () => {
  it("팀 생성·수정·삭제 중 하나라도 있으면 팀 관리, 없으면 내 팀으로 표시한다", () => {
    expect(teamNavLabel(accountWith(["team_edit"]))).toBe("팀 관리");
    expect(teamNavLabel(accountWith(["member_add"]))).toBe("내 팀");
    expect(teamNavLabel(null)).toBe("내 팀");
  });
});

describe("roleLabel", () => {
  it("가진 permission set 의 이름을 표시하고, 없으면 일반멤버로 표시한다", () => {
    expect(roleLabel(accountWith([], ["헤드매니저"]))).toBe("헤드매니저");
    expect(roleLabel(accountWith([], ["헤드매니저", "운영진"]))).toBe("헤드매니저, 운영진");
    expect(roleLabel(accountWith([]))).toBe("일반멤버");
    expect(roleLabel(null)).toBe("");
  });
});

describe("can", () => {
  it("가진 항목이면 참, 아니면 거짓이다", () => {
    const me = accountWith(["room_edit", "notice_write"]);
    expect(can(me, "room_edit")).toBe(true);
    expect(can(me, "period_edit")).toBe(false);
  });

  it("아직 못 받아온 계정은 아무것도 가지지 않은 것으로 본다", () => {
    expect(can(null, "room_edit")).toBe(false);
  });

  it("permissions 항목이 아예 없는 응답도 없는 것으로 본다", () => {
    // 이전 버전의 서버가 permissions 없이 응답하는 경우입니다. 타입에는 있지만 값이 없을 수 있습니다.
    const stale = { id: 1, name: "김민수", email: "a@b.c", role: "member", positions: [] };
    expect(can(stale as unknown as Account, "room_edit")).toBe(false);
  });
});

describe("PERMISSION_ITEMS", () => {
  it("서버가 고정한 항목 21개를 그 순서대로 든다", () => {
    // 생성·수정·삭제·부여를 따로 둡니다. 서버 쪽 정본은 backend/db/models.py 의
    // Permission 이고, 이 목록이 정본과 개수가 어긋나면 화면에서 켤 수 없는 항목이 생깁니다.
    expect(PERMISSION_ITEMS).toHaveLength(21);
    expect(PERMISSION_ITEMS.map((item) => item.key)).toContain("period_delete");
    expect(PERMISSION_ITEMS.map((item) => item.key)).toContain("room_delete");
    expect(PERMISSION_ITEMS[0].key).toBe("room_create");
    expect(PERMISSION_ITEMS[PERMISSION_ITEMS.length - 1].key).toBe("permission_grant");
  });

  it("항목마다 한국어 이름이 있다", () => {
    expect(PERMISSION_ITEMS.every((item) => item.label !== "")).toBe(true);
  });
});
