import { describe, expect, it } from "vitest";

import { joinPositionMessage, teamNameMessage } from "./roster";

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
