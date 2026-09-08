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

/** 되돌릴 수 있는 이전 시간표 회차 하나. 회차를 가르는 값은 저장 시각이다. */
export type Backup = {
  /** "2026-09-07T18:03:00" */
  saved_at: string;
  slot_count: number;
};

/** 팀이 가질 수 있는 악기. 서버 쪽 정본은 backend/src/backend/db/models.py 의 Instrument 다. */
export type Instrument = "보컬" | "일렉" | "통기타" | "베이스" | "신디" | "드럼";

export const INSTRUMENTS: Instrument[] = [
  "보컬",
  "일렉",
  "통기타",
  "베이스",
  "신디",
  "드럼",
];

/** 자리 수와 앉은 수를 함께 준다 — 하나만으로는 몇 자리 비었는지 알 수 없다. */
export type Team = {
  id: number;
  name: string;
  slot_count: number;
  filled_count: number;
};

/** 사람. 동명이인이 있어 화면에서는 이름 옆에 기수를 붙여 가른다. */
export type Member = { id: number; name: string; cohort: number | null };

/** 팀의 악기 자리 하나. 사람이 없으면 아직 아무도 안 앉은 자리다.
 *  배정 쪽 Slot(합주실·시각)과는 다른 것이라 이름을 나눈다. */
export type TeamSlot = {
  id: number;
  team_id: number;
  instrument: Instrument;
  /** 같은 악기가 여럿일 때 몇 번째인지. 화면은 "일렉 2" 처럼 붙여 보여준다. */
  ordinal: number;
  member_id: number | null;
  member_name: string | null;
  member_cohort: number | null;
};

/** /me 가 함께 주는, 내가 앉아 있는 자리 하나. 팀 번호 오름차순으로 온다. */
export type MyTeam = {
  team_id: number;
  team_name: string;
  instrument: Instrument;
  ordinal: number;
};

/** /me 응답 전체 — 지금 로그인한 계정과 그 계정이 앉아 있는 자리들. */
export type Me = { account: Account; teams: MyTeam[] };

/** 할 수 있는 일 열한 가지. 서버 쪽 정본은 backend/src/backend/db/models.py 의 Permission 이다. */
export type Permission =
  | "room_create"
  | "room_edit"
  | "period_create"
  | "period_edit"
  | "team_create"
  | "team_edit"
  | "team_delete"
  | "member_add"
  | "member_remove"
  | "notice_write"
  | "board_moderate"
  | "reservation_manage"
  | "assign_run"
  | "assign_read"
  | "proposal_confirm"
  | "rollback"
  | "permission_manage"
  | "permission_grant";

export type Account = {
  id: number;
  name: string;
  email: string;
  /** 저장된 값이 아니라 permissions 에서 뽑아낸 값이다 — 열한 가지가 전부 켜져 있으면 head_manager. */
  role: "head_manager" | "member";
  permissions: Permission[];
  /** 기수. 화면이 동명이인을 가를 때 이름 옆에 붙인다. */
  cohort: number | null;
};

/** 이름 붙인 권한 하나. member_ids 는 이 권한을 가진 사람들이다. */
export type PermissionSet = {
  id: number;
  name: string;
  permissions: Permission[];
  member_ids: number[];
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

/** 글에 붙은 파일 하나. 실제 파일은 GET /attachments/{id} 로 내려받는다. */
export type Attachment = {
  id: number;
  post_id: number;
  /** 올린 사람이 쓰던 이름 — "악보.pdf" */
  name: string;
  /** 바이트. 화면에는 fileSizeLabel 로 바꿔 보여준다. */
  size: number;
  content_type: string;
  uploaded_at: string;
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

/** 화면 안 알림 하나. 완성된 문구는 담기지 않는다 — kind 로 화면이 문장을 만든다
 *  (lib/notifications.ts). read 가 거짓이면 아직 안 읽은 것이다. */
export type Notification = {
  id: number;
  kind: "assignment_updated";
  /** "2026-09-14T18:00:00" */
  created_at: string;
  read: boolean;
};
