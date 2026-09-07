import { describe, expect, it } from "vitest";

import {
  joinPolicyLabel,
  joinPositionMessage,
  joinResultMessage,
  joinStand,
  peopleOf,
  teamIdsByStatus,
  teamNameMessage,
  teamsOf,
} from "./roster";

describe("teamNameMessage", () => {
  it("이미 있는 이름은 받지 않는다", () => {
    expect(teamNameMessage("새벽 네시", ["새벽 네시", "파랑주의보"]))
      .toBe("같은 이름의 팀이 이미 있습니다.");
  });

  it("앞뒤 공백만 다른 것도 같은 이름으로 본다", () => {
    expect(teamNameMessage("  새벽 네시 ", ["새벽 네시"]))
      .toBe("같은 이름의 팀이 이미 있습니다.");
  });

  it("겹치지 않으면 통과한다", () => {
    expect(teamNameMessage("새 팀", ["새벽 네시", "파랑주의보"])).toBe("");
  });

  it("비어 있으면 채워 달라고 한다", () => {
    expect(teamNameMessage("   ", [])).toBe("팀 이름을 입력해 주세요.");
  });
});

describe("joinPositionMessage", () => {
  it("고르지 않았으면 골라 달라고 한다", () => {
    expect(joinPositionMessage(null)).toBe("맡을 포지션을 골라 주세요.");
  });

  it("골랐으면 통과한다", () => {
    expect(joinPositionMessage(3)).toBe("");
  });
});

describe("teamsOf", () => {
  const rows = [
    { team_id: 11, team: "새벽 네시" },
    { team_id: 22, team: "파랑주의보" },
    { team_id: 33, team: "여섯 줄" },
  ];

  it("내 팀은 목록 순서가 아니라 내가 실제로 속한 팀이다", () => {
    // 앞의 둘을 내 팀으로 치던 자리 — 실제 소속이 뒤쪽이면 그 규칙은 틀린 답을 낸다.
    expect(teamsOf(rows, [33]).filter((team) => team.mine).map((team) => team.id)).toEqual([33]);
  });

  it("소속을 아직 못 받아왔으면 내 팀이 없다", () => {
    expect(teamsOf(rows, []).some((team) => team.mine)).toBe(false);
  });
});

describe("peopleOf", () => {
  const teams = [{ id: 1, name: "새벽 네시" }, { id: 2, name: "여섯줄" }];

  it("팀 명단을 사람 단위로 합치고 이름 순으로 늘어놓는다", () => {
    const got = peopleOf(teams, [
      [{ id: 7, name: "이지은", positions: ["보컬"] }],
      [{ id: 3, name: "강민수", positions: ["드럼"] }],
    ]);
    expect(got).toEqual([
      { id: 3, name: "강민수", where: "여섯줄 · 드럼" },
      { id: 7, name: "이지은", where: "새벽 네시 · 보컬" },
    ]);
  });

  it("두 팀에 걸친 사람은 소속을 이어 붙여 한 줄로 만든다", () => {
    const got = peopleOf(teams, [
      [{ id: 7, name: "이지은", positions: ["보컬"] }],
      [{ id: 7, name: "이지은", positions: ["기타"] }],
    ]);
    expect(got).toEqual([{ id: 7, name: "이지은", where: "새벽 네시 · 보컬, 여섯줄 · 기타" }]);
  });

  it("아직 못 받아온 명단은 건너뛴다", () => {
    expect(peopleOf(teams, [undefined, undefined])).toEqual([]);
  });
});

describe("joinResultMessage", () => {
  it("자동 승인인 팀은 바로 참가했다고 알린다", () => {
    expect(joinResultMessage("approved")).toBe("이 팀에 참가했습니다.");
  });

  it("직접 승인인 팀은 기다리는 중이라고 알린다", () => {
    expect(joinResultMessage("pending")).toBe("신청했습니다. 승인을 기다리는 중입니다.");
  });
});

describe("joinStand", () => {
  it("이미 소속이면 나가는 자리를 낸다", () => {
    expect(joinStand(true, false)).toBe("member");
  });

  it("신청만 해 둔 상태면 기다리는 자리를 낸다", () => {
    expect(joinStand(false, true)).toBe("pending");
  });

  it("소속도 신청도 아니면 참가하는 자리를 낸다", () => {
    expect(joinStand(false, false)).toBe("join");
  });

  it("승인이 끝난 뒤에는 신청 자국이 남아 있어도 소속이 이긴다", () => {
    expect(joinStand(true, true)).toBe("member");
  });
});

describe("teamIdsByStatus", () => {
  const memberships = [
    { team_id: 3, team_name: "새벽 네시", position: "보컬", status: "approved" as const },
    { team_id: 5, team_name: "파랑주의보", position: "기타", status: "pending" as const },
    { team_id: 8, team_name: "여섯 줄", position: "드럼", status: "approved" as const },
  ];

  it("소속된 팀만 골라낸다 — 승인을 기다리는 팀은 내 팀이 아니다", () => {
    expect(teamIdsByStatus(memberships, "approved")).toEqual([3, 8]);
  });

  it("승인을 기다리는 팀만 따로 골라낸다", () => {
    expect(teamIdsByStatus(memberships, "pending")).toEqual([5]);
  });

  it("어느 팀에도 없으면 빈 목록이다", () => {
    expect(teamIdsByStatus([], "approved")).toEqual([]);
  });
});

describe("joinPolicyLabel", () => {
  it("자동 승인인 팀을 그렇게 부른다", () => {
    expect(joinPolicyLabel("auto")).toBe("자동 승인");
  });

  it("직접 승인인 팀을 그렇게 부른다", () => {
    expect(joinPolicyLabel("approval")).toBe("직접 승인");
  });
});
