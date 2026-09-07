import { describe, expect, it } from "vitest";

import {
  memberLabel,
  myTeamIds,
  peopleOf,
  slotCountsMessage,
  slotName,
  teamNameMessage,
  teamsOf,
} from "./roster";

describe("teamNameMessage", () => {
  it("이미 있는 이름은 받지 않는다", () => {
    expect(teamNameMessage("청산", ["청산", "곰팡이"]))
      .toBe("같은 이름의 팀이 이미 있습니다.");
  });

  it("앞뒤 공백만 다른 것도 같은 이름으로 본다", () => {
    expect(teamNameMessage("  청산 ", ["청산"]))
      .toBe("같은 이름의 팀이 이미 있습니다.");
  });

  it("겹치지 않으면 통과한다", () => {
    expect(teamNameMessage("나침반", ["청산"])).toBe("");
  });

  it("비어 있으면 채워 달라고 한다", () => {
    expect(teamNameMessage("   ", [])).toBe("팀 이름을 입력해 주세요.");
  });
});

describe("slotCountsMessage", () => {
  it("한 자리도 고르지 않았으면 고르라고 한다", () => {
    expect(slotCountsMessage({ 보컬: 0, 드럼: 0 })).toBe("악기를 하나 이상 골라 주세요.");
  });

  it("열 자리를 넘으면 막는다", () => {
    // 배정 계산이 팀당 10명까지만 받는다 — 더 만들어도 못 쓴다.
    expect(slotCountsMessage({ 보컬: 6, 일렉: 5 })).toBe("한 팀의 자리는 10개까지입니다.");
  });

  it("딱 열 자리는 통과한다", () => {
    expect(slotCountsMessage({ 보컬: 5, 일렉: 5 })).toBe("");
  });

  it("한 자리라도 있으면 통과한다", () => {
    expect(slotCountsMessage({ 보컬: 1, 드럼: 0 })).toBe("");
  });
});

describe("slotName", () => {
  it("같은 악기가 하나뿐이면 번호를 붙이지 않는다", () => {
    // "드럼 1" 은 군더더기다 — 둘째가 없으면 번호가 아무것도 가르지 않는다.
    expect(slotName("드럼", 1, 1)).toBe("드럼");
  });

  it("같은 악기가 여럿이면 번호를 붙인다", () => {
    expect(slotName("일렉", 2, 2)).toBe("일렉 2");
  });
});

describe("memberLabel", () => {
  it("기수를 이름 옆에 붙인다", () => {
    expect(memberLabel("박민경", 47)).toBe("박민경 (47기)");
  });

  it("기수를 모르면 이름만 쓴다 — 없는 값을 지어내지 않는다", () => {
    expect(memberLabel("황찬우", null)).toBe("황찬우");
  });
});

describe("myTeamIds", () => {
  it("내가 앉아 있는 자리에서 팀 번호만 뽑는다", () => {
    const teams = [
      { team_id: 3, team_name: "청산", instrument: "보컬" as const, ordinal: 1 },
      { team_id: 7, team_name: "곰팡이", instrument: "일렉" as const, ordinal: 2 },
    ];
    expect(myTeamIds(teams)).toEqual([3, 7]);
  });

  it("아무 자리도 없으면 빈 목록이다", () => {
    expect(myTeamIds([])).toEqual([]);
  });
});

describe("teamsOf", () => {
  const rows = [
    { team_id: 2, team: "곰팡이" },
    { team_id: 1, team: "청산" },
    { team_id: 2, team: "곰팡이" },
  ];

  it("내 팀은 목록 순서가 아니라 내가 실제로 앉은 팀이다", () => {
    const got = teamsOf(rows, [2]);
    expect(got.map((team) => [team.id, team.mine])).toEqual([
      [1, false],
      [2, true],
    ]);
  });

  it("자리를 아직 못 받아왔으면 내 팀이 없다", () => {
    expect(teamsOf(rows, []).every((team) => !team.mine)).toBe(true);
  });
});

describe("peopleOf", () => {
  const teams = [{ id: 1, name: "청산" }, { id: 2, name: "곰팡이" }];

  it("팀 명단을 사람 단위로 합치고 이름 순으로 늘어놓는다", () => {
    const got = peopleOf(teams, [
      [{ id: 7, name: "황찬우", cohort: 44 }],
      [{ id: 3, name: "김민서", cohort: null }],
    ]);
    expect(got).toEqual([
      { id: 3, name: "김민서", where: "곰팡이" },
      { id: 7, name: "황찬우 (44기)", where: "청산" },
    ]);
  });

  it("두 팀에 걸친 사람은 소속을 이어 붙여 한 줄로 만든다", () => {
    const got = peopleOf(teams, [
      [{ id: 7, name: "황찬우", cohort: 44 }],
      [{ id: 7, name: "황찬우", cohort: 44 }],
    ]);
    expect(got).toEqual([{ id: 7, name: "황찬우 (44기)", where: "청산, 곰팡이" }]);
  });

  it("아직 못 받아온 명단은 건너뛴다", () => {
    expect(peopleOf(teams, [undefined, undefined])).toEqual([]);
  });
});
