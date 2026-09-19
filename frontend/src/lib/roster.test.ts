import { describe, expect, it } from "vitest";

import {
  memberLabel,
  myTeamIds,
  seatAssignments,
  seatKey,
  seatsOf,
  slotCountsMessage,
  slotName,
  teamNameMessage,
  teamsOf,
  teamsShown,
} from "./roster";

describe("teamsShown", () => {
  it("팀 관리 권한이 있으면 전체 팀, 없으면 소속 팀만 반환한다", () => {
    const all = [{ id: 1 }, { id: 2 }, { id: 3 }];

    expect(teamsShown(all, [2], true)).toEqual(all);
    expect(teamsShown(all, [2], false)).toEqual([{ id: 2 }]);
  });
});
import type { Member, TeamSlot } from "./contract";

const KIM: Member = { id: 7, name: "김민수", cohort: 46 };
const LEE: Member = { id: 8, name: "이서연", cohort: null };

function savedSlot(id: number, instrument: TeamSlot["instrument"], ordinal: number, memberId: number | null): TeamSlot {
  return { id, team_id: 1, instrument, ordinal, member_id: memberId, member_name: null, member_cohort: null };
}

describe("seatsOf", () => {
  it("포지션 수만큼 자리를 생성하고, 같은 포지션·번호에 선택한 멤버를 지정한다", () => {
    const seats = seatsOf(
      { 보컬: 0, 일렉: 2, 통기타: 0, 베이스: 0, 신디: 0, 드럼: 1 },
      new Map([[seatKey("일렉", 2), KIM], [seatKey("드럼", 2), LEE]]),
    );

    expect(seats.map((seat) => seat.label)).toEqual(["일렉 1", "일렉 2", "드럼"]);
    expect(seats.map((seat) => seat.member?.id ?? null)).toEqual([null, 7, null]);
  });
});

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
    expect(slotCountsMessage({ 보컬: 0, 드럼: 0 })).toBe("포지션을 한 자리 이상 추가해주세요.");
  });

  it("열 자리를 넘으면 막는다", () => {
    // 배정 계산이 팀당 10명까지만 받습니다. 더 생성해도 사용할 수 없습니다.
    expect(slotCountsMessage({ 보컬: 6, 일렉: 5 })).toBe("팀 당 10 자리의 포지션까지만 추가가 가능해요.");
  });

  it("딱 열 자리는 통과한다", () => {
    expect(slotCountsMessage({ 보컬: 5, 일렉: 5 })).toBe("");
  });

  it("한 자리라도 있으면 통과한다", () => {
    expect(slotCountsMessage({ 보컬: 1, 드럼: 0 })).toBe("");
  });
});

describe("slotName", () => {
  it("같은 포지션이 1자리뿐이면 번호를 붙이지 않는다", () => {
    // \"드럼 1\"은 불필요합니다. 두 번째 자리가 없으면 번호가 아무것도 구분하지 않습니다.
    expect(slotName("드럼", 1, 1)).toBe("드럼");
  });

  it("같은 포지션이 2자리 이상이면 번호를 붙인다", () => {
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
    const got = teamsOf(rows, [2], []);
    expect(got.map((team) => [team.id, team.mine])).toEqual([
      [1, false],
      [2, true],
    ]);
  });

  it("자리를 아직 못 받아왔으면 내 팀이 없다", () => {
    expect(teamsOf(rows, [], []).every((team) => !team.mine)).toBe(true);
  });
});

describe("teamsOf — 색", () => {
  const rows = [
    { team_id: 2, team: "곰팡이" },
    { team_id: 1, team: "청산" },
  ];

  it("팀에 저장된 색으로 key 를 정한다 — 목록 순서가 바뀌어도 색이 그대로다", () => {
    const all = [{ id: 2, color: "blue" }, { id: 5, color: "jade" }, { id: 1, color: "tomato" }];
    expect(teamsOf(rows, [], all).map((team) => [team.id, team.key])).toEqual([
      [1, "team-tomato"],
      [2, "team-blue"],
    ]);
  });

  it("목록을 아직 못 받아왔으면 색 없는 key 를 팀마다 따로 준다", () => {
    expect(teamsOf(rows, [], []).map((team) => team.key)).toEqual(["pending-1", "pending-2"]);
  });
});

describe("seatAssignments", () => {
  it("변경된 자리만 최종 상태로 반환한다", () => {
    const seats = seatsOf(
      { 보컬: 1, 일렉: 1, 통기타: 0, 베이스: 1, 신디: 0, 드럼: 0 },
      new Map([[seatKey("보컬", 1), LEE], [seatKey("일렉", 1), KIM]]),
    );
    const saved = [
      savedSlot(11, "보컬", 1, 7), // 김민수 → 이서연
      savedSlot(12, "일렉", 1, 8), // 이서연 → 김민수
      savedSlot(13, "베이스", 1, 9), // 멤버 → 빈 자리
    ];

    expect(seatAssignments(seats, saved)).toEqual([
      { slot_id: 11, member_id: 8 },
      { slot_id: 12, member_id: 7 },
      { slot_id: 13, member_id: null },
    ]);
  });

  it("그대로인 자리는 포함하지 않는다", () => {
    const seats = seatsOf(
      { 보컬: 1, 일렉: 0, 통기타: 0, 베이스: 0, 신디: 0, 드럼: 0 },
      new Map([[seatKey("보컬", 1), KIM]]),
    );

    expect(seatAssignments(seats, [savedSlot(11, "보컬", 1, 7)])).toEqual([]);
  });
})
