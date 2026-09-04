import { describe, expect, it } from "vitest";

import { capacity, dateRangeMessage, openHoursMessage, roomNameMessage, slotsBetween } from "./settings";

describe("openHoursMessage", () => {
  it("정시와 30분에서만 열고 닫는다", () => {
    expect(openHoursMessage("18:00", "23:00")).toBe("");
    expect(openHoursMessage("18:30", "23:30")).toBe("");
  });

  it("30분 격자를 벗어나면 사유를 돌려준다", () => {
    expect(openHoursMessage("18:20", "23:00")).toBe("여는 시각은 정시 또는 30분이어야 합니다.");
    expect(openHoursMessage("18:00", "22:45")).toBe("닫는 시각은 정시 또는 30분이어야 합니다.");
  });

  it("닫는 시각이 여는 시각보다 늦어야 한다", () => {
    expect(openHoursMessage("23:00", "18:00")).toBe("닫는 시각은 여는 시각보다 늦어야 합니다.");
    expect(openHoursMessage("18:00", "18:00")).toBe("닫는 시각은 여는 시각보다 늦어야 합니다.");
  });

  it("비어 있으면 채워 달라고 한다", () => {
    expect(openHoursMessage("", "23:00")).toBe("여는 시각을 입력해 주세요.");
    expect(openHoursMessage("18:00", "")).toBe("닫는 시각을 입력해 주세요.");
  });
});

describe("roomNameMessage", () => {
  it("이미 있는 이름은 받지 않는다", () => {
    expect(roomNameMessage("합주실 A", ["합주실 A", "합주실 B"]))
      .toBe("같은 이름의 합주실이 이미 있습니다.");
  });

  it("앞뒤 공백만 다른 것도 같은 이름으로 본다", () => {
    expect(roomNameMessage("  합주실 A ", ["합주실 A"]))
      .toBe("같은 이름의 합주실이 이미 있습니다.");
  });

  it("겹치지 않으면 통과한다", () => {
    expect(roomNameMessage("합주실 C", ["합주실 A", "합주실 B"])).toBe("");
  });

  it("비어 있으면 채워 달라고 한다", () => {
    expect(roomNameMessage("   ", [])).toBe("합주실 이름을 입력해 주세요.");
  });
});

describe("dateRangeMessage", () => {
  it("끝이 시작보다 빠르면 받지 않는다", () => {
    expect(dateRangeMessage("2026-09-27", "2026-09-14"))
      .toBe("끝나는 날은 시작하는 날보다 빠를 수 없습니다.");
  });

  it("하루짜리 기간은 통과한다", () => {
    expect(dateRangeMessage("2026-09-14", "2026-09-14")).toBe("");
  });

  it("비어 있으면 채워 달라고 한다", () => {
    expect(dateRangeMessage("", "2026-09-14")).toBe("시작하는 날을 골라 주세요.");
    expect(dateRangeMessage("2026-09-14", "")).toBe("끝나는 날을 골라 주세요.");
  });
});

describe("slotsBetween", () => {
  it("여는 시각부터 닫는 시각까지를 30분으로 센다", () => {
    expect(slotsBetween("18:00", "23:00")).toBe(10);
    expect(slotsBetween("18:30", "19:00")).toBe(1);
  });

  it("성하지 않은 값은 0 이다", () => {
    expect(slotsBetween("23:00", "18:00")).toBe(0);
    expect(slotsBetween("", "23:00")).toBe(0);
  });
});

describe("capacity", () => {
  const rooms = [
    { opens_at: "18:00", closes_at: "23:00" },  // 10
    { opens_at: "10:00", closes_at: "22:00" },  // 24
  ];

  it("방을 모두 더해 하루치를 내고, 날수를 곱해 전체를 낸다", () => {
    const got = capacity({ rooms, days: 14, teams: 6 });
    expect(got.perDay).toBe(34);
    expect(got.total).toBe(476);
  });

  it("팀 수로 나눈 몫이 팀당 몫이고 나머지는 남는다", () => {
    const got = capacity({ rooms, days: 14, teams: 6 });
    expect(got.perTeam).toBe(79);
    expect(got.leftover).toBe(2);
  });

  it("팀이 없으면 나누지 않고 전체가 남는다", () => {
    const got = capacity({ rooms, days: 14, teams: 0 });
    expect(got.perTeam).toBe(0);
    expect(got.leftover).toBe(476);
  });

  it("방이 없으면 전부 0 이다", () => {
    expect(capacity({ rooms: [], days: 14, teams: 6 })).toEqual({
      perDay: 0, total: 0, perTeam: 0, leftover: 0,
    });
  });
});
