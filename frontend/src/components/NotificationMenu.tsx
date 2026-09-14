import { useQuery, useQueryClient } from "@tanstack/react-query";

import { BellIcon } from "./icons";
import { useDismissible } from "./hooks";
import {
  loadNotifications,
  markNotificationsRead,
  notificationText,
  stampLabel,
  unreadCount,
} from "../lib/pipeline";

/** 상단바의 알림 종(bell icon)과 그 아래 popover(팝업 메뉴). 프로필 메뉴와 같은 구조를 쓰되,
 *  종에는 안 읽은 알림 개수를 표시합니다 — 어느 화면에 있든 배정이 바뀌었음을 알 수 있어야 합니다. */
export function NotificationMenu() {
  // popover 바깥을 누르면 닫습니다. 목록이 길어 화면의 많은 부분을 차지하므로,
  // 종만으로는 닫기 어려워 UX 가 갇힌 느낌이 될 수 있습니다.
  const { open, toggle, box } = useDismissible();
  const queryClient = useQueryClient();

  // 이 query(서버 조회)는 항상 현재 로그인한 사람의 알림만 반환합니다.
  // 경로(주소)로는 사람을 구분하지 않고, 인증 cookie(웹 저장소)로 확인합니다.
  const notifications = useQuery({
    queryKey: ["notifications"],
    queryFn: loadNotifications,
  });
  const rows = notifications.data ?? [];
  const unread = unreadCount(rows);

  async function readAll(): Promise<void> {
    try {
      await markNotificationsRead();
    } catch {
      // 마크 요청이 실패해도 cache(클라이언트 임시 저장소)는 갱신하지 않습니다.
      // refetch(다시 조회)하면 서버의 정확한 상태를 반영합니다.
    }
    void queryClient.invalidateQueries({ queryKey: ["notifications"] });
  }

  let body;
  if (notifications.isPending) {
    body = <p className="quiet">알림을 불러오는 중이에요</p>;
  } else if (notifications.isError) {
    body = <p className="quiet">알림을 불러오는데 실패했어요</p>;
  } else if (rows.length === 0) {
    body = <p className="quiet">새 알림이 없어요</p>;
  } else {
    body = (
      <ul>
        {rows.map((item) => (
          <li key={item.id} className={item.read ? "note" : "note unread"}>
            {/* 비어 있는 span 의 aria-label 은 스크린 리더가 읽지 않습니다.
                role="img" 를 붙여야 색깔로만 표시하는 상태를 음성으로도 전달합니다. */}
            {item.read ? null : <span className="new" role="img" aria-label="안 읽음" />}
            <b>{notificationText(item.kind)}</b>
            <small>{stampLabel(item.created_at)}</small>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="notes" ref={box}>
      <button
        className="ic bell"
        aria-expanded={open}
        aria-label={unread === 0 ? "알림" : `알림 · 안 읽음 ${unread}개`}
        onClick={toggle}
      >
        <BellIcon />
        {unread === 0 ? null : (
          <span className="count" aria-hidden="true">{unread > 99 ? "99+" : unread}</span>
        )}
      </button>

      <div className={open ? "notepop on" : "notepop"} role="dialog" aria-label="알림">
        <div className="nhead">
          <b>알림</b>
          {unread === 0 ? null : (
            <button className="readall" onClick={() => void readAll()}>모두 읽음으로 표시</button>
          )}
        </div>
        {body}
      </div>
    </div>
  );
}
