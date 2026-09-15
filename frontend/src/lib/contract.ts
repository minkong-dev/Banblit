// 서버와 주고받는 값의 형태입니다. **선언만 둡니다.** 계산·판단·분기가 들어가면 그때부터
// 기능 코드이고, 기능 코드는 이 파일에 두지 않습니다.
//
// 한 세트만 두는 이유: 화면마다 같은 형태를 따로 적어 두면, 서버가 항목 하나를
// 바꿀 때 어느 화면이 어긋나는지 아무도 모른 채 오류 메시지 없이 깨집니다.
// 서버 쪽 정본입니다: backend/src/backend/api/schemas.py

export type Room = {
  id: number;
  name: string;
  /** "18:00" — 시간대를 포함하지 않습니다. */
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
  /** 전체합주를 지정하지 않은 기간은 null 입니다. */
  ensemble: Ensemble | null;
};

/** 집중 합주기간 안의 전체합주 설정입니다. 이 날짜 범위는 팀별 배정에서 제외됩니다. */
export type Ensemble = {
  starts_on: string;
  ends_on: string;
  room_id: number;
  /** 기본 시각 "19:00" 입니다. days 에 있는 날짜는 그 행의 시각을 따릅니다. */
  starts_at: string;
  ends_at: string;
  days: EnsembleDay[];
};

/** 기본 시각과 다르게 지정한 날짜 하나입니다. */
export type EnsembleDay = { day: string; starts_at: string; ends_at: string };

/** 되돌릴 수 있는 이전 시간표 배정기록 하나입니다. 배정기록을 구분하는 값은 저장 시각입니다. */
export type Backup = {
  /** "2026-09-07T18:03:00" */
  saved_at: string;
  slot_count: number;
};

/** 팀이 가질 수 있는 포지션 종류입니다. 서버 쪽 정본입니다: backend/src/backend/db/models.py의 Instrument */
export type Instrument = "보컬" | "일렉" | "통기타" | "베이스" | "신디" | "드럼";

export const INSTRUMENTS: Instrument[] = [
  "보컬",
  "일렉",
  "통기타",
  "베이스",
  "신디",
  "드럼",
];

/** 자리 수와 배정된 수를 함께 제공합니다. 하나만으로는 빈 자리 수를 계산할 수 없습니다. */
export type Team = {
  id: number;
  name: string;
  /** 팀 색 이름입니다. 서버 쪽 정본은 backend/src/backend/db/models.py 의 TEAM_COLORS 입니다. */
  color: string;
  slot_count: number;
  filled_count: number;
};

/** 사람입니다. 동명이인이 있어서 화면에서는 이름 옆에 기수를 붙여 구분합니다. */
export type Member = { id: number; name: string; cohort: number | null };

/** 팀의 포지션 자리 하나입니다. 사람이 없으면 아직 아무도 배정되지 않은 자리입니다.
 *  배정 쪽 Slot(합주실·시각)과는 다른 개념이므로 이름을 구분합니다. */
export type TeamSlot = {
  id: number;
  team_id: number;
  instrument: Instrument;
  /** 같은 포지션이 1명 이상일 때, "일렉 2" 처럼 포지션에 숫자를 부여해 표시합니다. */
  ordinal: number;
  member_id: number | null;
  member_name: string | null;
  member_cohort: number | null;
};

/** /me가 함께 제공하는, 내가 배정된 자리 하나입니다. 팀 번호 오름차순으로 옵니다. */
export type MyTeam = {
  team_id: number;
  team_name: string;
  instrument: Instrument;
  ordinal: number;
};

/** /me 응답 전체입니다. 현재 로그인한 계정과 그 계정이 배정된 자리 목록입니다. */
export type Me = { account: Account; teams: MyTeam[] };

/** 할 수 있는 일 20가지입니다. 서버 쪽 정본입니다: backend/src/backend/db/models.py의 Permission */
export type Permission =
  | "room_create"
  | "room_edit"
  | "period_create"
  | "period_edit"
  | "period_delete"
  | "team_create"
  | "team_edit"
  | "team_delete"
  | "member_add"
  | "member_remove"
  | "member_expel"
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
  /** 저장된 값이 아니라 permissions 에서 계산한 값입니다. 20가지가 모두 켜져 있으면 head_manager 입니다. */
  role: "head_manager" | "member";
  permissions: Permission[];
  /** 가진 permission set(권한 집합)의 이름입니다. 화면은 "헤드매니저" 고정 문구 대신 이 이름을 역할로 표시합니다. */
  permission_sets: string[];
  /** 기수입니다. 화면이 동명이인을 구분할 때 이름 옆에 붙입니다. */
  cohort: number | null;
};

/** permission set(권한 집합) 하나입니다. members 는 이 permission set 을 가진 멤버 목록이며, 이름까지 서버가 제공합니다.
 *  멤버 목록은 page 단위로 받으므로 화면에서 번호를 이름으로 변환하면 안 됩니다. */
export type PermissionSet = {
  id: number;
  name: string;
  /** 이 permission set 을 어떤 역할의 사람에게 부여하는지 설명하는 문장입니다. 생성할 때 반드시 입력합니다. */
  description: string;
  permissions: Permission[];
  members: { id: number; name: string }[];
};

/** 멤버 목록의 한 줄입니다. 사람을 구분하는 4개 값과 가진 permission set 이름이 함께 옵니다.
 *  서버 쪽 정본입니다: backend/src/backend/api/schemas.py의 MemberRowOut */
export type MemberRow = {
  id: number;
  name: string;
  department: string | null;
  student_no: string | null;
  cohort: number | null;
  permission_sets: string[];
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

/** 글에 첨부된 파일 하나입니다. 실제 파일은 GET /attachments/{id}로 다운로드합니다. */
export type Attachment = {
  id: number;
  post_id: number;
  /** 업로드한 사람이 지정한 파일 이름입니다. 예: "악보.pdf" */
  name: string;
  /** 바이트 단위입니다. 화면에는 fileSizeLabel로 변환하여 표시합니다. */
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
  /** 매일과 매주는 함께 켜질 수 없습니다. 둘 다 거짓이면 그 날 한 번뿐입니다. */
  repeats_daily: boolean;
  repeats_weekly: boolean;
  repeat_until: string | null;
  /** 사람이 기록한 사유입니다. 기록하지 않으면 null입니다. */
  reason: string | null;
  /** 캘린더에 표시할 이름입니다. 비어 있으면 화면이 "불가능 일정"으로 표시합니다. */
  name: string | null;
};

export type Reservation = {
  id: number;
  room_id: number;
  room: string;
  /** team_id가 없으면 개인이 직접 예약한 것입니다. */
  team_id: number | null;
  team: string | null;
  member_id: number;
  member: string;
  /** 예약자가 붙인 이름입니다. 비어 있으면 화면이 팀 이름이나 예약자 이름을 대신 씁니다. */
  name: string | null;
  start: string;
  end: string;
};

/** 화면 알림 하나입니다. 완성된 문구는 포함하지 않습니다. kind 로 화면이 문장을 작성합니다
 *  (lib/notifications.ts). read가 거짓이면 아직 읽지 않은 것입니다. */
export type Notification = {
  id: number;
  kind: "assignment_updated";
  /** "2026-09-14T18:00:00" */
  created_at: string;
  read: boolean;
};
