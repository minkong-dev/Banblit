// lib 모듈의 시퀀스 파일. 어느 검사를 어느 순서로 부를지 여기서 정한다.
// 화면은 기능 파일(settings.ts, calendar.ts, slots.ts)을 직접 부르지 않고 이것만 부른다.

import { getJSON as sendJSON } from "./api";
import type { Account, Reservation, Unavailable } from "./contract";
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
import { bodyMessage, commentMessage, postWhen, titleMessage } from "./boards";
import { joinPositionMessage, teamNameMessage } from "./roster";

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
  // capacity 로 30분 자리 개수를 먼저 내고, 그것을 hoursLabel 로 시각으로 바꾼다.
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

export function checkTeamName(name: string, taken: string[]): string {
  return teamNameMessage(name, taken);
}

export function checkJoinPosition(positionId: number | null): string {
  return joinPositionMessage(positionId);
}

// 게시판·공지 화면이 쓰는 계산. postWhen 은 order 의존이 없어 그대로 다시 내보낸다.
export { postWhen };

export type AssignBody = { team_ids: number[]; room_ids: number[] };

export async function runAssignment<T>(periodId: number, body: AssignBody): Promise<T> {
  // 접수(POST)가 먼저다 — 서버는 계산을 기다리지 않고 작업 번호만 돌려준다. 그 번호로
  // awaitJob 이 끝날 때까지 되묻는다. 순서가 반대일 수 없고, 접수 응답을 결과로 쓰면
  // 계산이 시작도 안 한 값을 화면에 그리게 된다.
  const accepted = await sendJSON<{ job: Job<T> }>(`/periods/${periodId}/assign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return awaitJob<T>(
    accepted.job.id,
    (id) => sendJSON<{ job: Job<T> }>(`/jobs/${id}`),
    (ms) => new Promise((done) => setTimeout(done, ms)),
    () => Date.now(),
  );
}

export async function loadUnavailable(memberId: number): Promise<Unavailable[]> {
  const body = await getJSON<{ times: Unavailable[] }>(`/members/${memberId}/unavailable`);
  return body.times;
}

export async function addUnavailable(
  memberId: number, startsAt: string, endsAt: string,
): Promise<Unavailable> {
  const body = await sendJSON<{ time: Unavailable }>(`/members/${memberId}/unavailable`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ starts_at: startsAt, ends_at: endsAt }),
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
  member_id: number;
  team_id: number | null;
  starts_at: string;
  ends_at: string;
};

export async function addReservation(form: ReservationForm): Promise<Reservation[]> {
  const body = await sendJSON<{ reservations: Reservation[] }>("/reservations", {
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
  emailMessage,
  passwordMessage,
  phoneMessage,
  strongPasswordMessage,
} from "./validate";

export type SignUpForm = { name: string; email: string; password: string; positions: string[] };

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

export async function logIn(email: string, password: string): Promise<Account> {
  const { account } = await getJSON<{ account: Account }>("/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return account;
}

export async function fetchMe(): Promise<Account> {
  const { account } = await getJSON<{ account: Account }>("/me");
  return account;
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

// 개발자가 켜는 "연결 끊긴 상태로 보기" 하나. 기능 파일은 state 를 들지 않으므로
// 시퀀스 파일인 여기서 든다. getJSON 이 fetch 전에 이 값을 본다.
let devOffline = false;

export function isDevOffline(): boolean {
  return devOffline;
}

export function setDevOffline(next: boolean): void {
  devOffline = next;
}

export function getJSON<T>(path: string, init?: RequestInit): Promise<T> {
  // "연결 끊긴 상태로 보기"가 켜져 있으면 부르기 전에 끊는다. sendJSON 은 값을 들지
  // 않으므로 그 판단이 여기 있어야 한다. import.meta.env.DEV 가 빌드 때 상수로 접혀,
  // 배포 묶음에서는 이 분기와 체크박스가 함께 빠진다.
  if (import.meta.env.DEV && devOffline) {
    return Promise.reject(new Error("서버에 닿지 못했습니다"));
  }
  return sendJSON<T>(path, init);
}
