import type { Account } from "./contract";

/** 프로필 말풍선에 쓰는 역할 표시. 화면 네 곳(Board·Notices·Profile·Teams)이 같이 쓴다. */
export function roleLabel(role: Account["role"]): string {
  return role === "head_manager" ? "헤드매니저" : "일반멤버";
}
