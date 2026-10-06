// 알림의 표시입니다. 서버는 알림의 종류(kind)와 반려 알림의 재료(대상·시각·사유)만 보내고, 사람이 읽을
// 문장은 이 파일에서 작성합니다. 문구를 수정하면 이미 저장된 알림에도 적용되고 DB 를 수정할 필요가 없습니다.
// 화면이나 서버와 상호작용하지 않습니다.

import { dayWithWeekday } from "./calendar";
import { hhmm } from "./slots";
import type { Notification, RejectTarget } from "./contract";

// 종류가 추가되면 이 표에 한 줄을 추가합니다. rejected 는 재료로 문장을 만들므로 rejectedText 가 씁니다.
const TEXT: Record<string, string> = {
  assignment_updated: "합주 일정이 업데이트 되었어요.",
  reservation_cancelled: "예약이 집중 합주기간과 겹쳐 취소되었어요.",
};

// 반려 대상의 이름입니다. 알림 문장과 반려 사유 modal(components/RejectDialog.tsx)이 같이 씁니다.
// 둘 다 받침으로 끝나 알림 문장에서 뒤에 "이" 를 붙입니다.
export const REJECT_TARGET_LABEL: Record<RejectTarget, string> = {
  reservation: "예약",
  unavailable: "불가능 일정",
};

/** 반려 알림 1개의 문장입니다. 첫 줄은 무엇이 반려되었는지, 둘째 줄은 사유 원문입니다. */
function rejectedText(target: RejectTarget, startsAt: string, reason: string): string {
  const when = `${dayWithWeekday(startsAt.slice(0, 10))} ${hhmm(startsAt)}`;
  return `${when} ${REJECT_TARGET_LABEL[target]}이 반려되었어요. 사유는 다음과 같아요.\n${reason}`;
}

export function notificationText(item: Notification): string {
  if (item.kind === "rejected" && item.target !== null && item.target_starts_at !== null && item.reason !== null) {
    return rejectedText(item.target, item.target_starts_at, item.reason);
  }
  // 서버가 더 최신 버전이라 클라이언트가 인식하지 못하는 종류를 보낼 수 있습니다.
  // 그때 kind 를 그대로 표시하면 화면에 개발 용어가 나오므로, 종류를 특정하지 않는 문장으로 대체합니다.
  return TEXT[item.kind] ?? "새 알림이 있어요.";
}

/** 남아 있는 알림의 개수입니다. 읽음 처리가 행을 삭제하므로 목록에 있는 알림은 전부 읽지 않은
 *  알림입니다(backend/src/backend/services/notification/notification_service.py 의 mark_all_read). */
export function unreadCount(list: Notification[]): number {
  return list.length;
}
