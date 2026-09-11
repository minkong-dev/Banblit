import { describe, expect, it } from "vitest";

import { notificationText, unreadCount } from "./notifications";
import type { Notification } from "./contract";

function row(id: number, read: boolean): Notification {
  return { id, kind: "assignment_updated", created_at: "2026-09-14T18:00:00", read };
}

describe("unreadCount", () => {
  it("안 읽은 것만 센다", () => {
    expect(unreadCount([row(1, false), row(2, true), row(3, false)])).toBe(2);
  });

  it("읽으면 수가 준다", () => {
    const before = [row(1, false), row(2, false)];
    const after = before.map((item) => ({ ...item, read: true }));
    expect(unreadCount(before)).toBe(2);
    expect(unreadCount(after)).toBe(0);
  });

  it("알림이 없으면 0이다", () => {
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
