// 매뉴얼 그림에 담길 데이터를 만듭니다. 캡쳐를 시작하기 전에 1번 실행됩니다.
//
// e2e-api 가 뜰 때 banblit_e2e DB 를 비우므로(backend/scripts/reset_e2e_db.py) 여기가 저장소의
// 첫 가입입니다. 첫 계정은 관리자코드를 넣어 권한 20개를 전부 받습니다. 그 계정으로 캡쳐하는
// 이유는 관리자 화면(배정 결과 확인·설정의 멤버·예약·블라인드 탭)이 권한 없이는 렌더링되지 않기 때문입니다.
//
// 만드는 데이터는 아래 상수에 전부 있습니다. 그림에 나오는 이름·팀·날짜를 변경하려면
// 이 파일의 상수만 수정합니다.
import { request } from "@playwright/test";
import type { APIRequestContext, FullConfig } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { STATE_PATH } from "./config";

/** docker-compose.override.yml 의 e2e-api 가 ADMIN_SIGNUP_CODE 로 받는 값과 같아야 합니다. */
const ADMIN_CODE = "e2e-admin-code";

const PASSWORD = "Banblit-Manual1!";
const RUN_TIMES = { first_run_at: "09:00", second_run_at: "21:00" };

const JOB_POLL_MS = 500;
const JOB_WAIT_MS = 60_000;

/** 캡쳐에 사용하는 계정입니다. 관리자코드로 가입하므로 권한 항목을 전부 받습니다. */
const ADMIN = {
  name: "김반블",
  department: "실용음악과",
  student_no: "20210114",
  email: "manual-admin@banblit.test",
  login_id: "manualadmin",
  password: PASSWORD,
  cohort: 44,
} as const;

/** 권한이 없는 멤버 9명입니다. 명단·팀 자리·예약자 이름으로 그림에 표시됩니다. */
const MEMBERS = [
  { name: "이도현", department: "실용음악과", student_no: "20210207", cohort: 44 },
  { name: "박서준", department: "컴퓨터공학과", student_no: "20220311", cohort: 45 },
  { name: "최유진", department: "성악과", student_no: "20220422", cohort: 45 },
  { name: "정하늘", department: "작곡과", student_no: "20230105", cohort: 46 },
  { name: "강민서", department: "경영학과", student_no: "20230218", cohort: 46 },
  { name: "윤지호", department: "실용음악과", student_no: "20230329", cohort: 46 },
  { name: "임수아", department: "시각디자인과", student_no: "20240112", cohort: 47 },
  { name: "한결", department: "기계공학과", student_no: "20240225", cohort: 47 },
  { name: "오예린", department: "실용음악과", student_no: "20240308", cohort: 47 },
] as const;

// 합주실은 1개만 둡니다. 화면이 등록된 합주실이 0개일 때만 추가 버튼을 표시하므로
// (frontend/src/routes/SettingsRooms.tsx), 2개 이상인 상태는 사용자가 만들 수 없는 상태입니다.
const ROOMS = [{ name: "제1합주실", opens_at: "18:00", closes_at: "23:00" }] as const;

/** 팀 구성입니다. slots 의 자리 수 합만큼 멤버가 순서대로 배정됩니다. */
const TEAMS = [
  { name: "새벽 네시", color: "indigo", slots: { 보컬: 1, 일렉: 1, 베이스: 1, 드럼: 1 } },
  { name: "소음공해", color: "tomato", slots: { 보컬: 1, 일렉: 2, 베이스: 1, 드럼: 1 } },
  { name: "미드나잇", color: "jade", slots: { 보컬: 1, 통기타: 1, 베이스: 1, 드럼: 1 } },
  { name: "플러그인", color: "amber", slots: { 보컬: 1, 일렉: 1, 신디: 1, 베이스: 1, 드럼: 1 } },
  { name: "루프스테이션", color: "purple", slots: { 보컬: 1, 일렉: 1, 베이스: 1, 드럼: 1 } },
] as const;

const NOTICES = [
  {
    title: "2학기 정기공연 일정 안내",
    body: "<p>정기공연은 12월 13일 토요일 오후 6시, 학생회관 대강당에서 진행합니다.</p><p>팀마다 3곡까지 올릴 수 있고, 곡 목록은 11월 30일까지 팀 게시판에 올려주세요.</p>",
  },
  {
    title: "집중 합주기간 합주실 사용 규칙",
    body: "<p>집중 합주기간에는 예약을 받지 않습니다. 배정된 시간만 사용해주세요.</p><p>앰프 전원은 마지막 팀이 내리고, 드럼 스틱은 가져가지 않습니다.</p>",
  },
  {
    title: "신입 기수 포지션 모집",
    body: "<p>47기 신입 멤버를 모집합니다. 보컬 2명, 베이스 1명, 드럼 1명입니다.</p><p>지원은 팀 찾기 화면에서 자리를 확인한 뒤 팀장에게 연락해주세요.</p>",
  },
] as const;

const TEAM_POSTS = [
  {
    title: "이번 주 합주 곡 순서",
    body: "<p>1. 소나기 2. 밤편지 3. 미드나잇 블루스 순서로 맞춰보겠습니다.</p>",
    comments: ["베이스 라인 2절부터 바꿔서 갈게요.", "드럼 인트로 4마디 늘리는 건 어때요?"],
  },
  {
    title: "합주실 앰프 세팅값 기록",
    body: "<p>게인 6, 베이스 5, 미들 7, 트레블 6 으로 맞췄습니다. 다음 합주 때 이대로 시작하면 됩니다.</p>",
    comments: ["기록 감사합니다."],
  },
  {
    title: "다음 주 불가능 시간 공유",
    body: "<p>저는 화요일 저녁에 수업이 있어 어렵습니다. 다른 분들도 대시보드에 불가능 일정 등록해주세요.</p>",
    comments: [],
  },
] as const;

type Method = "GET" | "POST" | "PUT" | "PATCH";
type Job = {
  id: string;
  status: "queued" | "running" | "done" | "failed";
  result: { saved: boolean } | null;
  error: string | null;
};

/** 오늘부터 offset 일 뒤의 날짜를 "2026-10-05" 형식으로 반환합니다. */
function day(offset: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** 멤버의 로그인 아이디입니다. 아이디는 영어 소문자와 숫자 4~20자만 받습니다
 *  (backend/src/backend/services/validation/input.py 의 LOGIN_ID_PATTERN). */
function memberLoginId(studentNo: string): string {
  return `manual${studentNo}`;
}

/** "2026-10-05" 가 속한 요일 1개만 켠 반복 요일 값입니다. 월요일 1, 화요일 2 … 일요일 64 입니다
 *  (frontend/src/lib/contract.ts 의 Unavailable.repeat_weekdays). */
function weekdayBit(dayKey: string): number {
  return 1 << ((new Date(`${dayKey}T12:00:00`).getDay() + 6) % 7);
}

/** 요청이 실패하면 응답 본문을 담아 멈춥니다. 데이터가 절반만 들어간 상태로 캡쳐하지 않습니다. */
async function call<T>(
  context: APIRequestContext, method: Method, url: string, data?: unknown,
): Promise<T> {
  const response = await context.fetch(url, { method, data });
  if (!response.ok()) {
    throw new Error(`${method} ${url} 가 ${response.status()} 로 실패했습니다: ${await response.text()}`);
  }
  // 204 는 본문이 없습니다. json() 을 부르면 파싱에서 실패합니다.
  if (response.status() === 204) return undefined as T;
  return (await response.json()) as T;
}

async function waitForJob(context: APIRequestContext, jobId: string): Promise<Job> {
  const deadline = Date.now() + JOB_WAIT_MS;
  while (Date.now() < deadline) {
    const { job } = await call<{ job: Job }>(context, "GET", `/api/jobs/${jobId}`);
    if (job.status === "done" || job.status === "failed") return job;
    await new Promise((resolve) => setTimeout(resolve, JOB_POLL_MS));
  }
  throw new Error(`배정 계산 ${jobId} 가 ${JOB_WAIT_MS}ms 안에 끝나지 않았습니다`);
}

/** 가입 응답의 cookie 가 캡쳐 계정의 로그인을 덮어쓰지 않도록 context 를 따로 만들어 가입시킵니다.
 *
 *  요청마다 X-Forwarded-For 를 다른 값으로 보냅니다. 가입 endpoint 의 rate limit 이 1시간에 5회이고
 *  (backend/api/routers/auth.py 의 `_signup_guard`) 매뉴얼은 계정 10개가 필요한데, 서버는 reverse proxy
 *  뒤에 있을 때 이 header 의 값을 요청자로 셉니다(backend/api/rate_limit.py 의 `caller_of`).
 *  대상은 캡쳐 전용 DB(banblit_e2e)이고 매 실행마다 비워집니다. */
async function signUp(baseURL: string | undefined, callerIp: string, body: unknown): Promise<{ id: number }> {
  const separate = await request.newContext({
    baseURL, extraHTTPHeaders: { "x-forwarded-for": callerIp },
  });
  try {
    const { account } = await call<{ account: { id: number } }>(separate, "POST", "/api/signup", body);
    return account;
  } finally {
    await separate.dispose();
  }
}

type Slot = { id: number; instrument: string; ordinal: number };

/** 팀을 만들고 자리마다 멤버를 1명씩 지정합니다. 자리 수보다 멤버가 적으면 남은 자리는 비워 둡니다. */
async function createTeam(
  context: APIRequestContext,
  team: { name: string; color: string; slots: Record<string, number> },
  memberIds: number[],
): Promise<{ id: number }> {
  const { team: created } = await call<{ team: { id: number } }>(context, "POST", "/api/teams", {
    name: team.name, slots: team.slots, color: team.color,
  });
  const { slots } = await call<{ slots: Slot[] }>(context, "GET", `/api/teams/${created.id}/slots`);
  const assignments = slots
    .map((slot, index) => ({ slot_id: slot.id, member_id: memberIds[index] ?? null }))
    .filter((row) => row.member_id !== null);
  await call(context, "PUT", `/api/teams/${created.id}/slot-members`, { assignments });
  return created;
}

export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0].use.baseURL;
  const context = await request.newContext({ baseURL });
  try {
    // 가입이 거절되면 이 DB 에 이미 매뉴얼 데이터가 있는 것입니다. 로그인만 하고 생성을 건너뜁니다 —
    // 원고나 강조 표시만 고쳐 다시 캡쳐할 때 데이터를 매번 다시 만들지 않기 위해서입니다.
    // 데이터를 처음부터 다시 만들려면 COMMAND.md 15-1 의 첫 줄로 e2e-api 를 다시 만듭니다.
    const signedUp = await call<{ account: { id: number } }>(
      context, "POST", "/api/signup", { ...ADMIN, admin_code: ADMIN_CODE },
    ).catch(() => null);
    if (signedUp === null) {
      await call(context, "POST", "/api/login", { login_id: ADMIN.login_id, password: ADMIN.password });
      console.warn("이미 만들어 둔 매뉴얼 데이터를 그대로 사용합니다. 다시 만들려면 e2e-api 를 force-recreate 하세요.");
      mkdirSync(dirname(STATE_PATH), { recursive: true });
      await context.storageState({ path: STATE_PATH });
      return;
    }
    const admin = signedUp.account;

    const members: { id: number; name: string }[] = [];
    for (const [index, person] of MEMBERS.entries()) {
      const created = await signUp(baseURL, `10.9.0.${index + 1}`, {
        ...person, email: `manual-${person.student_no}@banblit.test`, login_id: memberLoginId(person.student_no),
        password: PASSWORD,
      });
      members.push({ id: created.id, name: person.name });
    }

    const rooms: { id: number; name: string }[] = [];
    for (const room of ROOMS) {
      const { room: created } = await call<{ room: { id: number; name: string } }>(
        context, "POST", "/api/rooms", room,
      );
      rooms.push(created);
    }

    // 캡쳐 계정이 1번째 팀의 보컬 자리에 들어갑니다. 그 팀이 "내 팀"·팀 게시판의 대상입니다.
    const everyone = [admin.id, ...members.map((member) => member.id)];
    const teams: { id: number; name: string }[] = [];
    for (const [index, team] of TEAMS.entries()) {
      const seatCount = Object.values(team.slots).reduce((sum, count) => sum + count, 0);
      // 팀마다 시작 위치를 옮겨 같은 사람이 모든 팀의 같은 포지션에 들어가지 않게 합니다.
      const picked = Array.from({ length: seatCount }, (_, seat) => {
        const offset = index === 0 ? 0 : index * 2;
        return everyone[(offset + seat) % everyone.length];
      });
      const unique = [...new Set(index === 0 ? [admin.id, ...picked.slice(1)] : picked)];
      teams.push(await createTeam(context, team, unique));
    }

    // 자율 합주기간입니다. 예약을 받는 기간이고 자동 배정은 실행되지 않습니다.
    await call(context, "POST", "/api/periods", {
      kind: "open", starts_on: day(-7), ends_on: day(30), everyday: false, ...RUN_TIMES,
    });

    // 집중 합주기간 1 — 배정을 계산해 저장합니다. 달력과 배정 결과 화면에 시간표로 표시됩니다.
    const { period: focused } = await call<{ period: { id: number } }>(context, "POST", "/api/periods", {
      kind: "focused", name: "정기공연", starts_on: day(2), ends_on: day(6), everyday: false, ...RUN_TIMES,
    });
    // 기간 가운데 1일을 전체 합주로 지정합니다. 그날은 팀별 배정에서 제외됩니다.
    await call(context, "PUT", `/api/periods/${focused.id}/ensemble`, {
      starts_on: day(4), ends_on: day(4), room_id: rooms[0].id, starts_at: "19:00", ends_at: "21:00",
    });
    const assignBody = { team_ids: teams.map((team) => team.id), room_ids: rooms.map((room) => room.id) };
    const { job } = await call<{ job: Job }>(context, "POST", `/api/periods/${focused.id}/assign`, assignBody);
    const finished = await waitForJob(context, job.id);
    if (finished.result?.saved !== true) {
      throw new Error(`집중 합주기간 1 의 배정이 저장되지 않았습니다: ${finished.error ?? "조율안만 출력됨"}`);
    }

    // 집중 합주기간 2 — 캡쳐 계정이 합주실이 여는 시간 전체에 불가능 일정을 두어, 계산하면
    // 조율안(그 계정을 제외한 배정안)이 출력됩니다. 배정 결과 화면의 조율안 설명에 사용합니다.
    const { period: tight } = await call<{ period: { id: number } }>(context, "POST", "/api/periods", {
      kind: "focused", name: "신입 환영회", starts_on: day(9), ends_on: day(10), everyday: false, ...RUN_TIMES,
    });
    for (const offset of [9, 10]) {
      await call(context, "POST", `/api/members/${admin.id}/unavailable`, {
        starts_at: `${day(offset)}T18:00:00`,
        ends_at: `${day(offset)}T23:00:00`,
        name: "학과 공연 준비",
        reason: "학과 공연 리허설",
      });
    }
    const { job: tightJob } = await call<{ job: Job }>(
      context, "POST", `/api/periods/${tight.id}/assign`, assignBody,
    );
    await waitForJob(context, tightJob.id);

    // 캡쳐 계정의 불가능 일정입니다. 반복 1건을 포함합니다.
    await call(context, "POST", `/api/members/${admin.id}/unavailable`, {
      starts_at: `${day(1)}T13:00:00`, ends_at: `${day(1)}T17:00:00`,
      name: "아르바이트", reason: "평일 오후 고정",
    });
    await call(context, "POST", `/api/members/${admin.id}/unavailable`, {
      starts_at: `${day(7)}T19:00:00`, ends_at: `${day(7)}T21:00:00`,
      repeat_weekdays: weekdayBit(day(7)), name: "전공 실기", reason: "매주 같은 시각",
    });

    // 다른 멤버의 불가능 일정입니다. 관리자 메뉴의 불가능 일정 화면이 "전체 멤버" 를 표시하므로,
    // 캡쳐 계정 1명의 일정만 있으면 그 화면이 무엇을 보여주는지 그림에서 드러나지 않습니다.
    // 등록은 본인만 할 수 있어 그 멤버로 로그인한 context 를 따로 만듭니다.
    for (const [index, person] of MEMBERS.slice(0, 2).entries()) {
      const asMember = await request.newContext({ baseURL });
      try {
        await call(asMember, "POST", "/api/login", {
          login_id: memberLoginId(person.student_no), password: PASSWORD,
        });
        await call(asMember, "POST", `/api/members/${members[index].id}/unavailable`, {
          starts_at: `${day(3)}T18:00:00`, ends_at: `${day(3)}T20:00:00`,
          name: index === 0 ? "교양 수업" : "학과 MT",
          reason: index === 0 ? "화요일마다" : "1박 2일",
        });
        // 관리자 메뉴의 예약 화면에서 다른 멤버의 예약에 붙는 반려 버튼을 보이려고, 첫 멤버가 개인 연습을 1건 예약합니다.
        if (index === 0) {
          await call(asMember, "POST", "/api/reservations", {
            room_id: rooms[0].id, team_id: null, name: "개인 연습",
            starts_at: `${day(11)}T20:00:00`, ends_at: `${day(11)}T21:00:00`,
          });
        }
      } finally {
        await asMember.dispose();
      }
    }

    // 예약입니다. 집중 합주기간 바깥 날짜에만 생성됩니다.
    await call(context, "POST", "/api/reservations", {
      room_id: rooms[0].id, team_id: teams[0].id, name: teams[0].name,
      starts_at: `${day(1)}T20:00:00`, ends_at: `${day(1)}T22:00:00`,
    });
    await call(context, "POST", "/api/reservations", {
      room_id: rooms[0].id, team_id: null, name: "개인 연습",
      starts_at: `${day(8)}T18:00:00`, ends_at: `${day(8)}T19:00:00`,
    });

    for (const notice of NOTICES) {
      await call(context, "POST", "/api/notices", notice);
    }

    let lastPostId = 0;
    for (const post of TEAM_POSTS) {
      const { post: created } = await call<{ post: { id: number } }>(
        context, "POST", `/api/teams/${teams[0].id}/posts`, { title: post.title, body: post.body },
      );
      lastPostId = created.id;
      for (const comment of post.comments) {
        await call(context, "POST", `/api/posts/${created.id}/comments`, { body: comment });
      }
    }
    // 글 1개를 가립니다. 관리자 메뉴의 블라인드 화면이 빈 목록이 아니라 실제 줄을 표시하게 하기 위해서입니다.
    await call(context, "PUT", `/api/posts/${lastPostId}/blind`, {});

    mkdirSync(dirname(STATE_PATH), { recursive: true });
    await context.storageState({ path: STATE_PATH });
  } finally {
    await context.dispose();
  }
}
