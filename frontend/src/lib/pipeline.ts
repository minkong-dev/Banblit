// lib 모듈의 시퀀스 파일입니다. 어느 검증을 어느 순서로 호출할지 이 파일에서 결정합니다.

import { getJSON, isSignedIn, sendFile } from "./api";
import type {
  Account, Ensemble, Me, Member, Notification, Period, Reservation, Unavailable,
} from "./contract";
import {
  dayKey,
  datesBetween,
  dayLabel,
  dayWithWeekday,
  focusedRanges,
  hoursLabel,
  inRanges,
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
import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_HINT,
  attachmentMessage,
  BLINDED_KEY,
  BOARD_KEY,
  boardActions,
  boardListKey,
  bodyMessage,
  commentMessage,
  fileSizeLabel,
  titleMessage,
} from "./boards";
import {
  memberLabel,
  myTeamIds,
  noMembersMessage,
  slotCountsMessage,
  slotName,
  teamNameMessage,
} from "./roster";

type RoomForm = { name: string; opens_at: string; closes_at: string };
type PeriodForm = { starts_on: string; ends_on: string };

export function checkRoom(form: RoomForm, taken: string[], slotMinutes: number): string {
  // 이름을 먼저 검증합니다. 이름이 비었거나 겹치면 시각이 유효해도 저장할 수 없고,
  // 오류 메시지를 한 번에 하나만 표시하므로 먼저 수정할 것을 앞에 둡니다.
  const name = roomNameMessage(form.name, taken);
  if (name !== "") return name;

  // 여는 시각과 닫는 시각은 한 쌍으로만 검증합니다. 정시 격자를 벗어났는지와
  // 순서가 뒤집혔는지를 따로 검증하면 둘 다 위반했을 때 오류 메시지가 2번에 나뉘어 표시됩니다.
  return openHoursMessage(form.opens_at, form.closes_at, slotMinutes);
}

/** 서버에 보낼 기간 값입니다. 매일이 켜진 집중 합주기간은 종료일이 없으므로
 *  화면이 감춘 종료일 대신 시작일을 종료일로 보냅니다. 서버는 ends_on 을 필수로 받고 everyday 면 무시합니다. */
export function periodBody<T extends PeriodForm & { kind?: string; everyday?: boolean }>(form: T): T {
  if (form.kind === "focused" && form.everyday) {
    return { ...form, ends_on: form.starts_on };
  }
  return form;
}

export type SaveStep = "period" | "ensemble" | "clearEnsemble";

/** 기간 저장(POST·PATCH)과 전체합주 저장(PUT·DELETE)의 요청 순서입니다. 서버는 전체합주 날짜 범위가
 *  기간 안인지를 요청마다 DB CHECK 로 검사하므로, 매 요청 직후의 저장 상태가 그 조건을 지키는 순서로 보냅니다.
 *  before 는 저장된 기간이고, 새 기간이면 null 입니다. ensemble 이 null 이면 전체합주를 해제합니다. */
export function ensembleSaveOrder(
  before: (PeriodForm & { everyday: boolean; ensemble: PeriodForm | null }) | null,
  ensemble: PeriodForm | null,
): SaveStep[] {
  if (before === null) return ensemble === null ? ["period"] : ["period", "ensemble"];
  if (ensemble === null) return before.ensemble === null ? ["period"] : ["clearEnsemble", "period"];
  // ponytail: 새 전체합주가 저장된 기간 밖이고 옛 전체합주도 새 기간 밖이면 어느 순서든 첫 요청이 거절됩니다.
  // 서버 사유를 그대로 표시합니다. 막으려면 기간과 전체합주를 한 transaction 으로 받는 endpoint 가 필요합니다.
  const inside = ensemble.starts_on >= before.starts_on
    && (before.everyday || ensemble.ends_on <= before.ends_on);
  return inside ? ["ensemble", "period"] : ["period", "ensemble"];
}

export type PeriodBody = Omit<Period, "id" | "ensemble">;
export type EnsembleBody = Omit<Ensemble, "days">;

/** 기간과 전체합주를 ensembleSaveOrder 순서로 저장합니다. 요청 사이에 실패하면 앞 요청은 저장된 채로 남고,
 *  서버 사유를 담은 오류를 그대로 던집니다. */
export async function savePeriod(
  before: Period | null, period: PeriodBody, ensemble: EnsembleBody | null,
): Promise<void> {
  let id = before?.id;
  for (const step of ensembleSaveOrder(before, ensemble)) {
    if (step === "period") {
      const saved = await getJSON<{ period: Period }>(before === null ? "/periods" : `/periods/${before.id}`, {
        method: before === null ? "POST" : "PATCH",
        body: JSON.stringify(periodBody(period)),
      });
      id = saved.period.id;
    } else if (step === "clearEnsemble") {
      await getJSON(`/periods/${id}/ensemble`, { method: "DELETE" });
    } else {
      await getJSON(`/periods/${id}/ensemble`, { method: "PUT", body: JSON.stringify(ensemble) });
    }
  }
}

/** 전체합주 날짜 하나의 시각을 지정합니다. 이미 지정한 날짜면 서버가 덮어씁니다. */
export async function saveEnsembleDay(
  periodId: number, day: string, startsAt: string, endsAt: string,
): Promise<void> {
  await getJSON(`/periods/${periodId}/ensemble/days/${day}`, {
    method: "PUT",
    body: JSON.stringify({ starts_at: startsAt, ends_at: endsAt }),
  });
}

/** 날짜 하나의 지정 시각을 삭제해 기본 시각으로 되돌립니다. */
export async function clearEnsembleDay(periodId: number, day: string): Promise<void> {
  await getJSON(`/periods/${periodId}/ensemble/days/${day}`, { method: "DELETE" });
}

export function checkPeriod(form: PeriodForm): string {
  // 기간은 시작일과 종료일 2개를 검증합니다. 종류와 계산 시각은 선택 옵션이라 검증할 항목이 없습니다.
  const body = periodBody(form);
  return dateRangeMessage(body.starts_on, body.ends_on);
}

type Opening = { rooms: RoomForm[]; days: number; teams: number; slotMinutes: number };

export function openingHours(input: Opening): {
  perDay: string;
  total: string;
  perTeam: string;
  leftover: string;
} {
  // capacity()로 slot(slotMinutes 길이의 시간 칸)의 개수를 먼저 계산하고, 그 개수를 시간으로 환산해 hoursLabel()로
  // 시간 문자열로 변환합니다. 순서가 반대일 수 없습니다 — 팀당 몫은 시간이 아니라 slot 개수로 나눕니다.
  const raw = capacity(input);
  const hours = (slots: number) => hoursLabel(slots, input.slotMinutes);
  return {
    perDay: hours(raw.perDay),
    total: hours(raw.total),
    perTeam: hours(raw.perTeam),
    leftover: hours(raw.leftover),
  };
}

export function daysBetween(from: string, to: string): number {
  // datesBetween()이 시작일과 종료일을 포함해 날짜를 연결합니다. 그 개수가 곧 기간의 날수입니다.
  return datesBetween(from, to).length;
}

// 스케줄러 화면이 사용하는 계산입니다. 합주실과 기간 사이에 순서 의존이 없어 그대로 export 합니다.
// roomBounds()는 달력의 여닫는 시각을, focusedRanges()는 자동 배정 띠의 날짜 범위 전부를 반환합니다.
export { focusedRanges, inRanges, roomBounds };

type PostForm = { title: string; body: string };

export { commentMessage as checkComment };
export { ensembleMessage as checkEnsemble, ensembleTimeMessage as checkEnsembleTime } from "./settings";
// 팀별합주 시간대 검증입니다. 순서 의존이 없어 그대로 export 합니다.
export { practiceWindowMessage as checkPracticeWindow } from "./settings";
export type { WindowPair } from "./settings";

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
export { memberLabel, myTeamIds, noMembersMessage, slotName };
export { teamNameMessage as checkTeamName, slotCountsMessage as checkSlotCounts };

// 게시판·공지 화면이 사용하는 계산입니다. fileSizeLabel 은 순서 의존이 없어 그대로 export 합니다.
export { ATTACHMENT_ACCEPT, ATTACHMENT_HINT, BLINDED_KEY, BOARD_KEY, boardActions, boardListKey, fileSizeLabel };


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
/** 불가능 일정의 반복 설정입니다. weekdays 가 0 이면 반복하지 않고, 127 이면 매일입니다.
 *  끝나는 조건은 count(횟수)나 until(종료일) 중 하나이고, 둘 다 값을 주면 서버가 422 로 거절합니다. */
export type Repeat = { weekdays: number; count: number | null; until: string | null };

export const NO_REPEAT: Repeat = { weekdays: 0, count: null, until: null };

/** 반복 설정을 서버가 받는 세 field 로 변환합니다. 반복하지 않으면 셋 다 null 입니다 —
 *  서버는 반복이 아닌데 횟수나 종료일이 오면 거절합니다. */
function repeatBody(repeat: Repeat): {
  repeat_weekdays: number | null; repeat_count: number | null; repeat_until: string | null;
} {
  if (repeat.weekdays === 0) return { repeat_weekdays: null, repeat_count: null, repeat_until: null };
  return {
    repeat_weekdays: repeat.weekdays,
    repeat_count: repeat.count,
    repeat_until: repeat.until,
  };
}

export async function addUnavailable(
  memberId: number,
  startsAt: string,
  endsAt: string,
  repeat: Repeat,
  reason: string,
  name: string,
): Promise<Unavailable> {
  const body = await getJSON<{ time: Unavailable }>(`/members/${memberId}/unavailable`, {
    method: "POST",
    body: JSON.stringify({
      starts_at: startsAt,
      ends_at: endsAt,
      ...repeatBody(repeat),
      reason: reason.trim() === "" ? null : reason.trim(),
      name: name.trim() === "" ? null : name.trim(),
    }),
  });
  return body.time;
}

/** 불가능 일정 하나를 수정합니다. 서버는 보낸 값으로 전부 덮어씁니다 — 일부만 보내는 방식이 아닙니다. */
export async function editUnavailable(
  memberId: number,
  timeId: number,
  startsAt: string,
  endsAt: string,
  repeat: Repeat,
  reason: string,
  name: string,
): Promise<Unavailable> {
  const body = await getJSON<{ time: Unavailable }>(
    `/members/${memberId}/unavailable/${timeId}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        starts_at: startsAt,
        ends_at: endsAt,
        ...repeatBody(repeat),
        reason: reason.trim() === "" ? null : reason.trim(),
        name: name.trim() === "" ? null : name.trim(),
      }),
    },
  );
  return body.time;
}

/** roomIds 의 합주실 전부에서 예약을 조회하고, 실패한 합주실은 오류 메시지만 수집합니다. loadRows(Scheduler)와 같은 구조입니다.
 *  요청은 동시에 보냅니다. 앞 요청의 응답을 기다리면 합주실 수만큼 왕복시간이 누적됩니다. */
export async function loadReservationRows(
  roomIds: number[], from: string, to: string,
): Promise<{ rows: Reservation[]; failures: string[] }> {
  const settled = await Promise.allSettled(
    roomIds.map((roomId) =>
      getJSON<{ reservations: Reservation[] }>(`/rooms/${roomId}/reservations?from=${from}&to=${to}`),
    ),
  );
  const rows: Reservation[] = [];
  const failures: string[] = [];
  settled.forEach((result, index) => {
    if (result.status === "fulfilled") {
      rows.push(...result.value.reservations);
      return;
    }
    const why = result.reason instanceof Error ? result.reason.message : "알 수 없는 오류";
    failures.push(`합주실 ${roomIds[index]}: ${why}`);
  });
  return { rows, failures };
}

type ReservationForm = {
  room_id: number;
  team_id: number | null;
  starts_at: string;
  ends_at: string;
};

/** 예약 한 건을 취소합니다. 서버가 구간 한 행으로 들고 있어 요청도 한 번입니다. */
/** 내가 잡은 예약 중 아직 끝나지 않은 것 전부입니다. 모든 합주실에 걸칩니다. */
export async function loadMyBookings(): Promise<Reservation[]> {
  const body = await getJSON<{ reservations: Reservation[] }>("/reservations/mine");
  return body.reservations;
}

export async function cancelBooking(reservationId: number): Promise<void> {
  await getJSON(`/reservations/${reservationId}`, { method: "DELETE" });
}

/** 자신이 등록한 불가능 일정 하나를 삭제합니다. 다른 사용자의 일정은 서버가 없는 일정과 같게 거절합니다. */
export async function removeUnavailable(memberId: number, timeId: number): Promise<void> {
  await getJSON(`/members/${memberId}/unavailable/${timeId}`, { method: "DELETE" });
}

/** 점유 단위(칸 하나의 크기, 분)를 변경합니다. room_edit 권한이 필요합니다.
 *  이미 저장된 예약과 배정은 그대로 남습니다. 단위를 늘리면 새 격자에 맞지 않는 기존 행이 남지만,
 *  삭제하면 사용자의 예약이 알림 없이 삭제됩니다(services/settings_service.py 의 set_slot_minutes). */
/** 칸 크기와 합주 길이를 저장합니다. 보내지 않은 값은 서버가 그대로 둡니다.
 *
 *  두 값을 한 요청에 담을 수 있어야 합니다. 30분 합주로 내리려면 칸도 30분이어야 하는데,
 *  요청을 나누면 어느 쪽을 먼저 보내도 중간 상태가 "합주 길이는 칸의 배수" 를 어겨 거절됩니다. */
export async function saveSettings(next: {
  slotMinutes?: number;
  sessionMinutes?: number;
}): Promise<{ slotMinutes: number; sessionMinutes: number }> {
  const body = await getJSON<{ slot_minutes: number; session_minutes: number }>("/settings", {
    method: "PATCH",
    body: JSON.stringify({
      slot_minutes: next.slotMinutes,
      session_minutes: next.sessionMinutes,
    }),
  });
  return { slotMinutes: body.slot_minutes, sessionMinutes: body.session_minutes };
}

/** 멤버를 추방합니다. 서버는 계정을 삭제하므로 그 멤버의 글·댓글·예약도 함께 삭제됩니다. member_expel 권한이 필요합니다. */
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

// 아래는 서버 호출과 짝을 이루는 계산 함수의 재출력입니다. 순서 의존이 없어 그대로 export 합니다.
// 이 파일이 모으는 것은 서버 호출을 조합하는 함수와 그 짝뿐입니다. 서버와 무관한 기능 파일
// (lib/api 의 getJSON·reason, calendar, roster, runs, toast, confirm, loading, paging, theme)은
// 화면이 직접 참조합니다.
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
  loginIdMessage,
  passwordMessage,
  signupPasswordMessage,
  strongPasswordMessage,
  studentNoMessage,
} from "./validate";

type SignUpForm = {
  name: string;
  // 멤버를 구분하는 값의 일부입니다. 이름·학과·학번·기수 4개 항목이 모두 같아야 같은 멤버입니다.
  department: string;
  student_no: string;
  email: string;
  login_id: string;
  password: string;
  cohort: number;
  /** 관리자코드입니다. 환경변수의 코드와 같으면 권한 항목을 모두 받습니다.
   *  입력하지 않았거나 다르면 권한 0개로 가입하고 이미 권한을 가진 사람에게서 부여받습니다.
   *  서버 쪽 정본은 backend/src/backend/services/auth_service.py 의 ADMIN_CODE_VARIABLE 입니다. */
  admin_code?: string;
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
  loginId: string,
  password: string,
  /** 로그인 상태 유지 여부입니다. false 로 설정하면 브라우저를 닫을 때 로그아웃됩니다. session 의 유효 기간은 서버가 결정합니다. */
  keep: boolean,
): Promise<Account> {
  const { account } = await getJSON<{ account: Account }>("/login", {
    method: "POST",
    body: JSON.stringify({ login_id: loginId, password, keep }),
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

// isSignedIn 은 api.ts 에 있습니다. 401 처리가 같은 cookie 를 읽기 때문입니다. 화면은 이 파일에서 가져갑니다.
export { isSignedIn };

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
