// 알림의 표시입니다. 서버는 무슨 일이 있었는지(kind)만 보내고, 사람이 읽을 문장은 여기서
// 작성합니다 — 문구를 고치면 이미 쌓인 알림까지 함께 바뀌고 db에는 손댈 일이 없습니다.
// 화면이나 서버와 상호작용하지 않습니다.

import type { Notification } from "./contract";

// 종류가 추가되면 이 표에 한 줄을 추가합니다.
const TEXT: Record<string, string> = {
  assignment_updated: "합주 일정이 업데이트 되었어요.",
};

export function notificationText(kind: string): string {
  // 서버가 더 최신 버전이라 클라이언트가 인식하지 못하는 종류를 보낼 수 있습니다.
  // 그때 kind를 그대로 표시하면 화면에 개발 용어가 나오므로, 무난한 문장으로 대체합니다.
  return TEXT[kind] ?? "새 알림이 있어요.";
}

export function unreadCount(list: Notification[]): number {
  return list.filter((item) => !item.read).length;
}
