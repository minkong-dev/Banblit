// lib 모듈의 시퀀스 파일. 어느 검사를 어느 순서로 부를지 여기서 정한다.
// 화면은 기능 파일(settings.ts, calendar.ts, slots.ts)을 직접 부르지 않고 이것만 부른다.

import { getJSON, sendFile } from "./api";
import type { Account, Me, Member, Notification, Reservation, Unavailable } from "./contract";
import {
  datesBetween,
  focusedRange,
  hoursLabel as hoursLabelOf,
  isRangeFree,
  monthCells,
  roomBounds,
  slotLabel,
  takenGrid,
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
  attachmentHint,
  attachmentMessage,
  bodyMessage,
  commentMessage,
  fileSizeLabel,
  postWhen,
  titleMessage,
} from "./boards";
import {
  memberLabel,
  myTeamIds,
  peopleOf,
  slotCountsMessage,
  slotName,
  teamNameMessage,
} from "./roster";

export type RoomForm = { name: string; opens_at: string; closes_at: string };
export type PeriodForm = { starts_on: string; ends_on: string };

export function checkRoom(form: RoomForm, taken: string[]): string {
  // 이름을 먼저 본다. 이름이 비었거나 겹치면 시각이 성해도 저장할 수 없고,
  // 사유를 한 번에 하나만 보여주므로 사람이 먼저 고쳐야 할 것을 앞에 둔다.
  const name = roomNameMessage(form.name, taken);
  if (name !== "") return name;

  // 여는 시각과 닫는 시각은 한 쌍으로만 판정된다 — 격자를 벗어났는지와
  // 순서가 뒤집혔는지를 따로 물으면 둘 다 어긋났을 때 두 번 되묻게 된다.
  return openHoursMessage(form.opens_at, form.closes_at);
}

export function checkPeriod(form: PeriodForm): string {
  // 기간은 날짜 두 개가 전부다. 종류와 계산 시각은 고를 수만 있어 검사할 것이 없다.
  return dateRangeMessage(form.starts_on, form.ends_on);
}

export type Opening = { rooms: RoomForm[]; days: number; teams: number };

export function openingHours(input: Opening): {
  perDay: string;
  total: string;
  perTeam: string;
  leftover: string;
  raw: Capacity;
} {
  // capacity 로 칸 개수를 먼저 내고, 그것을 hoursLabel 로 시각으로 바꾼다.
  // 순서가 반대일 수 없다 — 화면은 자리 개수를 그대로 보여주지 않는다.
  const raw = capacity(input);
  return {
    perDay: hoursLabelOf(raw.perDay),
    total: hoursLabelOf(raw.total),
    perTeam: hoursLabelOf(raw.perTeam),
    leftover: hoursLabelOf(raw.leftover),
    raw,
  };
}

export function daysBetween(from: string, to: string): number {
  // datesBetween 이 양 끝을 포함해 날짜를 잇는다. 그 개수가 곧 기간의 날수다.
  return datesBetween(from, to).length;
}

// 스케줄러 화면이 쓰는 계산. 방·기간 사이에 서로 order 의존이 없어 그대로 다시 내보낸다 —
// roomBounds 는 달력의 여닫는 시각을, focusedRange 는 자동 배정 띠의 날짜 범위를 낸다.
export { focusedRange, roomBounds };

export type PostForm = { title: string; body: string };

export function checkPost(form: PostForm): string {
  // 제목을 먼저 본다 — 사유를 한 번에 하나만 보여주므로 먼저 고칠 것을 앞에 둔다.
  const title = titleMessage(form.title);
  return title !== "" ? title : bodyMessage(form.body);
}

export function checkComment(body: string): string {
  return commentMessage(body);
}

/** 고른 파일을 앞에서부터 검사해, 처음 걸린 것의 이름과 사유를 돌려준다. */
export function checkAttachments(files: { name: string; size: number }[]): string {
  // 보내기 전에 여기서 한 번 거른다. 서버도 같은 것을 다시 거르므로 이 검사는
  // 사람이 바로 알아채라고 있는 것이지 안전장치가 아니다 — 브라우저에서 하는
  // 검사는 얼마든지 건너뛸 수 있다.
  // 사유를 한 번에 하나만 보여주므로, 여럿이 걸려도 앞의 것만 알린다.
  for (const file of files) {
    const why = attachmentMessage(file.name, file.size);
    if (why !== "") return `${file.name}: ${why}`;
  }
  return "";
}

export function checkTeamName(name: string, taken: string[]): string {
  return teamNameMessage(name, taken);
}

export function checkSlotCounts(counts: Record<string, number>): string {
  return slotCountsMessage(counts);
}

// 팀·자리를 두고 화면이 하는 계산. 서로 기다릴 것이 없어 그대로 다시 내보낸다.
export { memberLabel, myTeamIds, slotCountsMessage, slotName };

// 게시판·공지 화면이 쓰는 계산. postWhen 과 fileSizeLabel 은 order 의존이 없어
// 그대로 다시 내보낸다.
export { ATTACHMENT_ACCEPT, attachmentHint, fileSizeLabel, postWhen };

// 권한 구역이 쓰는 계산. 팀 명단을 받아 둔 뒤에만 부를 수 있어 순서를 정할 것이 없다.
export { peopleOf };
export type { Person } from "./roster";

export type AssignBody = { team_ids: number[]; room_ids: number[] };

export async function runAssignment<T>(periodId: number, body: AssignBody): Promise<T> {
  // 접수(POST)가 먼저다 — 서버는 계산을 기다리지 않고 작업 번호만 돌려준다. 그 번호로
  // awaitJob 이 끝날 때까지 되묻는다. 순서가 반대일 수 없고, 접수 응답을 결과로 쓰면
  // 계산이 시작도 안 한 값을 화면에 그리게 된다.
  const accepted = await getJSON<{ job: Job<T> }>(`/periods/${periodId}/assign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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

export async function addUnavailable(
  memberId: number, startsAt: string, endsAt: string, repeatsWeekly: boolean,
): Promise<Unavailable> {
  // repeat_until 은 보내지 않는다 — 서버는 repeats_weekly 가 꺼져 있는데 repeat_until 이
  // 오면 거절하고, 켜져 있으면 기간의 끝까지로 알아서 자른다.
  // ponytail: 끝나는 날을 사람이 직접 정하는 자리는 없다. 필요해지면 화면에 날짜
  // 하나를 더 받아 repeat_until 로 함께 보낸다.
  const body = await getJSON<{ time: Unavailable }>(`/members/${memberId}/unavailable`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ starts_at: startsAt, ends_at: endsAt, repeats_weekly: repeatsWeekly }),
  });
  return body.time;
}

/** 방 여러 개의 예약을 한 번에 받아, 실패한 방은 사유만 모아 둔다 — loadRows(Scheduler)와 같은 얼개. */
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

export async function addReservation(form: ReservationForm): Promise<Reservation[]> {
  const body = await getJSON<{ reservations: Reservation[] }>("/reservations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(form),
  });
  return body.reservations;
}

// 아래는 화면이 그대로 쓰는 것들이다. 순서를 정할 것이 없어 그냥 내보내되, 화면이
// 기능 파일을 직접 부르지 않게 통로를 여기 하나로 모은다.
export {
  dayOf,
  hhmm,
  isoAt,
  mergeSessions,
  slotIndex,
} from "./slots";
export type { Session } from "./slots";
export { datesBetween, isRangeFree, monthCells, slotLabel, takenGrid };
export { hoursLabelOf as hoursLabel };
export {
  cohortMessage,
  emailMessage,
  passwordMessage,
  phoneMessage,
  strongPasswordMessage,
} from "./validate";

export type SignUpForm = {
  name: string;
  // 사람을 가르는 값의 일부다 — 이름·학과·학번·기수 넷이 같으면 같은 사람이다.
  department: string;
  student_no: string;
  email: string;
  password: string;
  cohort: number;
};

export async function signUp(form: SignUpForm): Promise<Account> {
  // 가입 성공 응답은 계정만 담아 온다 — 세션은 서버가 httpOnly 쿠키(banblit_session)로
  // 내려보내고, 화면은 그 값을 보지도 만지지도 않는다.
  const { account } = await getJSON<{ account: Account }>("/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(form),
  });
  return account;
}

export async function logIn(
  email: string,
  password: string,
  /** 로그인 상태 유지. 끄면 브라우저를 닫을 때 풀린다 — 수명은 서버가 정한다. */
  keep: boolean,
): Promise<Account> {
  const { account } = await getJSON<{ account: Account }>("/login", {
    method: "POST",
    body: JSON.stringify({ email, password, keep }),
  });
  return account;
}

export async function findId(name: string, email: string): Promise<void> {
  // 맞는 계정이 있든 없든 서버는 같은 답을 준다 — 아이디를 알려주는 것은 응답이 아니라
  // 그 주소로 가는 메일이다. 그래서 돌려줄 값이 없다.
  await getJSON("/find-id", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email }),
  });
}

export async function requestPasswordReset(email: string): Promise<void> {
  // 재설정 링크도 메일로만 간다. 위와 같은 이유로 응답에는 아무것도 담기지 않는다.
  await getJSON("/password-reset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
}

export async function resetPassword(token: string, password: string): Promise<void> {
  // 메일로 받은 토큰과 새 비밀번호를 함께 보낸다. 서버가 토큰을 한 번 쓰고 죽이며,
  // 그 계정으로 열려 있던 로그인도 전부 끊는다.
  await getJSON("/password-reset/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, password }),
  });
}

export async function fetchMe(): Promise<Me> {
  // 계정과 함께 내가 앉아 있는 자리(teams)가 온다. 팀 명단을 훑어 소속을 가려낼
  // 필요가 없다.
  return getJSON<Me>("/me");
}

// 표시용 쿠키 이름 — 실제 세션(banblit_session)은 httpOnly라 여기서 읽지 못한다.
// 이름을 적는 자리는 여기 하나다.
const SIGNED_IN_COOKIE = "banblit_signed_in";

/** 로그인 여부만 나타내는 쿠키가 있는지 본다. document.cookie 를 읽는 것은 상태를
 *  보는 일이라 시퀀스 파일인 여기에 둔다. */
export function isSignedIn(): boolean {
  return document.cookie.split("; ").includes(`${SIGNED_IN_COOKIE}=1`);
}

export async function logOut(): Promise<void> {
  // 서버가 세션을 무효로 만들고 쿠키 둘을 지운다.
  await getJSON("/logout", { method: "POST" });
}

// 예전에는 여기에 "연결 끊긴 상태로 보기" 스위치가 있어, 켜면 부르기 전에 실패시켜
// 오류 화면을 볼 수 있었다. 끊긴 상태를 보려면 실제로 서버를 내리면 되는 일이라
// 걷어냈다 — 요청마다 지나는 자리에 아무도 켤 수 없는 분기를 둘 이유가 없다.
export { getJSON, sendFile };

// 주 보기가 쓰는 계산. 달력의 달 옮기기(cursor)와 짝을 이뤄, 몇 주 옮겼는지(shift)만
// 따로 들고 여기서 날짜로 편다 — 주가 달을 넘어가도 상태를 하나만 보면 된다.
function dayKeyOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function weekKeys(year: number, month: number, shift: number): string[] {
  // year 년 month 월(0부터 센다) 15일이 든 주를 shift 주만큼 옮겨, 일요일부터
  // 토요일까지 이레 치 날짜를 돌려준다.
  // 정오를 기준으로 센다 — datesBetween 과 같은 이유로, 자정으로 세면 여름시간제가
  // 있는 지역에서 날짜가 하루씩 밀 수 있다.
  const sunday = new Date(year, month, 15 + shift * 7, 12);
  sunday.setDate(sunday.getDate() - sunday.getDay());
  return Array.from({ length: 7 }, (_, i) =>
    dayKeyOf(new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() + i, 12)));
}

export async function loadTeamMembers(teamId: number): Promise<Member[]> {
  const body = await getJSON<{ members: Member[] }>(`/teams/${teamId}/members`);
  return body.members;
}

// 알림. 목록을 받은 뒤에야 안 읽은 수를 셀 수 있고, 읽음 처리는 목록을 다시 받아야
// 화면에 반영된다 — 부르는 순서가 있어 여기 둔다.
export async function loadNotifications(): Promise<Notification[]> {
  // ponytail: 오래된 알림을 지우거나 몇 개까지만 받는 자리는 두지 않았다. 사람마다
  // 하루 두 줄까지 쌓인다. 목록이 무거워지면 여기에 개수 상한을 주고 서버도 함께 자른다.
  const body = await getJSON<{ notifications: Notification[] }>("/notifications");
  return body.notifications;
}

export async function markNotificationsRead(): Promise<void> {
  // 안 읽은 것 전부를 한 번에 읽음으로 바꾼다. 답장에는 본문이 없다.
  await getJSON("/notifications/read", { method: "POST" });
}

// 문장 만들기와 세기는 서로 기다릴 것이 없어 그대로 다시 내보낸다.
export { notificationText, unreadCount } from "./notifications";
