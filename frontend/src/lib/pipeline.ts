// lib 모듈의 시퀀스 파일입니다. 어느 검증을 어느 순서로 호출할지 이 파일에서 정합니다.

import { getJSON, sendFile } from "./api";
import type { Account, Me, Member, Notification, Reservation, Unavailable } from "./contract";
import {
  dayKey,
  datesBetween,
  dayLabel,
  dayWithWeekday,
  focusedRange,
  hoursLabel,
  isRangeFree,
  monthCells,
  roomBounds,
  slotCountOf,
  slotLabel,
  stampLabel,
  takenGrid,
  WEEKDAY_NAMES,
  weekKeys,
} from "./calendar";
import {
  capacity,
  dateRangeMessage,
  openHoursMessage,
  roomNameMessage,
} from "./settings";
import { awaitJob } from "./jobs";
import type { Job } from "./jobs";
import type { Capacity } from "./settings";
import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_HINT,
  attachmentMessage,
  boardActions,
  bodyMessage,
  commentMessage,
  fileSizeLabel,
  titleMessage,
} from "./boards";
import {
  colorKey,
  memberLabel,
  myTeamIds,
  slotCountsMessage,
  slotName,
  teamNameMessage,
} from "./roster";

export type RoomForm = { name: string; opens_at: string; closes_at: string };
export type PeriodForm = { starts_on: string; ends_on: string };

export function checkRoom(form: RoomForm, taken: string[], slotMinutes: number): string {
  // 이름을 먼저 검증합니다. 이름이 비었거나 겹치면 시각이 유효해도 저장할 수 없고,
  // 오류 메시지를 한 번에 하나만 표시하므로 먼저 수정할 것을 앞에 둡니다.
  const name = roomNameMessage(form.name, taken);
  if (name !== "") return name;

  // 여는 시각과 닫는 시각은 한 쌍으로만 검증합니다. 정시 격자를 벗어났는지와
  // 순서가 뒤집혔는지를 따로 검증하면 둘 다 위반했을 때 오류 메시지가 2번에 나뉘어 표시됩니다.
  return openHoursMessage(form.opens_at, form.closes_at, slotMinutes);
}

/** 서버에 보낼 기간 값입니다. 매일이 켜진 집중 합주기간은 종료일이 없으므로(사용자 결정 2026-09-11)
 *  화면이 감춘 종료일 대신 시작일을 종료일로 보냅니다. 서버는 ends_on 을 필수로 받고 everyday 면 무시합니다. */
export function periodBody<T extends PeriodForm & { kind?: string; everyday?: boolean }>(form: T): T {
  if (form.kind === "focused" && form.everyday) {
    return { ...form, ends_on: form.starts_on };
  }
  return form;
}

export function checkPeriod(form: PeriodForm): string {
  // 기간은 시작일과 종료일 2개를 검증합니다. 종류와 계산 시각은 선택 옵션이라 검증할 항목이 없습니다.
  const body = periodBody(form);
  return dateRangeMessage(body.starts_on, body.ends_on);
}

export type Opening = { rooms: RoomForm[]; days: number; teams: number };

export function openingHours(input: Opening): {
  perDay: string;
  total: string;
  perTeam: string;
  leftover: string;
  raw: Capacity;
} {
  // capacity()로 slot(1시간 단위 시간 칸)의 개수를 먼저 계산하고, 그 개수를 hoursLabel()로 시간 문자열로 변환합니다.
  // 순서가 반대일 수 없습니다. 화면은 slot 개수를 그대로 표시하지 않습니다.
  const raw = capacity(input);
  return {
    perDay: hoursLabel(raw.perDay),
    total: hoursLabel(raw.total),
    perTeam: hoursLabel(raw.perTeam),
    leftover: hoursLabel(raw.leftover),
    raw,
  };
}

export function daysBetween(from: string, to: string): number {
  // datesBetween()이 시작일과 종료일을 포함해 날짜를 연결합니다. 그 개수가 곧 기간의 날수입니다.
  return datesBetween(from, to).length;
}

// 스케줄러 화면이 사용하는 계산입니다. 합주실과 기간 사이에 순서 의존이 없어 그대로 export 합니다.
// roomBounds()는 달력의 여닫는 시각을, focusedRange()는 자동 배정 띠의 날짜 범위를 반환합니다.
export { focusedRange, roomBounds };

export type PostForm = { title: string; body: string };

export { commentMessage as checkComment };

export function checkPost(form: PostForm): string {
  // 제목을 먼저 검증합니다. 오류 메시지를 한 번에 하나만 표시하므로 먼저 수정할 것을 앞에 둡니다.
  const title = titleMessage(form.title);
  return title !== "" ? title : bodyMessage(form.body);
}


/** 선택한 파일을 앞에서부터 검증해, 처음 위반한 파일의 이름과 오류 메시지를 반환합니다. */
export function checkAttachments(files: { name: string; size: number }[]): string {
  // 전송 전에 이 함수에서 한 번 검증합니다. 서버도 같은 검증을 다시 수행하므로 이 검증은
  // 사용자가 즉시 알 수 있게 하는 것이지 보안 검증이 아닙니다. 브라우저에서 실행하는
  // 검증은 사용자가 건너뛸 수 있습니다.
  // 오류 메시지를 한 번에 하나만 표시하므로, 2개 이상 위반해도 첫 번째 파일만 알립니다.
  for (const file of files) {
    const why = attachmentMessage(file.name, file.size);
    if (why !== "") return `${file.name}: ${why}`;
  }
  return "";
}

// 팀·포지션에 대해 화면이 하는 계산입니다. 순서 의존이 없어 그대로 export 합니다.
export { colorKey, memberLabel, myTeamIds, slotName };
export { teamNameMessage as checkTeamName, slotCountsMessage as checkSlotCounts };

// 게시판·공지 화면이 사용하는 계산입니다. fileSizeLabel 은 순서 의존이 없어 그대로 export 합니다.
export { ATTACHMENT_ACCEPT, ATTACHMENT_HINT, boardActions, fileSizeLabel };


export type AssignBody = { team_ids: number[]; room_ids: number[] };

export async function runAssignment<T>(
  periodId: number,
  body: AssignBody,
  /** 조율안을 선택했으면 그 안에서 제외할 멤버의 번호입니다. 그 멤버를 제외하고 다시 계산해 저장합니다. */
  excludeMemberId?: number,
): Promise<T> {
  // 접수(POST 요청)가 먼저입니다. 서버는 계산을 기다리지 않고 job(서버가 접수해 백그라운드에서 실행하는 계산 하나) 번호만 반환합니다. 그 번호로
  // awaitJob()이 완료될 때까지 다시 조회합니다. 순서가 반대일 수 없고, 접수 응답을 결과로 사용하면
  // 계산이 시작되지도 않은 값을 화면에 표시하게 됩니다.
  const path = excludeMemberId === undefined
    ? `/periods/${periodId}/assign`
    : `/periods/${periodId}/proposals/${excludeMemberId}/confirm`;
  const accepted = await getJSON<{ job: Job<T> }>(path, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return awaitJob<T>(
    accepted.job.id,
    (id) => getJSON<{ job: Job<T> }>(`/jobs/${id}`),
    (ms) => new Promise((done) => setTimeout(done, ms)),
    () => Date.now(),
  );
}

export async function loadUnavailable(memberId: number): Promise<Unavailable[]> {
  const body = await getJSON<{ times: Unavailable[] }>(`/members/${memberId}/unavailable`);
  return body.times;
}

/** 반복 주기입니다. "none"이면 해당 날 한 번뿐입니다. */
export type RepeatCycle = "none" | "daily" | "weekly";

export async function addUnavailable(
  memberId: number,
  startsAt: string,
  endsAt: string,
  repeat: RepeatCycle,
  reason: string,
): Promise<Unavailable> {
  // repeat_until은 전송하지 않습니다. 서버는 반복이 비활성화되어 있으면 repeat_until을 수신할 때 거절하고, 활성화되어 있으면 기간의 끝까지로 자동 설정합니다.
  // ponytail: 반복 종료일을 사용자가 직접 입력하는 UI 는 없습니다. 필요해지면 화면에 날짜
  // 하나를 더 입력받아 repeat_until으로 함께 전송합니다.
  const body = await getJSON<{ time: Unavailable }>(`/members/${memberId}/unavailable`, {
    method: "POST",
    body: JSON.stringify({
      starts_at: startsAt,
      ends_at: endsAt,
      repeats_daily: repeat === "daily",
      repeats_weekly: repeat === "weekly",
      reason: reason.trim() === "" ? null : reason.trim(),
    }),
  });
  return body.time;
}

/** 여러 개의 합주실에서 예약을 한 번에 조회하고, 실패한 합주실은 오류 메시지만 수집합니다. loadRows(Scheduler)와 같은 구조입니다. */
export async function loadReservationRows(
  roomIds: number[], from: string, to: string,
): Promise<{ rows: Reservation[]; failures: string[] }> {
  const rows: Reservation[] = [];
  const failures: string[] = [];
  for (const roomId of roomIds) {
    try {
      const body = await getJSON<{ reservations: Reservation[] }>(
        `/rooms/${roomId}/reservations?from=${from}&to=${to}`,
      );
      rows.push(...body.reservations);
    } catch (error) {
      failures.push(`합주실 ${roomId}: ${error instanceof Error ? error.message : "알 수 없는 오류"}`);
    }
  }
  return { rows, failures };
}

export type ReservationForm = {
  room_id: number;
  team_id: number | null;
  starts_at: string;
  ends_at: string;
};

/** 예약 한 건을 취소합니다. 서버가 구간 한 행으로 들고 있어 요청도 한 번입니다. */
export async function cancelBooking(reservationId: number): Promise<void> {
  await getJSON(`/reservations/${reservationId}`, { method: "DELETE" });
}

/** 자신이 등록한 불가능 일정 하나를 삭제합니다. 다른 사용자의 일정은 서버가 없는 일정과 같게 거절합니다. */
export async function removeUnavailable(memberId: number, timeId: number): Promise<void> {
  await getJSON(`/members/${memberId}/unavailable/${timeId}`, { method: "DELETE" });
}

/** 멤버를 추방합니다. 서버는 계정을 삭제하므로 그 멤버의 글·댓글·예약도 함께 삭제됩니다(사용자 결정 2026-09-14). member_expel 권한이 필요합니다. */
export async function expelMember(memberId: number): Promise<void> {
  await getJSON(`/members/${memberId}`, { method: "DELETE" });
}

export async function addReservation(form: ReservationForm): Promise<Reservation[]> {
  const body = await getJSON<{ reservations: Reservation[] }>("/reservations", {
    method: "POST",
    body: JSON.stringify(form),
  });
  return body.reservations;
}

// 아래는 화면이 직접 사용하는 함수입니다. 순서 의존이 없어 그대로 export 하지만, 화면이
// 기능 파일을 직접 참조하지 않도록 호출 지점을 이 파일 하나로 모읍니다.
export {
  dayOf,
  hhmm,
  isoAt,
  mergeSessions,
  slotIndex,
  upcomingBookings,
} from "./slots";
export type { Booking, Session } from "./slots";
export { dayKey, datesBetween, isRangeFree, monthCells, slotCountOf, slotLabel, takenGrid, weekKeys };
export { dayLabel, dayWithWeekday, stampLabel, WEEKDAY_NAMES };
export { hoursLabel };
export {
  cohortMessage,
  emailMessage,
  passwordMessage,
  signupPasswordMessage,
  strongPasswordMessage,
  studentNoMessage,
} from "./validate";

export type SignUpForm = {
  name: string;
  // 멤버를 구분하는 값의 일부입니다. 이름·학과·학번·기수 4개 항목이 모두 같아야 같은 멤버입니다.
  department: string;
  student_no: string;
  email: string;
  password: string;
  cohort: number;
};

export async function signUp(form: SignUpForm): Promise<Account> {
  // 가입 성공 응답은 계정만 포함합니다. session 은 서버가 httpOnly cookie(banblit_session)로
  // 전송하고, 화면은 그 값을 읽거나 수정하지 않습니다.
  const { account } = await getJSON<{ account: Account }>("/signup", {
    method: "POST",
    body: JSON.stringify(form),
  });
  return account;
}

export async function logIn(
  email: string,
  password: string,
  /** 로그인 상태 유지 여부입니다. false 로 설정하면 브라우저를 닫을 때 로그아웃됩니다. session 의 유효 기간은 서버가 정합니다. */
  keep: boolean,
): Promise<Account> {
  const { account } = await getJSON<{ account: Account }>("/login", {
    method: "POST",
    body: JSON.stringify({ email, password, keep }),
  });
  return account;
}

export async function findId(name: string, email: string): Promise<void> {
  // 일치하는 계정이 있든 없든 서버는 같은 응답을 반환합니다. 아이디를 알려주는 것은 응답 본문이 아니라
  // 해당 이메일 주소로 전송되는 메일입니다. 따라서 반환할 값이 없습니다.
  await getJSON("/find-id", {
    method: "POST",
    body: JSON.stringify({ name, email }),
  });
}

export async function requestPasswordReset(email: string): Promise<void> {
  // 재설정 링크도 이메일로만 전송됩니다. 위와 같은 이유로 응답에는 어떤 내용도 포함되지 않습니다.
  await getJSON("/password-reset", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function resetPassword(token: string, password: string): Promise<void> {
  // 이메일로 수신한 token 과 새 비밀번호를 함께 전송합니다. 서버는 token 을 한 번 사용한 후 무효화하며,
  // 해당 계정의 모든 활성 로그인 session 도 종료합니다.
  await getJSON("/password-reset/confirm", {
    method: "POST",
    body: JSON.stringify({ token, password }),
  });
}

export async function fetchMe(): Promise<Me> {
  // 계정과 함께 내가 속한 팀 목록(teams)이 포함됩니다. 팀 명단을 조회할 필요가 없습니다.
  return getJSON<Me>("/me");
}

// 로그인 여부 표시용 cookie 이름입니다. 실제 session cookie(banblit_session)는 httpOnly 속성이라 화면에서 읽을 수 없습니다.
// 이 이름을 정의하는 곳은 이 상수 하나입니다.
const SIGNED_IN_COOKIE = "banblit_signed_in";

/** 로그인 여부만 나타내는 cookie 의 존재 여부를 확인합니다. document.cookie 를 읽는 것은 상태를
 *  조회하는 작업이므로 시퀀스 파일인 이 파일에 둡니다. */
export function isSignedIn(): boolean {
  return document.cookie.split("; ").includes(`${SIGNED_IN_COOKIE}=1`);
}

export async function logOut(): Promise<void> {
  // 서버가 session 을 무효로 설정하고 cookie 2개를 삭제합니다.
  await getJSON("/logout", { method: "POST" });
}

export { getJSON, sendFile };

export async function loadTeamMembers(teamId: number): Promise<Member[]> {
  const body = await getJSON<{ members: Member[] }>(`/teams/${teamId}/members`);
  return body.members;
}

// 알림입니다. 목록을 조회한 후에야 읽지 않은 개수를 계산할 수 있고, 읽음 표시는 목록을 다시 조회해야
// 화면에 반영됩니다. 호출 순서가 중요하므로 이 파일에 모읍니다.
export async function loadNotifications(): Promise<Notification[]> {
  // ponytail: 오래된 알림을 삭제하거나 일부만 조회하는 기능은 구현하지 않았습니다. 사용자당 하루에 최대 알림 2개가 누적됩니다. 목록 크기가 커지면 이 함수에 개수 제한을 추가하고 서버도 함께 적용합니다.
  const body = await getJSON<{ notifications: Notification[] }>("/notifications");
  return body.notifications;
}

export async function markNotificationsRead(): Promise<void> {
  // 읽지 않은 알림을 모두 한 번에 읽음 상태로 변경합니다. 응답에는 본문이 없습니다.
  await getJSON("/notifications/read", { method: "POST" });
}

// 알림 문구 생성과 읽지 않은 개수 계산 사이에 순서 의존이 없어 그대로 export 합니다.
export { notificationText, unreadCount } from "./notifications";
