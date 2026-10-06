// 사이드바의 관리자 메뉴 항목입니다. 주소·이름·필요 권한을 한 곳에 모읍니다.
//
// 세 곳이 같은 목록을 봅니다 — 사이드바(components/AppShell.tsx)가 항목을 그리고,
// 주소 표(App.tsx)가 항목마다 route 를 만들며, 화면(routes/Settings.tsx)이 권한을 확인합니다.
// 목록이 흩어져 있으면 항목을 추가할 때 세 곳 중 한 곳을 빠뜨립니다.
//
// 2026-10-05 에 설정 화면의 탭을 이 목록으로 옮겼습니다. 탭을 거쳐야 닿는 구조라 구역을 주소로
// 바로 열 수 없었고, 사이드바의 "설정" 1개 뒤에 무엇이 있는지 보이지 않았습니다.
// 자기 계정에 대한 설정은 권한이 필요 없으므로 이 목록이 아니라 프로필 화면(/profile)에 있습니다.

import type { Permission } from "./contract";

/** 관리자 메뉴 항목 1개가 담당하는 구역입니다. routes/Settings.tsx 가 이 값으로 무엇을 그릴지 정합니다. */
export type AdminSection =
  | "rooms"
  | "periods"
  | "members"
  | "reservations"
  | "blinded"
  | "unavailable";

export type AdminMenuItem = {
  key: AdminSection;
  label: string;
  to: string;
  /** 이 중 1개라도 가지면 항목이 표시됩니다. 생성만 할 수 있고 수정할 수 없는 사람도 목록은 봐야 합니다. */
  needs: readonly Permission[];
};

export const ADMIN_MENU: readonly AdminMenuItem[] = [
  { key: "rooms", label: "합주실", to: "/rooms", needs: ["room_create", "room_edit", "room_delete"] },
  { key: "periods", label: "기간", to: "/periods", needs: ["period_create", "period_edit", "period_delete"] },
  { key: "members", label: "멤버", to: "/members", needs: ["permission_manage", "permission_grant"] },
  { key: "reservations", label: "예약", to: "/reservations", needs: ["reservation_manage"] },
  { key: "blinded", label: "블라인드", to: "/blinded", needs: ["board_moderate"] },
  { key: "unavailable", label: "불가능 일정", to: "/unavailable", needs: ["unavailable_read"] },
];
