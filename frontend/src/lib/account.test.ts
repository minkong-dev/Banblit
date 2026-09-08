import { describe, expect, it } from "vitest";

import { PERMISSION_ITEMS, can, roleLabel } from "./account";
import type { Account } from "./contract";

function accountWith(permissions: Account["permissions"]): Account {
  return { id: 1, name: "김민수", email: "a@b.c", role: "member", permissions, cohort: 46 };
}

describe("roleLabel", () => {
  it("열한 가지가 전부 켜진 사람만 헤드매니저로 부른다", () => {
    expect(roleLabel("head_manager")).toBe("헤드매니저");
    expect(roleLabel("member")).toBe("일반멤버");
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
    // 낡은 서버가 permissions 없이 답하는 경우다. 타입에는 있지만 값이 없을 수 있다.
    const stale = { id: 1, name: "김민수", email: "a@b.c", role: "member", positions: [] };
    expect(can(stale as unknown as Account, "room_edit")).toBe(false);
  });
});

describe("PERMISSION_ITEMS", () => {
  it("서버가 고정한 열여덟 가지를 그 순서대로 든다", () => {
    // 만들기·수정·삭제·주기를 따로 둔다. 서버 쪽 정본은 backend/db/models.py 의
    // Permission 이고, 이 목록이 그것과 개수가 어긋나면 화면에 못 켜는 항목이 생긴다.
    expect(PERMISSION_ITEMS).toHaveLength(18);
    expect(PERMISSION_ITEMS[0].key).toBe("room_create");
    expect(PERMISSION_ITEMS[PERMISSION_ITEMS.length - 1].key).toBe("permission_grant");
  });

  it("항목마다 한국어 이름이 있다", () => {
    expect(PERMISSION_ITEMS.every((item) => item.label !== "")).toBe(true);
  });
});
