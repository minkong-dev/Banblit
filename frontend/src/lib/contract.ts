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

/** 팀 참가를 받는 방식 — 바로 소속이 되는 자동 승인, 사람이 확인하는 직접 승인. */
export type JoinPolicy = "auto" | "approval";

/** 참가 요청이 놓인 자리 — 소속이 된 것과 승인을 기다리는 것. */
export type JoinStatus = "approved" | "pending";

export type Team = { id: number; name: string; member_count: number; join_policy: JoinPolicy };

export type Member = { id: number; name: string; positions: string[] };

export type Position = { id: number; name: string };

export type Membership = {
  member_id: number;
  member_name: string;
  team_id: number;
  position: string;
  status: JoinStatus;
};

/** /me 가 함께 주는 내 소속 하나. 승인된 것과 기다리는 것이 status 로 갈린다.
 *  팀 번호 오름차순으로 온다. */
export type MyMembership = {
  team_id: number;
  team_name: string;
  position: string;
  status: JoinStatus;
};

/** /me 응답 전체 — 지금 로그인한 계정과 그 계정의 소속·신청. */
export type Me = { account: Account; memberships: MyMembership[] };

/** 승인을 기다리는 참가 신청 하나. 화면에는 번호가 아니라 이름과 포지션이 나온다. */
export type JoinRequest = {
  member_id: number;
  member_name: string;
  position: string;
};

/** 할 수 있는 일 열한 가지. 서버 쪽 정본은 backend/src/backend/db/models.py 의 Permission 이다. */
export type Permission =
  | "room_manage"
  | "period_manage"
  | "team_manage"
  | "member_remove"
  | "join_approve"
  | "assign_run"
  | "assign_read"
  | "proposal_confirm"
  | "rollback"
  | "notice_write"
  | "permission_grant";

export type Account = {
  id: number;
  name: string;
  email: string;
  /** 저장된 값이 아니라 permissions 에서 뽑아낸 값이다 — 열한 가지가 전부 켜져 있으면 head_manager. */
  role: "head_manager" | "member";
  permissions: Permission[];
  positions: string[];
};

/** 켜진 항목을 한 벌로 묶은 것. member_ids 는 이 묶음을 가진 사람들이다. */
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
