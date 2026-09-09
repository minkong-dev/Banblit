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

/** 상단바의 알림 종과 그 아래 말풍선. 프로필 말풍선과 같은 언어를 쓰되, 종에는
 *  안 읽은 개수를 얹는다 — 어느 화면에 있든 시간표가 바뀐 것을 알 수 있어야 한다. */
export function NotificationMenu() {
  // 말풍선 바깥을 누르면 닫는다 — 목록이 길어 화면을 많이 덮으므로, 닫을 길이
  // 종 하나뿐이면 갇힌 느낌이 든다.
  const { open, toggle, box } = useDismissible();
  const queryClient = useQueryClient();

  // 알림은 언제나 내 것만 온다 — 어느 사람의 것인지는 주소가 아니라 인증 쿠키가 정한다.
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
      // 읽음 표시가 실패해도 목록은 그대로 둔다. 다시 받아 오면 안 읽은 채로 나온다.
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
            {/* 빈 span 의 aria-label 은 읽히지 않는다. role="img" 를 붙여야
                빛깔로만 알리는 점을 소리로도 읽어 준다. */}
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
