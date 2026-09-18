// 현재 로그인한 계정과 관련하여 화면이 하는 판단과 표시입니다. 서버를 호출하지 않습니다.

import type { Account, Permission } from "./contract";

/** 프로필 카드에 표시하는 역할 이름입니다. 가진 permission set(권한 집합)의 이름을 ", " 로 이어 표시하고,
 *  하나도 없으면 "일반멤버", 아직 계정을 받지 못했으면 빈 문자열을 반환합니다. */
export function roleLabel(me: Account | null): string {
  if (!me) return "";
  const names = me.permission_sets ?? [];
  return names.length === 0 ? "일반멤버" : names.join(", ");
}

/** 항목 20개와 그 한국어 이름·설명입니다. 순서는 서버가 고정한 선언 순서 그대로입니다.
 *  설명은 권한을 켜면 무엇을 할 수 있게 되는지를 한 줄로 적습니다.
 *  예를 들어 이름만으로는 "되돌리기"가 무엇을 되돌리는지 명확하지 않기 때문입니다. */
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
    key: "period_delete",
    label: "집중합주 기간 삭제",
    note: "집중합주 기간을 삭제할 수 있어요. 그 기간의 배정 결과와 이전 배정기록도 함께 삭제돼요.",
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
    key: "member_expel",
    label: "멤버 추방",
    note: "멤버의 계정을 삭제해 서비스에서 내보낼 수 있어요. 글·댓글·예약도 함께 삭제돼요.",
  },
  {
    key: "notice_write",
    label: "공지사항 작성",
    note: "전체 공개인 공지사항을 작성할 수 있어요.",
  },
  {
    key: "board_moderate",
    label: "타 멤버 글 삭제 및 블라인드",
    note: "본인의 글은 기본적으로 수정 및 삭제가 가능하고, 이 권한이 있다면 타 멤버의 글을 삭제하거나 블라인드할 수 있어요. 타 멤버의 글 내용은 이 권한으로도 수정할 수 없어요.",
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

/** me 가 item 권한을 가졌는지 판정합니다. 아직 조회하지 못했거나 응답에 permissions 가 없으면 없다고 판정합니다.
 *  잠깐 표시되었다 사라지는 버튼보다 처음부터 없는 편이 낫습니다.
 *  화면이 버튼을 감추는 것일 뿐 실제 권한 판정은 서버가 합니다. */
export function can(me: Account | null, item: Permission): boolean {
  return me?.permissions?.includes(item) ?? false;
}

/** 팀 생성·수정·삭제 권한 중 하나라도 있으면 true 를 반환합니다. 사이드바 팀 메뉴 이름과 팀 목록 범위가 이 값을 따릅니다. */
export function canManageTeams(me: Account | null): boolean {
  return (["team_create", "team_edit", "team_delete"] as const).some((item) => can(me, item));
}

/** 사이드바의 팀 메뉴 이름입니다. canManageTeams 가 true 이면 "팀 관리", false 이면 "내 팀"입니다. */
export function teamNavLabel(me: Account | null): string {
  return canManageTeams(me) ? "팀 관리" : "내 팀";
}
