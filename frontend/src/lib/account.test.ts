import { describe, expect, it } from "vitest";

import { PERMISSION_ITEMS, can, permissionLabels, permissionSetNameMessage, roleLabel } from "./account";
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
    const me = accountWith(["room_manage", "notice_write"]);
    expect(can(me, "room_manage")).toBe(true);
    expect(can(me, "period_manage")).toBe(false);
  });

  it("아직 못 받아온 계정은 아무것도 가지지 않은 것으로 본다", () => {
    expect(can(null, "room_manage")).toBe(false);
  });

  it("permissions 항목이 아예 없는 응답도 없는 것으로 본다", () => {
    // 낡은 서버가 permissions 없이 답하는 경우다. 타입에는 있지만 값이 없을 수 있다.
    const stale = { id: 1, name: "김민수", email: "a@b.c", role: "member", positions: [] };
    expect(can(stale as unknown as Account, "room_manage")).toBe(false);
  });
});

describe("PERMISSION_ITEMS", () => {
  it("서버가 고정한 열 가지를 그 순서대로 든다", () => {
    // 팀 참가 승인은 참가 신청 자체가 없어지면서 지킬 자리가 사라졌다.
    expect(PERMISSION_ITEMS).toHaveLength(10);
    expect(PERMISSION_ITEMS[0].key).toBe("room_manage");
    expect(PERMISSION_ITEMS[9].key).toBe("permission_grant");
  });

  it("항목마다 한국어 이름이 있다", () => {
    expect(PERMISSION_ITEMS.every((item) => item.label !== "")).toBe(true);
  });
});

describe("permissionLabels", () => {
  it("고른 순서와 무관하게 항목 선언 순서로 한국어 이름을 돌려준다", () => {
    expect(permissionLabels(["notice_write", "room_manage"])).toEqual(["합주실 관리", "공지 쓰기"]);
  });

  it("모르는 이름은 버린다", () => {
    expect(permissionLabels(["room_manage", "무언가"])).toEqual(["합주실 관리"]);
  });

  it("빈 목록은 빈 목록이다", () => {
    expect(permissionLabels([])).toEqual([]);
  });
});

describe("permissionSetNameMessage", () => {
  it("이미 있는 이름은 받지 않는다", () => {
    expect(permissionSetNameMessage("헤드매니저", ["헤드매니저", "합주실 담당"]))
      .toBe("같은 이름의 권한이 이미 있습니다.");
  });

  it("앞뒤 공백만 다른 것도 같은 이름으로 본다", () => {
    expect(permissionSetNameMessage("  헤드매니저 ", ["헤드매니저"]))
      .toBe("같은 이름의 권한이 이미 있습니다.");
  });

  it("겹치지 않으면 통과한다", () => {
    expect(permissionSetNameMessage("공지 담당", ["헤드매니저"])).toBe("");
  });

  it("비어 있으면 채워 달라고 한다", () => {
    expect(permissionSetNameMessage("   ", [])).toBe("권한 이름을 입력해 주세요.");
  });
});
