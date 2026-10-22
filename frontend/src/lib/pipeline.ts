// lib 모듈의 시퀀스 파일입니다. 서버 호출과, 그 앞뒤에 어느 검증을 어느 순서로 호출할지만 이 파일에서 결정합니다.
// 서버와 무관한 계산 함수는 다시 export 하지 않습니다. 화면은 그 함수가 있는 lib 파일에서 직접 import 합니다.

import { apiUrl, getJSON, reason, sendFile } from "./api";
import type {
  Account, Attachment, RecordRound, ScheduleRecord, Ensemble, Me, Member, MemberUnavailable, Notification, Period, PermissionSet, Post, PostComment, Reservation,
  RoomInput, ScheduleOut, ScheduleRow, Settings, Team, TeamSlot, Unavailable,
} from "./contract";
import { seatAssignments } from "./roster";
import type { Seat } from "./roster";
import {
  datesBetween,
  hoursLabel,
} from "./calendar";
import {
  capacity,
  dateRangeMessage,
  openHoursMessage,
  roomNameMessage,
} from "./settings";
import {
  attachmentMessage,
  bodyMessage,
  titleMessage,
} from "./boards";

type PeriodForm = Pick<Period, "starts_on" | "ends_on">;

export function checkRoom(form: RoomInput, taken: string[], slotMinutes: number): string {
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

/** 기간 저장(POST·PATCH)과 전체 합주 저장(PUT·DELETE)의 요청 순서입니다. 서버는 전체 합주 날짜 범위가
 *  기간 안인지를 요청마다 DB CHECK 로 검사하므로, 매 요청 직후의 저장 상태가 그 조건을 지키는 순서로 보냅니다.
 *  before 는 저장된 기간이고, 새 기간이면 null 입니다. ensemble 이 null 이면 전체 합주를 해제합니다. */
export function ensembleSaveOrder(
  before: (PeriodForm & { everyday: boolean; ensemble: PeriodForm | null }) | null,
  ensemble: PeriodForm | null,
): SaveStep[] {
  if (before === null) return ensemble === null ? ["period"] : ["period", "ensemble"];
  if (ensemble === null) return before.ensemble === null ? ["period"] : ["clearEnsemble", "period"];
  // ponytail: 새 전체 합주가 저장된 기간 밖이고 옛 전체 합주도 새 기간 밖이면 어느 순서든 첫 요청이 거절됩니다.
  // 서버 사유를 그대로 표시합니다. 막으려면 기간과 전체 합주를 한 transaction 으로 받는 endpoint 가 필요합니다.
  const inside = ensemble.starts_on >= before.starts_on
    && (before.everyday || ensemble.ends_on <= before.ends_on);
  return inside ? ["ensemble", "period"] : ["period", "ensemble"];
}

export type PeriodBody = Omit<Period, "id" | "ensemble" | "fixed_at">;
export type EnsembleBody = Omit<Ensemble, "days">;

/** 기간과 전체 합주를 ensembleSaveOrder 순서로 저장합니다. 요청 사이에 실패하면 앞 요청은 저장된 채로 남고,
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

/** 전체 합주 날짜 하나의 시각을 지정합니다. 이미 지정한 날짜면 서버가 덮어씁니다. */
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

type Opening = { rooms: RoomInput[]; days: number; teams: number; slotMinutes: number };

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


type PostForm = { title: string; body: string };


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




/** 기간 하나의 확정 시간표입니다. 달력 화면(routes/Scheduler)과 배정 결과 화면(routes/Assignment)이 같은
 *  endpoint 를 조회하므로 주소를 적는 곳을 이 함수 하나로 유지합니다. */
export async function loadSchedule(periodId: number): Promise<ScheduleRow[]> {
  return (await loadScheduleOut(periodId)).rows;
}

/** loadSchedule 과 같은 endpoint 입니다. 배정 결과 화면은 부족분과 불참자 보고(report)도 함께 씁니다. */
export function loadScheduleOut(periodId: number): Promise<ScheduleOut> {
  return getJSON<ScheduleOut>(`/periods/${periodId}/schedule`);
}

/** 스케줄링 기록 1개를 확정 시간표로 만듭니다. 교체되는 현행은 서버가 이전 확정본으로 보관합니다. */
export function applyRecord(periodId: number, savedAt: string): Promise<{ applied: boolean }> {
  return getJSON<{ applied: boolean }>(
    `/periods/${periodId}/records/${encodeURIComponent(savedAt)}/apply`, { method: "POST" },
  );
}

// ===== job 대기 =====
// 오래 걸리는 계산을 접수하고 완료될 때까지 다시 조회(refetch: 같은 조회를 다시 보내 값을 갱신하는 것)합니다.
// 실제 조회는 매개변수로 받은 read 가 합니다.

export type JobStatus = "queued" | "running" | "done" | "failed";

export type Job<T> = {
  id: string;
  status: JobStatus;
  result: T | null;
  error: string | null;
};

/** 다시 조회하는 간격(밀리초)입니다. */
export const JOB_POLL_MS = 700;

/** 서버가 배정 작업 1개에 쓰는 최대 시간(초)입니다. solver 계산 1회 60초(scheduling/pipeline.py 의
 *  SOLVER_TIME_LIMIT_SECONDS)입니다. 서버 값을 변경하면 이 값도 함께 변경합니다. */
const SERVER_JOB_LIMIT_SECONDS = 60;

/** 서버 상한에 더하는 여유(초)입니다. 결과 저장과 마지막 조회 간격만큼입니다. */
const DEADLINE_MARGIN_SECONDS = 30;

/** 이 시간까지 끝나지 않으면 대기를 중단합니다(밀리초). 서버 상한보다 먼저 중단하면 화면은 실패를
 *  표시하고 서버는 계산을 계속해 저장하므로, 실패한 배정이 나중에 반영됩니다.
 *  ponytail: queue 대기 시간은 포함하지 않습니다. 동시 작업 수(ASSIGN_MAX_CONCURRENT_JOBS)를 넘겨 접수된
 *  작업은 이 시간을 넘길 수 있습니다. 그 경우가 실제로 발생하면 queued 상태에서는 시간을 세지 않게 변경합니다. */
export const JOB_DEADLINE_MS = (SERVER_JOB_LIMIT_SECONDS + DEADLINE_MARGIN_SECONDS) * 1000;

export async function awaitJob<T>(
  jobId: string,
  read: (id: string) => Promise<{ job: Job<T> }>,
  wait: (ms: number) => Promise<void>,
  now: () => number,
): Promise<T> {
  // jobId를 read에 넣어 상태를 받고, done이면 결과를, failed이면 사유를 발생시킵니다.
  // 그 외에는 wait만큼 기다린 후 다시 조회합니다. now가 지정한 시각을 넘기면 중단합니다.
  const until = now() + JOB_DEADLINE_MS;
  for (;;) {
    const { job } = await read(jobId);
    if (job.status === "done") {
      if (job.result === null) throw new Error("연산된 결과를 받지 못했어요.");
      return job.result;
    }
    if (job.status === "failed") {
      throw new Error(job.error ?? "연산을 진행하지 못했어요.");
    }
    if (now() >= until) {
      throw new Error(`스케줄링 엔진이 ${JOB_DEADLINE_MS / 1000}초 안에 연산되지 않았어요.`);
    }
    await wait(JOB_POLL_MS);
  }
}

export type AssignBody = { team_ids: number[]; room_ids: number[] };

export async function runAssignment<T>(periodId: number, body: AssignBody): Promise<T> {
  // 접수(POST 요청)가 먼저입니다. 서버는 계산을 기다리지 않고 job(서버가 접수해 백그라운드에서 실행하는 계산 하나) 번호만 반환합니다. 그 번호로
  // awaitJob()이 완료될 때까지 다시 조회합니다. 순서가 반대일 수 없고, 접수 응답을 결과로 사용하면
  // 계산이 시작되지도 않은 값을 화면에 표시하게 됩니다.
  const accepted = await getJSON<{ job: Job<T> }>(`/periods/${periodId}/assign`, {
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

/** 전체 멤버의 불가능 일정입니다. "타 멤버 불가능 일정 조회"(unavailable_read) 권한이 없으면 서버가 403 으로 거절합니다.
 *  멤버마다 따로 조회하지 않고 한 번에 받습니다 — 멤버 수만큼 요청이 늘지 않습니다. */
export async function loadAllUnavailable(): Promise<MemberUnavailable[]> {
  const body = await getJSON<{ times: MemberUnavailable[] }>("/unavailable");
  return body.times;
}

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

/** 만료되지 않은 나의 모든 예약을 표시합니다. 모든 합주실의 예약을 포함합니다. */
export async function loadMyBookings(): Promise<Reservation[]> {
  const body = await getJSON<{ reservations: Reservation[] }>("/reservations/mine");
  return body.reservations;
}

/** 예약 한 건을 취소합니다. 서버가 구간 한 행으로 들고 있어 요청도 한 번입니다. */
export async function cancelBooking(reservationId: number): Promise<void> {
  await getJSON(`/reservations/${reservationId}`, { method: "DELETE" });
}

/** path 의 반려 주소로 사유를 보냅니다. 예약과 불가능 일정이 같은 본문({ reason })을 씁니다. */
async function sendReject(path: string, reason: string): Promise<void> {
  await getJSON(path, { method: "POST", body: JSON.stringify({ reason }) });
}

/** 다른 멤버의 예약 한 건을 사유와 함께 취소합니다. 예약한 멤버에게 사유를 담은 알림이 갑니다.
 *  reservation_manage 권한이 필요합니다. 다른 멤버의 예약은 cancelBooking 으로는 취소되지 않습니다. */
export async function rejectBooking(reservationId: number, reason: string): Promise<void> {
  await sendReject(`/reservations/${reservationId}/reject`, reason);
}

/** 다른 멤버의 불가능 일정 하나를 사유와 함께 삭제합니다. 등록한 멤버에게 사유를 담은 알림이 갑니다.
 *  unavailable_manage 권한이 필요합니다. */
export async function rejectUnavailable(memberId: number, timeId: number, reason: string): Promise<void> {
  await sendReject(`/members/${memberId}/unavailable/${timeId}/reject`, reason);
}

/** 확정된 기간의 확정과 마감 일시를 사유와 함께 해제합니다. 전체 멤버에게 사유를 담은 알림이 갑니다.
 *  proposal_confirm 권한이 필요합니다. */
export async function unfixPeriod(periodId: number, reason: string): Promise<void> {
  await getJSON(`/periods/${periodId}/unfix`, { method: "POST", body: JSON.stringify({ reason }) });
}

/** 자신이 등록한 불가능 일정 하나를 삭제합니다. 다른 사용자의 일정은 서버가 없는 일정과 같게 거절합니다. */
export async function removeUnavailable(memberId: number, timeId: number): Promise<void> {
  await getJSON(`/members/${memberId}/unavailable/${timeId}`, { method: "DELETE" });
}

/** 칸 크기와 합주 길이를 저장합니다. 보내지 않은 값은 서버가 그대로 둡니다.
 *
 *  두 값을 한 요청에 담을 수 있어야 합니다. 30분 합주로 내리려면 칸도 30분이어야 하는데,
 *  요청을 나누면 어느 쪽을 먼저 보내도 중간 상태가 "합주 길이는 칸의 배수" 를 어겨 거절됩니다. */
export async function saveSettings(next: {
  slotMinutes?: number;
  sessionMinutes?: number;
}): Promise<{ slotMinutes: number; sessionMinutes: number }> {
  const body = await getJSON<Settings>("/settings", {
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
   *  서버 쪽은 backend/src/backend/services/auth/auth_service.py 의 ADMIN_CODE_VARIABLE 에 작성되어 있는 내용을 기준으로 합니다. */
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


export async function logOut(): Promise<void> {
  // 서버가 session 을 무효로 설정하고 cookie 2개를 삭제합니다.
  await getJSON("/logout", { method: "POST" });
}


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


// ===== 게시판 =====

export type PostDetail = { post: Post; comments: PostComment[]; attachments: Attachment[] };

export async function loadPosts(listPath: string): Promise<Post[]> {
  const body = await getJSON<{ posts: Post[] }>(listPath);
  return body.posts;
}

export function loadPost(postId: number): Promise<PostDetail> {
  return getJSON<PostDetail>(`/posts/${postId}`);
}

/** draftPath(공지는 /notices/drafts, 팀 게시판은 /teams/{id}/posts/drafts)에 빈 초안을 만들고 반환합니다. */
export async function createDraft(draftPath: string): Promise<Post> {
  const body = await getJSON<{ post: Post }>(draftPath, { method: "POST" });
  return body.post;
}

export async function editPost(postId: number, title: string, body: string): Promise<Post> {
  const res = await getJSON<{ post: Post }>(`/posts/${postId}`, { method: "PATCH", body: JSON.stringify({ title, body }) });
  return res.post;
}

/** 글과 그 첨부를 삭제합니다. 발행하지 않은 초안을 버릴 때도 씁니다. */
export async function deletePost(postId: number): Promise<void> {
  await getJSON(`/posts/${postId}`, { method: "DELETE" });
}

export async function blindPost(postId: number): Promise<void> {
  await getJSON(`/posts/${postId}/blind`, { method: "PUT" });
}

export async function addComment(postId: number, body: string): Promise<PostComment> {
  const res = await getJSON<{ comment: PostComment }>(`/posts/${postId}/comments`, { method: "POST", body: JSON.stringify({ body }) });
  return res.comment;
}

export async function editComment(commentId: number, body: string): Promise<PostComment> {
  const res = await getJSON<{ comment: PostComment }>(`/comments/${commentId}`, { method: "PATCH", body: JSON.stringify({ body }) });
  return res.comment;
}

export async function deleteComment(commentId: number): Promise<void> {
  await getJSON(`/comments/${commentId}`, { method: "DELETE" });
}

export async function deleteAttachment(attachmentId: number): Promise<void> {
  await getJSON(`/attachments/${attachmentId}`, { method: "DELETE" });
}

export async function uploadAttachment(postId: number, file: File, onProgress: (percent: number) => void): Promise<number> {
  const body = await sendFile<{ attachment: { id: number } }>(`/posts/${postId}/attachments`, file, onProgress);
  return body.attachment.id;
}

/** 첨부를 내려받는 주소입니다. 서버가 attachment 로 내보내 브라우저가 저장합니다. */
export function attachmentDownloadUrl(attachmentId: number): string {
  return apiUrl(`/attachments/${attachmentId}`);
}

/** 첨부를 본문에 표시하는 주소입니다. img, audio, iframe 이 표시할 수 있는 형식으로 내보냅니다. */
export function attachmentInlineUrl(attachmentId: number): string {
  return apiUrl(`/attachments/${attachmentId}/inline`);
}

export async function searchMembers(query: string): Promise<Member[]> {
  const body = await getJSON<{ members: Member[] }>(`/members/search?q=${encodeURIComponent(query)}`);
  return body.members;
}

/** files 의 index 번째 첨부를 올리지 못했습니다. 그 앞의 첨부는 이미 초안에 붙어 있습니다. */
export class AttachmentFailed extends Error {
  constructor(readonly index: number, fileName: string, why: string) {
    super(`"${fileName}" 을 업로드하지 못해 글을 발행하지 않았어요 — ${why}`);
  }
}

/** 초안 draftId 에 files 를 순서대로 올린 뒤 글을 발행합니다. 첨부 하나라도 실패하면 AttachmentFailed 를 발생시키고 발행하지 않습니다. */
export async function publishWithAttachments(
  draftId: number,
  files: File[],
  post: { title: string; body: string },
  onProgress: (index: number, percent: number) => void,
): Promise<void> {
  // 첨부를 먼저 올립니다. 발행을 먼저 하면 첨부가 실패했을 때 첨부 없는 글이 공개됩니다.
  // 하나씩 올려야 파일마다 진행률을 표시할 수 있습니다.
  for (const [index, file] of files.entries()) {
    try {
      await uploadAttachment(draftId, file, (percent) => onProgress(index, percent));
    } catch (error) {
      throw new AttachmentFailed(index, file.name, reason(error));
    }
  }
  // author_id 는 보내지 않습니다. 서버가 요청의 cookie 로 작성자를 결정합니다.
  await getJSON(`/posts/${draftId}/publish`, { method: "POST", body: JSON.stringify(post) });
}

/** 반복 설정을 저장할 수 없는 사유입니다. 저장할 수 있으면 빈 문자열입니다. 서버도 같은 규칙으로 다시 검증합니다. */
export function repeatConflict(value: Repeat): string {
  if (value.weekdays === 0) return "";
  if (value.count !== null && value.until !== null) {
    return "반복 횟수와 반복 종료일은 동시에 설정할 수 없어요. 둘 중 하나만 입력해주세요.";
  }
  return "";
}

/** 여러 기간의 시간표를 받습니다. 실패한 기간은 "기간 {번호}: {사유}" 로 failures 에 모으고 나머지 기간의 행은 rows 에 담습니다. */
export async function loadScheduleRows(periodIds: number[]): Promise<{ rows: ScheduleRow[]; failures: string[] }> {
  const rows: ScheduleRow[] = [];
  const failures: string[] = [];
  for (const id of periodIds) {
    try {
      rows.push(...(await loadSchedule(id)));
    } catch (error) {
      failures.push(`기간 ${id}: ${reason(error)}`);
    }
  }
  return { rows, failures };
}

/** 팀 이름, 색, 포지션 수를 저장하고 저장된 팀을 반환합니다. team 이 null 이면 POST 1번, 아니면 바뀐 이름과 색만 PATCH 한 뒤 포지션을 PUT 합니다.
 *  포지션 수를 줄이면 서버가 번호가 큰 자리부터 삭제하고 그 자리의 멤버도 팀에서 제외합니다. */
export async function saveTeam(team: Team | null, name: string, color: string | null, counts: Record<string, number>): Promise<Team> {
  if (team === null) {
    const made = await getJSON<{ team: Team }>("/teams", { method: "POST", body: JSON.stringify({ name, slots: counts, color }) });
    return made.team;
  }
  if (name !== team.name || color !== team.color) {
    await getJSON(`/teams/${team.id}`, { method: "PATCH", body: JSON.stringify({ name, color }) });
  }
  await getJSON(`/teams/${team.id}/slots`, { method: "PUT", body: JSON.stringify({ slots: counts }) });
  return { ...team, name, color: color ?? team.color };
}

/** 저장된 자리를 seats 와 같게 변경합니다. 바뀐 자리 전부를 요청 1번으로 보내고, 바뀐 자리가 없으면 보내지 않습니다.
 *  서버가 transaction 1개로 처리하므로 실패하면 아무것도 반영되지 않습니다. */
export async function saveSeats(teamId: number, seats: Seat[]): Promise<void> {
  const saved = await loadTeamSlots(teamId);
  const assignments = seatAssignments(seats, saved);
  if (assignments.length === 0) return;
  await getJSON(`/teams/${teamId}/slot-members`, { method: "PUT", body: JSON.stringify({ assignments }) });
}

/** 프로필 사진을 올립니다. 서버가 이미지 형식과 크기를 검증합니다. */
export async function uploadAvatar(file: File): Promise<void> {
  await sendFile<{ ok: boolean }>("/me/avatar", file, () => {});
}

/** 올린 프로필 사진을 삭제합니다. 화면은 이름 앞 두 글자로 표시합니다. */
export async function resetAvatar(): Promise<void> {
  await getJSON<null>("/me/avatar", { method: "DELETE" });
}

/** 프로필 편집의 바뀐 값만 저장합니다. 이름, 기수가 그대로면 PATCH /me 를, next 가 비어 있으면 비밀번호 변경을 보내지 않습니다.
 *  ponytail: 요청 2개를 차례로 보내 이름은 저장되고 비밀번호만 실패할 수 있습니다. 그때는 이름, 기수를 저장했다는 문구로 오류를 발생시킵니다.
 *  한 번에 기록해야 하면 서버에 두 값을 함께 받는 endpoint 를 만듭니다. */
export async function saveProfile(
  me: Account, draft: { name: string; cohort: string; current: string; next: string },
): Promise<void> {
  const cohort = draft.cohort.trim() === "" ? null : Number(draft.cohort);
  const infoChanged = draft.name.trim() !== me.name || cohort !== me.cohort;
  if (infoChanged) {
    await getJSON<{ account: Account }>("/me", { method: "PATCH", body: JSON.stringify({ name: draft.name.trim(), cohort }) });
  }
  if (draft.next === "") return;
  try {
    await getJSON<null>("/me/password", { method: "POST", body: JSON.stringify({ current: draft.current, next: draft.next }) });
  } catch (error) {
    if (!infoChanged) throw error;
    throw new Error(`이름과 기수는 저장했지만 비밀번호는 변경하지 못했어요. ${reason(error)}`);
  }
}

/** 회원 탈퇴입니다. 서버가 계정과 작성한 글, 댓글, 예약을 삭제합니다. */
export async function leaveAccount(): Promise<void> {
  await getJSON<null>("/me", { method: "DELETE" });
}

/** permission set 전부를 조회합니다. 카드마다 그 권한을 가진 멤버 목록이 함께 옵니다. */
export async function loadPermissionSets(): Promise<PermissionSet[]> {
  const body = await getJSON<{ permission_sets: PermissionSet[] }>("/permission-sets");
  return body.permission_sets;
}

/** permission set 1개를 삭제합니다. */
export async function removePermissionSet(setId: number): Promise<void> {
  await getJSON<null>(`/permission-sets/${setId}`, { method: "DELETE" });
}

/** 멤버 1명에게 permission set 을 부여합니다. */
export async function grantPermissionSet(memberId: number, setId: number): Promise<void> {
  await getJSON<null>(`/members/${memberId}/permission-sets/${setId}`, { method: "POST" });
}

/** 멤버 1명에게서 permission set 을 회수합니다. */
export async function revokePermissionSet(memberId: number, setId: number): Promise<void> {
  await getJSON<null>(`/members/${memberId}/permission-sets/${setId}`, { method: "DELETE" });
}

/** 팀 1개의 포지션 자리 전부를 조회합니다. 비어 있는 자리는 member_id 가 null 입니다. */
export async function loadTeamSlots(teamId: number): Promise<TeamSlot[]> {
  const body = await getJSON<{ slots: TeamSlot[] }>(`/teams/${teamId}/slots`);
  return body.slots;
}

/** 포지션 자리 1개에 멤버를 지정합니다. */
export async function seatMember(teamId: number, slotId: number, memberId: number): Promise<void> {
  await getJSON(`/teams/${teamId}/slots/${slotId}`, { method: "PUT", body: JSON.stringify({ member_id: memberId }) });
}

/** 포지션 자리 1개에서 멤버를 해제합니다. 자리는 남습니다. */
export async function unseatMember(teamId: number, slotId: number): Promise<void> {
  await getJSON(`/teams/${teamId}/slots/${slotId}`, { method: "DELETE" });
}

/** 팀 1개를 삭제합니다. */
export async function removeTeam(teamId: number): Promise<void> {
  await getJSON<null>(`/teams/${teamId}`, { method: "DELETE" });
}

/** 합주실 1개를 삭제합니다. 서버가 그 합주실의 예약, 배정 결과, 스케줄링 기록을 함께 삭제합니다(외래 키 CASCADE). */
export async function removeRoom(roomId: number): Promise<void> {
  await getJSON(`/rooms/${roomId}`, { method: "DELETE" });
}

/** 집중 합주기간 1개를 삭제합니다. 서버가 그 기간의 배정 결과, 계산 기록, 스케줄링 기록을 함께 삭제합니다(외래 키 CASCADE). */
export async function removePeriod(periodId: number): Promise<void> {
  await getJSON(`/periods/${periodId}`, { method: "DELETE" });
}

/** 스케줄링 기록 1개의 배정 행과 결과 설명을 조회합니다. savedAt 은 기록 목록이 준 저장 시각 문자열입니다. */
export async function loadRecordRound(periodId: number, savedAt: string): Promise<RecordRound> {
  return getJSON<RecordRound>(`/periods/${periodId}/records/${encodeURIComponent(savedAt)}`);
}

/** 집중 합주기간 1개의 스케줄링 기록 목록을 조회합니다. 기록마다 조회 시점의 불가능 일정으로 매긴 점수가 함께 옵니다. */
export async function loadRecords(periodId: number): Promise<ScheduleRecord[]> {
  const body = await getJSON<{ records: ScheduleRecord[] }>(`/periods/${periodId}/records`);
  return body.records;
}
