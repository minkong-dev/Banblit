// 알림의 표시. 서버는 무슨 일이 있었는지(kind)만 보내고, 사람이 읽을 문장은 여기서
// 만든다 — 문구를 고치면 이미 쌓인 알림까지 함께 바뀌고 표에는 손댈 일이 없다.
// 화면도 서버도 건드리지 않는다.

import type { Notification } from "./contract";

// 종류가 늘면 이 표에 한 줄을 더한다.
const TEXT: Record<string, string> = {
  assignment_updated: "합주일정이 업데이트 되었어요.",
};

export function notificationText(kind: string): string {
  // 서버가 더 나중 판이라 모르는 종류를 보낼 수 있다. 그때 kind 를 그대로 보이면
  // 화면에 개발 용어가 나오므로, 무난한 문장으로 대신한다.
  return TEXT[kind] ?? "새 알림이 있어요.";
}

export function unreadCount(list: Notification[]): number {
  return list.filter((item) => !item.read).length;
}
