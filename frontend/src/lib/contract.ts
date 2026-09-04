// 서버와 주고받는 값의 모양. **선언만 둔다** — 계산·판단·분기가 들어가면 그때부터
// 기능 코드이고, 기능 코드는 여기 두지 않는다.
//
// 한 세트만 두는 이유: 화면마다 같은 모양을 따로 적어 두면, 서버가 항목 하나를
// 바꿀 때 어느 화면이 어긋나는지 아무도 모른 채 조용히 깨진다.
// 서버 쪽 정본은 backend/src/backend/api/schemas.py 다.

export type Room = {
  id: number;
  name: string;
  /** "18:00" — 시간대를 붙이지 않는다. */
  opens_at: string;
  closes_at: string;
};

export type Period = {
  id: number;
  kind: "open" | "focused";
  /** "2026-09-14" */
  starts_on: string;
  ends_on: string;
  everyday: boolean;
  first_run_at: string;
  second_run_at: string;
};

export type Team = { id: number; name: string; member_count: number };

export type Member = { id: number; name: string; positions: string[] };

export type Position = { id: number; name: string };

export type Membership = {
  member_id: number;
  member_name: string;
  team_id: number;
  position: string;
};

export type Account = {
  id: number;
  name: string;
  email: string;
  role: "head_manager" | "member";
  positions: string[];
};

export type ScheduleRow = {
  team_id: number;
  team: string;
  room_id: number;
  room: string;
  /** "2026-09-14T18:00:00" */
  start: string;
  end: string;
};

export type Slot = { room_id: number; room: string; start: string; end: string };

export type AssignmentOut = { feasible: boolean; slots_by_team: Record<string, Slot[]> };

export type AssignOut = {
  saved: boolean;
  assignment: AssignmentOut;
  proposals: { excluded_member: { id: number; name: string }; assignment: AssignmentOut }[];
};

export type Post = {
  id: number;
  team_id: number | null;
  title: string;
  body: string;
  author_id: number;
  author: string;
  created_at: string;
  comment_count: number;
};

export type PostComment = {
  id: number;
  post_id: number;
  body: string;
  author_id: number;
  author: string;
  created_at: string;
};

export type Unavailable = {
  id: number;
  member_id: number;
  /** "2026-09-14T18:00:00" */
  starts_at: string;
  ends_at: string;
  repeats_weekly: boolean;
  repeat_until: string | null;
};

export type Reservation = {
  id: number;
  room_id: number;
  room: string;
  /** team_id 가 없으면 개인이 직접 잡은 예약이다. */
  team_id: number | null;
  team: string | null;
  member_id: number;
  member: string;
  start: string;
  end: string;
};
