import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { AppShell, Card, Panel, Tabs } from "../components/AppShell";
import { Dropdown } from "../components/Dropdown";
import { ChevronLeftIcon, ChevronRightIcon, ClockIcon } from "../components/icons";
import { getJSON, reason } from "../lib/api";
import { currentMonth, slotSteps } from "../lib/calendar";
import { boardListKey, focusedRanges, inRanges, loadReservationRows, loadUnavailable, roomBounds } from "../lib/pipeline";
import { DayDialog } from "./DayDialog";
import { MonthView, WeekView } from "./SchedulerViews";
import {
  allOffEntries, assignedByDay, bookedByDay, ensembleByDay, ensembleOn, listNote, memberCountLabel, offByDay, visibleDays,
} from "../lib/dayEntries";
import { can } from "../lib/account";
import type { DayTab, Entry } from "../lib/dayEntries";
import { teamsOf } from "../lib/roster";
import { useMe, usePeriods, useRooms, useSlotMinutes } from "../components/queries";
import "../styles/scheduler.css";
import type { Post, ScheduleRow } from "../lib/contract";
import { dayLabel, slotCountOf, slotLabel, stampLabel, weekKeys } from "../lib/pipeline";

// 오른쪽 공지 칸에 표시할 최대 줄 수입니다. 전체 목록은 공지 화면(routes/Notices)이 표시합니다.
const RECENT_NOTICES = 3;

/** 여러 기간의 시간표를 한 번에 받아, 실패한 기간은 사유만 모아 둡니다. */
async function loadRows(periodIds: number[]): Promise<{ rows: ScheduleRow[]; failures: string[] }> {
  const rows: ScheduleRow[] = [];
  const failures: string[] = [];
  for (const id of periodIds) {
    try {
      const schedule = await getJSON<{ rows: ScheduleRow[] }>(`/periods/${id}/schedule`);
      rows.push(...schedule.rows);
    } catch (error) {
      failures.push(`기간 ${id}: ${error instanceof Error ? error.message : "알 수 없는 오류"}`);
    }
  }
  return { rows, failures };
}

const TABS: readonly { key: DayTab; text: string }[] = [
  { key: "me", text: "내 일정" },
  { key: "book", text: "예약" },
  { key: "all", text: "전체 일정" },
];

export function Scheduler() {
  const { me, teamIds, teams: allTeams } = useMe();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [tab, setTab] = useState<DayTab>("me");
  const [week, setWeek] = useState(false);
  const [cursor, setCursor] = useState(currentMonth);
  const [weekShift, setWeekShift] = useState(0);
  const [from, setFrom] = useState<number | null>(null);
  const [to, setTo] = useState<number | null>(null);
  const [openDay, setOpenDay] = useState<string | null>(null);

  // 합주실·기간 목록은 배정 여부와 상관없이 달력의 시간·날짜 범위를 결정합니다.
  const rooms = useRooms();
  const periods = usePeriods();
  const periodIds = periods.data?.periods.map((period) => period.id) ?? [];
  const roomIds = rooms.data?.rooms.map((room) => room.id) ?? [];
  // 달력 한 달치 범위입니다. 예약 조회는 기간이 아니라 날짜 범위로 서버에 요청합니다.
  const monthFrom = `${cursor.year}-${String(cursor.month + 1).padStart(2, "0")}-01`;
  const monthLastDay = new Date(cursor.year, cursor.month + 1, 0).getDate();
  const monthTo = `${cursor.year}-${String(cursor.month + 1).padStart(2, "0")}-${String(monthLastDay).padStart(2, "0")}`;
  // 주 보기는 달을 벗어난 주로도 넘어갑니다. 그래서 예약은 달이 아니라 현재 보고 있는
  // 날짜 범위로 요청합니다. 범위가 queryKey 에 들어 있어 주를 옮기면 그 주의 예약을 다시 받습니다.
  const weekDayKeys = weekKeys(cursor.year, cursor.month, weekShift);
  const rangeFrom = week ? weekDayKeys[0] : monthFrom;
  const rangeTo = week ? weekDayKeys[6] : monthTo;

  // 기간 목록이 오기 전에는 어느 기간의 시간표를 받을지 알 수 없어 query를 비활성화합니다.
  const query = useQuery({
    queryKey: ["schedule", periodIds],
    queryFn: () => loadRows(periodIds),
    enabled: periods.data !== undefined,
  });
  // 로그인한 사용자 id가 와야 그 사용자의 불가능 일정을 조회할 수 있습니다.
  const unavailableQuery = useQuery({
    queryKey: ["unavailable", me?.id],
    queryFn: () => loadUnavailable(me?.id ?? 0),
    enabled: me !== null,
  });
  // 합주실 목록이 와야 어느 합주실의 예약을 조회할지 알 수 있습니다.
  const reservationQuery = useQuery({
    queryKey: ["reservations", roomIds, rangeFrom, rangeTo],
    queryFn: () => loadReservationRows(roomIds, rangeFrom, rangeTo),
    enabled: rooms.data !== undefined,
  });
  // 공지 화면(routes/Notices 의 PostBoard)이 사용하는 queryKey 와 endpoint(API의 요청 주소 단위)를 그대로 사용합니다. 두 화면이
  // 같은 목록을 공유하므로, 공지를 작성하고 돌아오면 이 화면도 함께 갱신됩니다.
  const notices = useQuery({
    queryKey: boardListKey("/notices"),
    queryFn: () => getJSON<{ posts: Post[] }>("/notices"),
  });
  const recentNotices = notices.data?.posts.slice(0, RECENT_NOTICES) ?? [];
  const noticeState = listNote(
    notices.isPending, notices.error, recentNotices.length,
    "아직 등록된 공지가 없습니다", "공지를 못 불러왔습니다",
  );

  // 조회 결과가 오기 전에는 ?? 가 매번 새 빈 배열을 만듭니다. 아래 집계의 useMemo 가 그 배열을 의존성으로
  // 받으므로, 배열을 여기서 고정하지 않으면 집계가 렌더마다 다시 실행됩니다.
  const rows = useMemo(() => query.data?.rows ?? [], [query.data]);
  const roomList = useMemo(() => rooms.data?.rooms ?? [], [rooms.data]);
  const periodList = useMemo(() => periods.data?.periods ?? [], [periods.data]);
  const offList = useMemo(() => unavailableQuery.data ?? [], [unavailableQuery.data]);
  const bookRows = useMemo(() => reservationQuery.data?.rows ?? [], [reservationQuery.data]);

  const teams = useMemo(() => teamsOf(rows, teamIds, allTeams), [rows, teamIds, allTeams]);
  const { open, close } = useMemo(() => roomBounds(roomList), [roomList]);
  const focus = focusedRanges(periodList);
  const slotCount = slotCountOf(open, close);
  // 예약 탭의 시작·끝 선택지는 저장소 설정(slot_minutes) 간격입니다.
  const slotMinutes = useSlotMinutes();
  const steps = slotSteps(slotCount, slotMinutes);

  const days = useMemo(() => visibleDays(cursor.year, cursor.month), [cursor.year, cursor.month]);

  const assigned = useMemo(() => assignedByDay(rows, teams, open), [rows, teams, open]);
  const offEntries = useMemo(() => offByDay(offList, open, days), [offList, open, days]);
  const bookEntries = useMemo(
    () => bookedByDay(bookRows, teams, open, me?.id ?? null),
    [bookRows, teams, open, me?.id],
  );
  // 전체합주는 예약 탭에서도 항목에 들어가 그 합주실의 해당 시간을 찬 칸으로 계산합니다. 서버도 그 시간의 예약을 거절합니다.
  const ensembleEntries = useMemo(
    () => ensembleByDay(periodList, roomList, open, days),
    [periodList, roomList, open, days],
  );

  // 배정·전체합주·불가능 일정·예약 네 가지를 날짜별로 합쳐 시작 시각 순으로 정렬합니다.
  // 달력이 날짜마다 entriesOf 를 호출하므로 정렬을 렌더마다 반복하지 않도록 한 번에 계산합니다.
  const entriesByDay = useMemo(() => {
    const merged: Record<string, Entry[]> = {};
    for (const source of [assigned, ensembleEntries, offEntries, bookEntries]) {
      for (const [key, list] of Object.entries(source)) merged[key] = [...(merged[key] ?? []), ...list];
    }
    return Object.fromEntries(
      Object.entries(merged).map(([key, list]) => [key, [...list].sort((x, y) => x.a - y.a)]),
    );
  }, [assigned, ensembleEntries, offEntries, bookEntries]);

  const entriesOf = (key: string): Entry[] => entriesByDay[key] ?? [];

  // POST 가 끝난 뒤 화면이 새 값을 표시하게 합니다. 클라이언트 쪽에 따로 상태를 두지 않고
  // 서버가 가진 값을 다시 조회해 저장이 실제로 되었는지까지 함께 확인합니다.
  const onSaved = () => {
    void queryClient.invalidateQueries({ queryKey: ["unavailable"] });
    void queryClient.invalidateQueries({ queryKey: ["reservations"] });
  };

  const inFocus = (key: string) => inRanges(focus, key);
  const label = (index: number) => slotLabel(index, open);
  const endLabel = (index: number) => (index >= slotCount ? `${close}:00` : label(index));
  const range = from !== null && to !== null ? { from, to } : null;

  // weekKeys 가 일요일부터 7일치 날짜를 반환하므로, 배열의 index 가 곧 요일입니다.
  const weekLabel = weekDayKeys[0].slice(5, 7) === weekDayKeys[6].slice(5, 7)
    ? `${dayLabel(weekDayKeys[0])} – ${Number(weekDayKeys[6].slice(8, 10))}일`
    : `${dayLabel(weekDayKeys[0])} – ${dayLabel(weekDayKeys[6])}`;

  const myTeams = teams.filter((team) => team.mine);
  // 달력 위 화살표 하나가 두 가지를 이동합니다. 달 보기에서는 달을, 주 보기에서는 주를 이동합니다.
  // 달을 이동하면 주는 그 달 15일이 포함된 주로 돌아갑니다(weekShift 를 0 으로 초기화합니다).
  const shift = (step: number) => {
    if (week) {
      setWeekShift(weekShift + step);
      return;
    }
    const moved = new Date(cursor.year, cursor.month + step, 1);
    setCursor({ year: moved.getFullYear(), month: moved.getMonth() });
    setWeekShift(0);
  };

  const viewProps = { tab, teams, entriesOf, openHour: open, slotCount, slotMinutes };

  return (
    <AppShell page="scheduler" current="schedule">
      <Tabs label="레이아웃" items={TABS} selected={tab} onSelect={setTab} />

      {/* 합주실·기간·시간표 중 하나라도 실패하면 성공한 것만 표시하고 첫 실패 사유를
          알립니다. 다시 불러오기는 셋을 한 번에 다시 조회합니다. */}
      {rooms.isError || periods.isError || query.isError ? (
        <div className="cut">
          <p><b>스케줄을 불러오지 못했어요</b>{reason(rooms.error ?? periods.error ?? query.error)}</p>
          <button className="btn warn" onClick={() => { void rooms.refetch(); void periods.refetch(); void query.refetch(); }}>
            다시 불러오기
          </button>
        </div>
      ) : null}

      <Card>
        <div className="calbar">
          <button className="navb" aria-label={week ? "저번 주" : "저번 달"} onClick={() => shift(-1)}>
            <ChevronLeftIcon />
          </button>
          <span className="ml">{week ? weekLabel : `${cursor.year}년 ${cursor.month + 1}월`}</span>
          <button className="navb" aria-label={week ? "다음 주" : "다음 달"} onClick={() => shift(1)}>
            <ChevronRightIcon />
          </button>
          <div className="seg" role="group" aria-label="레이아웃 변경">
            <button aria-pressed={!week} onClick={() => setWeek(false)}>월</button>
            <button aria-pressed={week} onClick={() => setWeek(true)}>주</button>
          </div>
        </div>

        {tab === "book" && !week ? (
          <div className="timebar">
            <div className="fld">
              <label htmlFor="tFrom">시작시간</label>
              <Dropdown
                id="tFrom"
                value={from ?? ""}
                choices={[
                  { value: "" as const, label: "선택 안 함" },
                  ...steps.slice(0, -1).map((slot) => ({ value: slot, label: label(slot) })),
                ]}
                onChange={(next) => setFrom(next === "" ? null : next)}
              />
            </div>
            <div className="fld">
              <label htmlFor="tTo">끝 시간</label>
              <Dropdown
                id="tTo"
                value={to ?? ""}
                choices={[
                  { value: "" as const, label: "선택 안 함" },
                  ...steps.slice(1).map((slot) => ({ value: slot, label: endLabel(slot) })),
                ]}
                onChange={(next) => setTo(next === "" ? null : next)}
              />
            </div>
            <button className="clear" onClick={() => { setFrom(null); setTo(null); }}>시간 선택 취소</button>
            <span className="state">
              {range === null
                ? "지정한 시간에 예약이 가능한 날짜만 표시해요"
                : `${label(range.from)}–${endLabel(range.to)} 해당 시간으로 예약할 날짜를 눌러주세요`}
            </span>
          </div>
        ) : null}

        <div id="body">
          {week
            ? <WeekView dayKeys={weekDayKeys} closeHour={close} {...viewProps} />
            : <MonthView year={cursor.year} month={cursor.month} range={range} inFocus={inFocus} onOpen={setOpenDay} {...viewProps} />}
        </div>

        <div className="cardfoot">
          <div className="legend">
            {teams.filter((team) => tab !== "me" || team.mine).map((team) => (
              <span key={team.id}><i style={{ background: `var(--${team.key})` }} />{team.name}</span>
            ))}
            {periodList.some((period) => period.ensemble !== null)
              ? <span><i className="ens" />전체합주</span>
              : null}
            {tab === "me" ? <span><i style={{ background: "var(--off)" }} />나의 불가능 일정</span> : null}
          </div>
          <div id="bandSlot">
            {focus.length === 0 ? null : (
              <span className="band"><ClockIcon />집중합주 기간 <b>{focus.map((range) => `${range.from} ~ ${range.to ?? "매일"}`).join(", ")}</b> · 자동 스케줄링</span>
            )}
          </div>
        </div>
      </Card>

      {/* 알림은 상단바의 알림 아이콘으로 옮겼습니다. 이 칸은 달력을 보는 동안에만 표시되어
          게시판이나 설정 화면에 있는 사용자에게는 알림이 표시되지 않았습니다. */}
      <div className="rail">
        <Panel title="공지사항" hint="전체보기 ›" onOpen={() => void navigate("/notices")}>
          {/* 이 칸에서는 제목만 표시하고, 클릭하면 글 본문을 볼 수 있는 공지 화면으로 이동합니다. */}
          <ul>
            {noticeState !== "" ? (
              <li><button type="button" disabled><b>{noticeState}</b></button></li>
            ) : recentNotices.map((post) => (
              <li key={post.id}>
                <button type="button" onClick={() => void navigate("/notices")}>
                  <b>{post.title}</b>
                  <small>{stampLabel(post.created_at)} · {post.author}</small>
                </button>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="내 팀" hint="전체보기 ›" onOpen={() => void navigate("/teams")}>
          <ul>
            {myTeams.map((team) => (
              <li key={team.id}>
                <button className="teamrow" onClick={() => void navigate("/teams")}>
                  <i style={{ background: `var(--${team.key})` }} />
                  <b>{team.name}</b>
                  <small>{memberCountLabel(allTeams, team.id)}</small>
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      {openDay === null ? null : (
        <DayDialog
          dayKey={openDay}
          tab={tab}
          teams={teams}
          entries={entriesOf(openDay)}
          myOff={allOffEntries(unavailableQuery.data ?? [], open)}
          openHour={open}
          closeHour={close}
          slotCount={slotCount}
          fixed={range}
          inFocus={inFocus(openDay)}
          ensemble={ensembleOn(periodList, openDay)}
          canEditEnsemble={can(me, "period_edit")}
          memberId={me?.id ?? null}
          myName={me?.name ?? ""}
          rooms={rooms.data?.rooms ?? []}
          onSaved={onSaved}
          onClose={() => setOpenDay(null)}
        />
      )}
    </AppShell>
  );
}
