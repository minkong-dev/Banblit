import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { BellIcon } from "./icons";
import { usePopoverRouteClose } from "./hooks";
import { LOADING_TEXT } from "../lib/loading";
import {
  loadNotifications,
  markNotificationsRead,
  notificationText,
  stampLabel,
  unreadCount,
} from "../lib/pipeline";

// 알림 popover 의 id 입니다. 알림 버튼이 popoverTarget 으로 이 판을 엽니다.
const NOTES_POP_ID = "notesPop";

/** 상단바의 알림 아이콘과 그 아래 popover(HTML popover 속성, 바깥 클릭·Escape 로 자동으로 닫히는
 *  브라우저 기본 팝업)입니다. 프로필 메뉴와 같은 구조를 사용하되, 아이콘에는 읽지 않은 알림 개수를 표시합니다.
 *  어느 화면에 있든 배정이 변경되었음을 알 수 있어야 합니다. */
export function NotificationMenu() {
  const [open, setOpen] = useState(false);
  usePopoverRouteClose(NOTES_POP_ID);
  const queryClient = useQueryClient();

  // 이 query(서버 조회)는 항상 현재 로그인한 사람의 알림만 반환합니다.
  // 경로(주소)로는 사람을 구분하지 않고, 인증 cookie(브라우저가 저장해 요청마다 함께 보내는 값)로 확인합니다.
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
      // 읽음 처리 요청이 실패하면 cache(클라이언트 임시 저장소)를 갱신하지 않습니다.
      // refetch(다시 조회)하면 서버의 정확한 상태를 반영합니다.
    }
    void queryClient.invalidateQueries({ queryKey: ["notifications"] });
  }

  let body;
  if (notifications.isPending) {
    body = <p className="quiet">{LOADING_TEXT}</p>;
  } else if (notifications.isError) {
    body = <p className="quiet">알림을 불러오는데 실패했어요</p>;
  } else if (rows.length === 0) {
    body = <p className="quiet">새 알림이 없어요</p>;
  } else {
    body = (
      <ul>
        {rows.map((item) => (
          // 목록에 있는 알림은 전부 읽지 않은 알림입니다. 읽음 처리가 행을 삭제합니다.
          <li key={item.id} className="note unread">
            {/* 비어 있는 span 의 aria-label 은 스크린 리더가 읽지 않습니다.
                role="img" 를 붙여야 색깔로만 표시하는 상태를 음성으로도 전달합니다. */}
            <span className="new" role="img" aria-label="안 읽음" />
            <b>{notificationText(item)}</b>
            <small>{stampLabel(item.created_at)}</small>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="notes">
      <button
        className="ic bell"
        aria-expanded={open}
        aria-label={unread === 0 ? "알림" : `알림, 안 읽음 ${unread}개`}
        popoverTarget={NOTES_POP_ID}
      >
        <BellIcon />
        {unread === 0 ? null : (
          <span className="count" aria-hidden="true">{unread > 99 ? "99+" : unread}</span>
        )}
      </button>

      <div
        id={NOTES_POP_ID}
        popover="auto"
        className="notepop"
        role="dialog"
        aria-label="알림"
        onToggle={(event) => setOpen(event.newState === "open")}
      >
        <div className="nhead">
          <b>알림</b>
          {unread === 0 ? null : (
            <button className="readall" onClick={() => void readAll()}>모두 읽음</button>
          )}
        </div>
        {body}
      </div>
    </div>
  );
}
