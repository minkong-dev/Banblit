import { describe, expect, it } from "vitest";

import { notificationText, unreadCount } from "./notifications";
import type { Notification } from "./contract";

function row(id: number): Notification {
  return { id, kind: "assignment_updated", created_at: "2026-09-14T18:00:00" };
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
    expect(notificationText("assignment_updated")).toBe("합주 일정이 업데이트 되었어요.");
  });

  it("모르는 종류가 와도 종류 이름을 그대로 내보이지 않는다", () => {
    const text = notificationText("something_new");
    expect(text).not.toContain("something_new");
    expect(text.length).toBeGreaterThan(0);
  });
});
