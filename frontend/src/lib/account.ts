// 지금 로그인한 계정을 두고 화면이 하는 판단과 표시. 서버를 부르지 않는다.

import type { Account, Permission } from "./contract";

/** 프로필 말풍선에 쓰는 역할 표시. 화면 네 곳(Board·Notices·Profile·Teams)이 같이 쓴다. */
export function roleLabel(role: Account["role"]): string {
  return role === "head_manager" ? "헤드매니저" : "일반멤버";
}

/** 항목 열 가지와 그 한국어 이름·설명. 순서는 서버가 고정한 선언 순서 그대로다.
 *  설명은 켜면 무엇을 할 수 있게 되는지를 한 줄로 적는다 — 이름만으로는 "되돌리기"가
 *  무엇을 되돌리는지 알 수 없다. */
export const PERMISSION_ITEMS: readonly {
  key: Permission;
  label: string;
  note: string;
}[] = [
  {
    key: "room_manage",
    label: "합주실 관리",
    note: "합주실을 만들고 여닫는 시각을 고칩니다.",
  },
  {
    key: "period_manage",
    label: "기간 관리",
    note: "상시·집중 기간과 계산이 도는 시각을 정합니다.",
  },
  {
    key: "team_manage",
    label: "팀 관리",
    note: "팀을 만들고 이름을 바꾸며, 자리에 사람을 앉힙니다.",
  },
  {
    key: "member_remove",
    label: "남을 자리에서 빼기",
    note: "다른 사람이 앉은 자리를 비웁니다. 자기 자리는 이 권한 없이도 뺄 수 있습니다.",
  },
  {
    key: "assign_run",
    label: "배정 계산 실행",
    note: "기간의 시간표를 지금 다시 계산합니다.",
  },
  {
    key: "assign_read",
    label: "배정 결과 보기",
    note: "아직 확정되지 않은 조율안과 거기서 빠지는 사람의 이름을 봅니다.",
  },
  {
    key: "proposal_confirm",
    label: "조율안 확정",
    note: "조율안 하나를 골라 시간표로 확정합니다.",
  },
  {
    key: "rollback",
    label: "되돌리기",
    note: "지난 계산 회차 목록을 보고, 시간표를 직전 회차로 되돌립니다.",
  },
  {
    key: "notice_write",
    label: "공지 쓰기",
    note: "모두가 보는 공지사항에 글을 올립니다.",
  },
  {
    key: "permission_grant",
    label: "권한 변경",
    note: "권한을 만들고 사람에게 주거나 뺍니다. 자기 권한도 이 항목으로 다룹니다.",
  },
];

/** me 가 item 을 가졌는지. 아직 못 받아왔거나 응답에 permissions 가 없으면 없는 것으로 본다 —
 *  잠깐 보였다 사라지는 단추보다 처음부터 없는 편이 낫다.
 *  화면이 감추는 것일 뿐 진짜 판정은 서버가 한다. */
export function can(me: Account | null, item: Permission): boolean {
  return me?.permissions?.includes(item) ?? false;
}

/** keys 를 항목 선언 순서로 정렬해 한국어 이름으로 바꾼다. 모르는 이름은 버린다. */
export function permissionLabels(keys: string[]): string[] {
  const chosen = new Set(keys);
  return PERMISSION_ITEMS.filter((item) => chosen.has(item.key)).map((item) => item.label);
}

/** name 을 taken 과 견줘, 비었거나 겹치면 그 사유를 돌려준다.
 *  앞뒤 공백을 뗀 뒤 견주므로 공백만 다른 이름도 겹친 것으로 본다. */
export function permissionSetNameMessage(name: string, taken: string[]): string {
  const trimmed = name.trim();
  if (!trimmed) return "권한 이름을 입력해 주세요.";
  const clash = taken.some((other) => other.trim() === trimmed);
  return clash ? "같은 이름의 권한이 이미 있습니다." : "";
}
