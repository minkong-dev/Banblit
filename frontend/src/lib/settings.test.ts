import { describe, expect, it } from "vitest";

import {
  capacity,
  dateRangeMessage,
  ensembleMessage,
  openHoursMessage,
  practiceWindowMessage,
  roomNameMessage,
  sessionMinuteChoices,
  sessionMinutesLabel,
  slotsBetween,
} from "./settings";

describe("ensembleMessage", () => {
  const period = { starts_on: "2026-09-01", ends_on: "2026-09-20", everyday: false };
  const room = { opens_at: "18:00", closes_at: "23:00" };
  const form = { starts_on: "2026-09-11", ends_on: "2026-09-13", starts_at: "19:00", ends_at: "22:00" };

  it("기간 안의 날짜와 운영 시간 안의 정각이면 통과한다", () => {
    expect(ensembleMessage(form, period, room, 60)).toBe("");
  });

  it("날짜가 비어 있거나 뒤집히면 날짜 범위 문구를 돌려준다", () => {
    expect(ensembleMessage({ ...form, starts_on: "" }, period, room, 60)).toBe("시작일을 지정해주세요.");
    expect(ensembleMessage({ ...form, ends_on: "2026-09-10" }, period, room, 60))
      .toBe("종료일은 시작일보다 빠를 수 없어요.");
  });

  it("집중합주 기간 밖의 날짜는 받지 않는다", () => {
    expect(ensembleMessage({ ...form, ends_on: "2026-09-21" }, period, room, 60))
      .toBe("전체합주 날짜는 집중합주 기간 안이어야 해요.");
  });

  it("매일 기간은 시작일만 기간 시작일 이후면 된다", () => {
    const everyday = { ...period, ends_on: "2026-09-01", everyday: true };
    expect(ensembleMessage({ ...form, ends_on: "2027-01-01" }, everyday, room, 60)).toBe("");
    expect(ensembleMessage({ ...form, starts_on: "2026-08-31" }, everyday, room, 60))
      .toBe("전체합주 날짜는 집중합주 기간 안이어야 해요.");
  });

  it("합주실을 선택하지 않으면 받지 않는다", () => {
    expect(ensembleMessage(form, period, undefined, 60)).toBe("합주실을 선택해주세요.");
  });

  it("점유 단위 격자 밖의 시각은 받지 않는다", () => {
    expect(ensembleMessage({ ...form, starts_at: "19:30" }, period, room, 60))
      .toBe("전체합주 시각은 정각 기준으로 지정해주세요.");
    expect(ensembleMessage({ ...form, starts_at: "19:30" }, period, room, 30)).toBe("");
  });

  it("끝 시각이 시작 시각보다 늦어야 한다", () => {
    expect(ensembleMessage({ ...form, starts_at: "21:00", ends_at: "20:00" }, period, room, 60))
      .toBe("끝 시각은 시작 시각보다 늦어야 해요.");
  });

  it("합주실 운영 시간 밖의 시각은 받지 않는다", () => {
    expect(ensembleMessage({ ...form, starts_at: "17:00" }, period, room, 60))
      .toBe("전체합주 시각은 합주실 운영 시간 안이어야 해요.");
    expect(ensembleMessage({ ...form, ends_at: "23:30" }, period, room, 30))
      .toBe("전체합주 시각은 합주실 운영 시간 안이어야 해요.");
  });
});

describe("openHoursMessage", () => {
  it("정시에서만 열고 닫는다", () => {
    expect(openHoursMessage("18:00", "23:00")).toBe("");
    expect(openHoursMessage("10:00", "22:00")).toBe("");
  });

  it("정시가 아니면 사유를 돌려준다", () => {
    expect(openHoursMessage("18:20", "23:00")).toBe("개방 시간은 정각 기준으로 지정해주세요.");
    expect(openHoursMessage("18:00", "22:45")).toBe("마감 시간은 정각 기준으로 지정해주세요.");
  });

  it("닫는 시각이 여는 시각보다 늦어야 한다", () => {
    expect(openHoursMessage("23:00", "18:00")).toBe("마감 시간은 개방 시간보다 빠를 수 없어요.");
    expect(openHoursMessage("18:00", "18:00")).toBe("마감 시간은 개방 시간보다 빠를 수 없어요.");
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
      .toBe("종료일은 시작일보다 빠를 수 없어요.");
  });

  it("하루짜리 기간은 통과한다", () => {
    expect(dateRangeMessage("2026-09-14", "2026-09-14")).toBe("");
  });

  it("비어 있으면 채워 달라고 한다", () => {
    expect(dateRangeMessage("", "2026-09-14")).toBe("시작일을 지정해주세요.");
    expect(dateRangeMessage("2026-09-14", "")).toBe("종료일을 지정해주세요.");
  });
});

describe("slotsBetween", () => {
  it("여는 시각부터 닫는 시각까지를 한 시간으로 센다", () => {
    expect(slotsBetween("18:00", "23:00")).toBe(5);
    expect(slotsBetween("18:00", "19:00")).toBe(1);
  });

  it("성하지 않은 값은 0 이다", () => {
    expect(slotsBetween("23:00", "18:00")).toBe(0);
    expect(slotsBetween("", "23:00")).toBe(0);
  });
});

describe("capacity", () => {
  const rooms = [
    { opens_at: "18:00", closes_at: "23:00" },  // 5칸
    { opens_at: "10:00", closes_at: "22:00" },  // 12칸
  ];

  it("방을 모두 더해 하루치를 내고, 날수를 곱해 전체를 낸다", () => {
    const got = capacity({ rooms, days: 14, teams: 6 });
    expect(got.perDay).toBe(17);
    expect(got.total).toBe(238);
  });

  it("팀 수로 나눈 몫이 팀당 몫이고 나머지는 남는다", () => {
    const got = capacity({ rooms, days: 14, teams: 6 });
    expect(got.perTeam).toBe(39);
    expect(got.leftover).toBe(4);
  });

  it("팀이 없으면 나누지 않고 전체가 남는다", () => {
    const got = capacity({ rooms, days: 14, teams: 0 });
    expect(got.perTeam).toBe(0);
    expect(got.leftover).toBe(238);
  });

  it("점유 단위가 30분이면 30분 자리의 개수로 센다", () => {
    // 18:30 은 60분 격자에 맞지 않습니다. 60분으로 세면 이 합주실이 0칸이 됩니다.
    const halfHourRooms = [{ opens_at: "18:30", closes_at: "22:00" }];

    expect(capacity({ rooms: halfHourRooms, days: 1, teams: 2, slotMinutes: 30 })).toEqual({
      perDay: 7, total: 7, perTeam: 3, leftover: 1,
    });
  });

  it("방이 없으면 전부 0 이다", () => {
    expect(capacity({ rooms: [], days: 14, teams: 6 })).toEqual({
      perDay: 0, total: 0, perTeam: 0, leftover: 0,
    });
  });
});

describe("sessionMinuteChoices", () => {
  it("칸의 배수만 고를 수 있게 한다", () => {
    // 60분 칸에서는 90분 합주가 칸 중간에서 끝나므로 선택지에 없습니다.
    expect(sessionMinuteChoices(60)).toEqual([60, 120, 180, 240]);
  });

  it("칸 자체도 선택지에 포함한다", () => {
    // 30분만 연습하는 팀을 위해 칸과 같은 길이를 고를 수 있어야 합니다.
    expect(sessionMinuteChoices(30)).toContain(30);
  });

  it("칸보다 짧은 길이는 넣지 않는다", () => {
    expect(sessionMinuteChoices(60).some((minutes) => minutes < 60)).toBe(false);
  });

  it("상한 240분을 넘지 않는다", () => {
    expect(sessionMinuteChoices(5).every((minutes) => minutes <= 240)).toBe(true);
  });

  it("칸이 12분처럼 나누어떨어지지 않는 값이어도 배수만 남긴다", () => {
    expect(sessionMinuteChoices(12)).toEqual([12, 60, 120, 180, 240]);
  });
});

describe("sessionMinutesLabel", () => {
  it("한 시간이 넘으면 시간과 분으로 끊어 읽는다", () => {
    expect(sessionMinutesLabel(90)).toBe("1시간 30분");
  });

  it("정확히 시간 단위면 분을 붙이지 않는다", () => {
    expect(sessionMinutesLabel(120)).toBe("2시간");
  });

  it("한 시간 미만은 분으로만 표시한다", () => {
    expect(sessionMinutesLabel(30)).toBe("30분");
  });
});

describe("practiceWindowMessage", () => {
  const empty = { starts_at: "", ends_at: "" };

  it("둘 다 비어 있으면 정하지 않은 것으로 보고 통과시킨다", () => {
    expect(practiceWindowMessage(empty, empty, 30)).toBe("");
  });

  it("한쪽만 채우면 끝 시각 없는 시간대가 되므로 거절한다", () => {
    expect(practiceWindowMessage({ starts_at: "17:00", ends_at: "" }, empty, 30))
      .toBe("평일 합주 종료 시각을 입력해주세요.");
  });

  it("끝이 시작보다 빠르면 거절한다", () => {
    expect(practiceWindowMessage({ starts_at: "23:00", ends_at: "17:00" }, empty, 30))
      .toBe("평일 합주 종료 시각은 시작 시각보다 늦어야 해요.");
  });

  it("격자 위가 아니면 거절한다", () => {
    // 배정 구간이 격자에서 벗어나면 서버가 칸을 만들지 못합니다.
    expect(practiceWindowMessage({ starts_at: "17:15", ends_at: "23:00" }, empty, 30))
      .toBe("평일 합주 시간은 30분 기준으로 지정해주세요.");
  });

  it("평일이 올바르면 주말도 검사한다", () => {
    expect(practiceWindowMessage({ starts_at: "17:00", ends_at: "23:00" }, { starts_at: "09:00", ends_at: "" }, 30))
      .toBe("주말 합주 종료 시각을 입력해주세요.");
  });

  it("둘 다 올바르면 통과시킨다", () => {
    expect(practiceWindowMessage(
      { starts_at: "17:00", ends_at: "23:00" }, { starts_at: "09:00", ends_at: "23:00" }, 30,
    )).toBe("");
  });
});
