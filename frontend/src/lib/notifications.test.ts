import { describe, expect, it } from "vitest";

import { notificationText, unreadCount } from "./notifications";
import type { Notification } from "./contract";

function row(id: number, kind: Notification["kind"] = "assignment_updated"): Notification {
  return { id, kind, created_at: "2026-09-14T18:00:00", target: null, target_starts_at: null, reason: null };
}

function rejected(target: "reservation" | "unavailable", reason: string): Notification {
  return { ...row(9, "rejected"), target, target_starts_at: "2026-09-14T18:00:00", reason };
}

describe("unreadCount", () => {
  // 읽음 처리가 행을 삭제하므로 목록에 남아 있는 알림은 전부 읽지 않은 알림입니다.
  it("목록에 있는 알림을 전부 센다", () => {
    expect(unreadCount([row(1), row(2), row(3)])).toBe(3);
  });

  it("읽음 처리 후 목록이 비면 0이다", () => {
    expect(unreadCount([])).toBe(0);
  });
});

describe("notificationText", () => {
  it("배정이 다시 돈 알림을 사람이 읽을 문장으로 바꾼다", () => {
    expect(notificationText(row(1, "assignment_updated"))).toBe("합주 일정이 업데이트 되었어요.");
  });

  it("집중 합주기간 때문에 예약이 취소된 알림을 사람이 읽을 문장으로 바꾼다", () => {
    expect(notificationText(row(1, "reservation_cancelled"))).toBe("예약이 집중 합주기간과 겹쳐 취소되었어요.");
  });

  // 반려 알림은 예약·불가능 일정이 같은 문장 틀을 씁니다. 사유는 다음 줄에 그대로 둡니다.
  it("반려된 예약 알림은 언제의 예약인지와 사유를 두 줄로 쓴다", () => {
    expect(notificationText(rejected("reservation", "동아리방 점검 날이에요"))).toBe(
      "9월 14일 월요일 18:00 예약이 반려되었어요. 사유는 다음과 같아요.\n동아리방 점검 날이에요",
    );
  });

  it("반려된 불가능 일정 알림도 같은 틀을 쓴다", () => {
    expect(notificationText(rejected("unavailable", "리허설이라 빠질 수 없어요"))).toBe(
      "9월 14일 월요일 18:00 불가능 일정이 반려되었어요. 사유는 다음과 같아요.\n리허설이라 빠질 수 없어요",
    );
  });

  it("모르는 종류가 와도 종류 이름을 그대로 내보이지 않는다", () => {
    const text = notificationText({ ...row(1), kind: "something_new" as Notification["kind"] });
    expect(text).not.toContain("something_new");
    expect(text.length).toBeGreaterThan(0);
  });
});
