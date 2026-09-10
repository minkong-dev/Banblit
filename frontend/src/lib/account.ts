// 지금 로그인한 계정을 두고 화면이 하는 판단과 표시. 서버를 부르지 않는다.

import type { Account, Permission } from "./contract";

/** 프로필 말풍선에 쓰는 역할 표시. 화면 네 곳(Board·Notices·Profile·Teams)이 같이 쓴다. */
export function roleLabel(role: Account["role"]): string {
  return role === "head_manager" ? "헤드매니저" : "일반멤버";
}

/** 항목 열여덟 가지와 그 한국어 이름·설명. 순서는 서버가 고정한 선언 순서 그대로다.
 *  설명은 켜면 무엇을 할 수 있게 되는지를 한 줄로 적는다 — 이름만으로는 "되돌리기"가
 *  무엇을 되돌리는지 알 수 없다. */
export const PERMISSION_ITEMS: readonly {
  key: Permission;
  label: string;
  note: string;
}[] = [
  {
    key: "room_create",
    label: "합주실 추가",
    note: "새 합주실을 추가할 수 있어요.",
  },
  {
    key: "room_edit",
    label: "합주실 정보 수정",
    note: "합주실 이름과 개방 및 마감시간을 수정할 수 있어요.",
  },
  {
    key: "period_create",
    label: "집중합주 기간 추가",
    note: "집중 합주기간을 새로 추가할 수 있어요.",
  },
  {
    key: "period_edit",
    label: "스케줄링 시간 설정",
    note: "스케줄링 엔진이 연산을 진행하는 시간을 설정할 수 있어요.",
  },
  {
    key: "team_create",
    label: "팀 생성",
    note: "새 팀을 추가하고 인원을 배정할 수 있어요.",
  },
  {
    key: "team_edit",
    label: "팀 수정",
    note: "팀 정보를 수정할 수 있어요.",
  },
  {
    key: "team_delete",
    label: "팀 삭제",
    note: "생성한 팀을 삭제할 수 있어요.",
  },
  {
    key: "member_add",
    label: "포지션별 인원 배치",
    note: "팀의 구성된 포지션에 인원을 배치할 수 있어요.",
  },
  {
    key: "member_remove",
    label: "포지션 배치 인원 제외",
    note: "본인을 포함해 포지션에 이미 배치된 멤버를 해제할 수 있어요.",
  },
  {
    key: "notice_write",
    label: "공지사항 작성",
    note: "전체 공개인 공지사항을 작성할 수 있어요.",
  },
  {
    key: "board_moderate",
    label: "타 멤버 글 수정 및 삭제",
    note: "본인의 글은 기본적으로 수정 및 삭제가 가능하고, 이 권한이 있다면 타 멤버의 글도 수정 및 삭제가 가능해요.",
  },
  {
    key: "reservation_manage",
    label: "타 멤버 예약 수정 및 취소",
    note: "본인의 예약은 기본적으로 수정 및 삭제가 가능하고, 이 권한이 있다면 타 멤버의 예약을 수정하거나 취소가 가능해요.",
  },
  {
    key: "assign_run",
    label: "스케줄링",
    note: "집중합주 기간 배정안을 수동으로 생성할 수 있어요.",
  },
  {
    key: "assign_read",
    label: "배정안 메뉴 확인",
    note: "확정되지 않은 배정안 후보를 조회할 수 있어요.",
  },
  {
    key: "proposal_confirm",
    label: "배정안 확정",
    note: "제안된 배정안을 확정하여 메인캘린더에 반영할 수 있어요.",
  },
  {
    key: "rollback",
    label: "되돌리기",
    note: "이전 배정기록을 선택하고, 해당 배정기록을 메인캘린더에 표시할 수 있어요.",
  },
  {
    key: "permission_manage",
    label: "권한 관리",
    note: "권한의 생성, 수정, 삭제가 가능해요.",
  },
  {
    key: "permission_grant",
    label: "권한 부여 및 제거",
    note: "생성한 권한을 타 멤버에게 부여하거나 제거할 수 있어요.",
  },
];

/** me 가 item 을 가졌는지. 아직 못 받아왔거나 응답에 permissions 가 없으면 없는 것으로 본다 —
 *  잠깐 보였다 사라지는 단추보다 처음부터 없는 편이 낫다.
 *  화면이 감추는 것일 뿐 진짜 판정은 서버가 한다. */
export function can(me: Account | null, item: Permission): boolean {
  return me?.permissions?.includes(item) ?? false;
}
