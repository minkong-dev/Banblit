import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { Card, Panel, Tabs } from "../components/Layout";
import { Dropdown } from "../components/Dropdown";
import { Button } from "../components/controls";
import { CalendarBar, useCalendarCursor } from "../components/CalendarBar";
import type { CalendarCursor } from "../components/CalendarBar";
import { ClockIcon } from "../components/icons";
import { firstWhy } from "../lib/loading";
import { monthRange, slotLabels, slotSteps } from "../lib/calendar";
import { loadMyBookings, loadReservationRows, loadScheduleRows, loadUnavailable } from "../lib/pipeline";
import { BookDialog, DayView, OffDialog } from "./DayDialog";
import type { DayProps } from "./DayDialog";
import { MonthView, WeekView } from "../components/CalendarViews";
import {
  allBookedEntries, allOffEntries, assignedByDay, bookedByDay, ensembleByDay, ensembleOn, listNote, memberCountLabel, mergeByDay, offByDay, visibleDays,
} from "../lib/dayEntries";
import { can } from "../lib/account";
import type { DayTab, Entry } from "../lib/dayEntries";
import { teamsOf } from "../lib/roster";
import {
  ME_KEY, MY_BOOKINGS_KEY, PERIODS_KEY, RESERVATIONS_KEY, ROOMS_KEY, SCHEDULE_KEY, UNAVAILABLE_KEY,
  memberUnavailableKey, roomReservationsKey, scheduleKey, useMe, useMyTeams, usePeriods, usePosts, useRooms, useSlotMinutes,
} from "../components/queries";
import "../styles/scheduler.css";
import { focusedRanges, inRanges, roomBounds, slotCountOf, stampLabel } from "../lib/calendar";
// 오른쪽 공지 칸에 표시할 최대 줄 수입니다. 전체 목록은 공지 화면(routes/Notices)이 표시합니다.
const RECENT_NOTICES = 3;

const TABS: readonly { key: DayTab; text: string }[] = [
  { key: "me", text: "내 일정" },
  { key: "book", text: "예약" },
  { key: "all", text: "전체 일정" },
];

/** 달력이 쓰는 서버 조회 6개와 날짜별 집계입니다. 조회 결과가 오기 전에는 빈 배열을 useMemo 로 고정해 집계가 렌더마다 다시 실행되지 않게 합니다. */
function useSchedulerData(cursor: CalendarCursor) {
  const { me, meState, teamIds, teams: allTeams } = useMe();
  const queryClient = useQueryClient();
  const { week, weekDayKeys } = cursor;

  // 합주실, 기간 목록은 배정 여부와 상관없이 달력의 시간, 날짜 범위를 결정합니다.
  const rooms = useRooms();
  const periods = usePeriods();
  const periodIds = periods.data?.periods.map((period) => period.id) ?? [];
  const roomIds = rooms.data?.rooms.map((room) => room.id) ?? [];
  // 달력 한 달치 범위입니다. 예약 조회는 기간이 아니라 날짜 범위로 서버에 요청합니다.
  const month = monthRange(cursor.year, cursor.month);
  // 주 보기는 달을 벗어난 주로도 넘어갑니다. 그래서 예약은 달이 아니라 현재 보고 있는
  // 날짜 범위로 요청합니다. 범위가 queryKey 에 들어 있어 주를 옮기면 그 주의 예약을 다시 받습니다.
  const rangeFrom = week ? weekDayKeys[0] : month.from;
  const rangeTo = week ? weekDayKeys[6] : month.to;

  // 기간 목록이 오기 전에는 어느 기간의 시간표를 받을지 알 수 없어 query 를 비활성화합니다.
  const query = useQuery({
    queryKey: scheduleKey(periodIds),
    queryFn: () => loadScheduleRows(periodIds),
    enabled: periods.data !== undefined,
  });
  // 로그인한 사용자 id 가 와야 그 사용자의 불가능 일정을 조회할 수 있습니다.
  const unavailableQuery = useQuery({
    queryKey: memberUnavailableKey(me?.id),
    queryFn: () => loadUnavailable(me?.id ?? 0),
    enabled: me !== null,
  });
  // 합주실 목록이 와야 어느 합주실의 예약을 조회할지 알 수 있습니다.
  const reservationQuery = useQuery({
    queryKey: roomReservationsKey(roomIds, rangeFrom, rangeTo),
    queryFn: () => loadReservationRows(roomIds, rangeFrom, rangeTo),
    enabled: rooms.data !== undefined,
  });
  // 예약 모달 오른쪽 "내 예약" 목록입니다. 달력 범위와 관계없이 아직 끝나지 않은 내 예약 전부입니다.
  // queryKey 가 "reservations" 로 시작해서, 예약, 취소 후 RESERVATIONS_KEY 를 무효로 할 때 함께 다시 받습니다.
  const myBookingsQuery = useQuery({ queryKey: MY_BOOKINGS_KEY, queryFn: loadMyBookings });

  // 조회 결과가 오기 전에는 ?? 가 매번 새 빈 배열을 만듭니다. 아래 집계의 useMemo 가 그 배열을 의존성으로
  // 받으므로, 배열을 여기서 고정하지 않으면 집계가 렌더마다 다시 실행됩니다.
  const rows = useMemo(() => query.data?.rows ?? [], [query.data]);
  const roomList = useMemo(() => rooms.data?.rooms ?? [], [rooms.data]);
  const periodList = useMemo(() => periods.data?.periods ?? [], [periods.data]);
  const offList = useMemo(() => unavailableQuery.data ?? [], [unavailableQuery.data]);
  const bookRows = useMemo(() => reservationQuery.data?.rows ?? [], [reservationQuery.data]);

  // /me 가 실패하면 불가능 일정, 예약 조회가 enabled 조건에 걸려 영구히 대기하므로 그 사유를
  // 먼저 표시합니다. 나머지 여섯 조회는 실패해도 위 ?? 가 빈 배열을 주어 화면이 "등록된 일정이
  // 없음" 과 같아지므로, firstWhy 로 처음 실패한 사유를 찾습니다.
  const loadWhy = meState.kind === "failed"
    ? meState.why
    : firstWhy([
      rooms.error, periods.error, query.error,
      unavailableQuery.error, reservationQuery.error, myBookingsQuery.error,
    ]);
  const failures = query.data?.failures ?? [];
  // refetch 가 아니라 invalidateQueries 를 씁니다. refetch 는 enabled 를 무시하고 queryFn 을
  // 실행하므로 /me 나 목록 조회가 실패한 상태에서도 멤버 0번, 빈 배열로 요청이 나갑니다.
  // invalidateQueries 는 enabled 가 false 인 조회를 다시 받지 않고, 선행 조회가 성공한 뒤에
  // 받습니다. queryKey 는 앞부분만 같아도 함께 무효화되므로 RESERVATIONS_KEY 하나가
  // 달력 예약과 "내 예약" 둘을 포함합니다.
  const refreshAll = (): void => {
    for (const queryKey of [ME_KEY, ROOMS_KEY, PERIODS_KEY, SCHEDULE_KEY, UNAVAILABLE_KEY, RESERVATIONS_KEY]) {
      void queryClient.invalidateQueries({ queryKey });
    }
  };
  const refreshSchedule = (): void => { void queryClient.invalidateQueries({ queryKey: SCHEDULE_KEY }); };
  // POST 가 끝난 뒤 화면이 새 값을 표시하게 합니다. 클라이언트 쪽에 따로 상태를 두지 않고
  // 서버가 가진 값을 다시 조회해 저장이 실제로 되었는지까지 함께 확인합니다.
  const onSaved = (): void => {
    void queryClient.invalidateQueries({ queryKey: UNAVAILABLE_KEY });
    void queryClient.invalidateQueries({ queryKey: RESERVATIONS_KEY });
  };

  const teams = useMemo(() => teamsOf(rows, teamIds, allTeams), [rows, teamIds, allTeams]);
  const { open, close } = useMemo(() => roomBounds(roomList), [roomList]);
  const focus = focusedRanges(periodList);
  const slotCount = slotCountOf(open, close);
  // 예약 탭의 시작, 끝 선택지는 저장소 설정(slot_minutes) 간격입니다.
  const slotMinutes = useSlotMinutes();
  const steps = slotSteps(slotCount, slotMinutes);

  const days = useMemo(() => visibleDays(cursor.year, cursor.month), [cursor.year, cursor.month]);

  const assigned = useMemo(() => assignedByDay(rows, teams, open), [rows, teams, open]);
  const offEntries = useMemo(() => offByDay(offList, open, days), [offList, open, days]);
  const bookEntries = useMemo(
    () => bookedByDay(bookRows, teams, open, me?.id ?? null),
    [bookRows, teams, open, me?.id],
  );
  // 전체 합주는 예약 탭에서도 항목에 들어가 그 합주실의 해당 시간을 이미 예약된 slot 으로 계산합니다. 서버도 그 시간의 예약을 거절합니다.
  const ensembleEntries = useMemo(
    () => ensembleByDay(periodList, roomList, open, days),
    [periodList, roomList, open, days],
  );

  // 배정, 전체 합주, 불가능 일정, 예약 네 가지를 날짜별로 합칩니다. 달력이 날짜마다 entriesOf 를
  // 호출하므로 정렬을 렌더마다 반복하지 않도록 한 번에 계산합니다.
  const entriesByDay = useMemo(
    () => mergeByDay(assigned, ensembleEntries, offEntries, bookEntries),
    [assigned, ensembleEntries, offEntries, bookEntries],
  );
  const entriesOf = (key: string): Entry[] => entriesByDay[key] ?? [];

  return {
    me, meState, teams, roomList, periodList, open, close, focus, slotCount, slotMinutes, steps,
    loadWhy, failures, refreshAll, refreshSchedule, onSaved, entriesOf,
    myOff: unavailableQuery.data ?? [],
    myBookings: myBookingsQuery.data ?? [],
  };
}

/** 예약 탭 달 보기의 시작 시간, 종료 시간 선택 줄입니다. 둘 다 지정하면 range 가 되고, 달력은 그 시간에 예약할 수 있는 날짜만 누를 수 있게 표시합니다. */
function TimeBar({ steps, label, endLabel, from, to, range, onFrom, onTo }: {
  steps: number[];
  label: (slot: number) => string;
  endLabel: (slot: number) => string;
  from: number | null;
  to: number | null;
  range: { from: number; to: number } | null;
  onFrom: (next: number | null) => void;
  onTo: (next: number | null) => void;
}) {
  return (
    <div className="timebar">
      <div className="fld">
        <label htmlFor="tFrom">시작 시간</label>
        <Dropdown
          id="tFrom"
          value={from ?? ""}
          choices={[
            { value: "" as const, label: "선택 안 함" },
            ...steps.slice(0, -1).map((slot) => ({ value: slot, label: label(slot) })),
          ]}
          onChange={(next) => onFrom(next === "" ? null : next)}
        />
      </div>
      <div className="fld">
        <label htmlFor="tTo">종료 시간</label>
        <Dropdown
          id="tTo"
          value={to ?? ""}
          choices={[
            { value: "" as const, label: "선택 안 함" },
            ...steps.slice(1).map((slot) => ({ value: slot, label: endLabel(slot) })),
          ]}
          onChange={(next) => onTo(next === "" ? null : next)}
        />
      </div>
      <button className="clear" onClick={() => { onFrom(null); onTo(null); }}>시간 선택 취소</button>
      <span className="state">
        {range === null
          ? "지정한 시간에 예약이 가능한 날짜만 표시해요"
          : `${label(range.from)}–${endLabel(range.to)} 해당 시간으로 예약할 날짜를 눌러주세요`}
      </span>
    </div>
  );
}

/** 달력 오른쪽 칸(rail)입니다. 최근 공지 RECENT_NOTICES 개와 소속 팀 전부를 표시합니다. */
function SchedulerRail() {
  const navigate = useNavigate();
  const { teams: allTeams } = useMe();
  // 공지 화면(routes/Notices 의 PostBoard)과 같은 조회(usePosts)라 공지를 작성하고 돌아오면 이 칸도 함께 갱신됩니다.
  const notices = usePosts("/notices");
  const recentNotices = notices.data?.slice(0, RECENT_NOTICES) ?? [];
  const noticeState = listNote(
    notices.isPending, notices.error, recentNotices.length,
    "아직 등록된 공지가 존재하지 않아요", "공지를 불러오지 못했어요",
  );
  // 소속된 팀 전부입니다. 달력의 teams 는 배정 일정에 나온 팀만 담고 있어, 아직 일정이 없는 팀이 빠집니다.
  const myTeams = useMyTeams();

  return (
    <div className="rail">
      <Panel title="공지사항" hint="전체보기 ›" onOpen={() => void navigate("/notices")}>
        {/* 이 칸에서는 제목만 표시하고, 클릭하면 글 본문을 볼 수 있는 공지 화면으로 이동합니다. */}
        <ul>
          {noticeState !== "" ? (
            <li><button type="button" disabled><b>{noticeState}</b></button></li>
          ) : recentNotices.map((post) => (
            <li key={post.id}>
              <button type="button" onClick={() => void navigate(`/notices/${post.id}`)}>
                <b>{post.title}</b>
                <small>{stampLabel(post.created_at)} {post.author}</small>
              </button>
            </li>
          ))}
        </ul>
      </Panel>
      <Panel title="내 팀" hint="전체보기 ›" onOpen={() => void navigate("/teams")}>
        <ul>
          {myTeams.map((team) => (
            <li key={team.id}>
              <button className="teamrow" onClick={() => void navigate(`/board/${team.id}`)}>
                <i style={{ background: `var(--${team.colorKey})` }} />
                <b>{team.name}</b>
                <small>{memberCountLabel(allTeams, team.id)}</small>
              </button>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

export function Scheduler() {
  const [tab, setTab] = useState<DayTab>("me");
  const cursor = useCalendarCursor();
  const { week, weekDayKeys } = cursor;
  // 예약 탭의 시작 시간, 종료 시간입니다. 탭을 옮겨도 유지됩니다.
  const [from, setFrom] = useState<number | null>(null);
  const [to, setTo] = useState<number | null>(null);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const data = useSchedulerData(cursor);
  const { me, teams, roomList, periodList, open, close, focus, slotCount, slotMinutes, entriesOf } = data;

  const inFocus = (key: string) => inRanges(focus, key);
  // 날짜 modal 3개(DayView, OffDialog, BookDialog)가 함께 받는 값입니다.
  const dayProps = (day: string): DayProps => ({
    dayKey: day,
    teams,
    entries: entriesOf(day),
    openHour: open,
    closeHour: close,
    slotCount,
    inFocus: inFocus(day),
    ensemble: ensembleOn(periodList, day),
    canEditEnsemble: can(me, "period_edit"),
    rooms: roomList,
    onClose: () => setOpenDay(null),
  });
  const { label, endLabel } = slotLabels(open, close, slotCount);
  const range = from !== null && to !== null ? { from, to } : null;

  const viewProps = { tab, teams, entriesOf, openHour: open, slotCount, slotMinutes };

  return (
    <>
      <Tabs label="레이아웃" items={TABS} selected={tab} onSelect={setTab} />

      {/* 조회 일곱 개 중 하나라도 실패하면 성공한 것만 표시하고 첫 실패 사유를
          알립니다. 다시 불러오기는 일곱을 한 번에 다시 조회합니다. */}
      {data.loadWhy === "" ? null : (
        <div className="cut">
          <p><b>스케줄을 불러오지 못했어요</b>{data.loadWhy}</p>
          <Button kind="danger" onClick={data.refreshAll}>다시 불러오기</Button>
        </div>
      )}

      {/* loadScheduleRows 는 기간 하나의 조회가 실패해도 나머지 기간의 시간표를 반환합니다. 그 기간만
          달력에서 빠지므로 빠진 사실을 따로 알립니다. 위 안내는 조회 자체가 실패한 경우입니다. */}
      {data.failures.length === 0 ? null : (
        <div className="cut">
          <p><b>일부 기간의 배정을 불러오지 못했어요</b> {data.failures.join(", ")}</p>
          <Button kind="danger" onClick={data.refreshSchedule}>
            다시 불러오기
          </Button>
        </div>
      )}

      <Card>
        <CalendarBar cursor={cursor} />

        {tab === "book" && !week ? (
          <TimeBar steps={data.steps} label={label} endLabel={endLabel} from={from} to={to} range={range} onFrom={setFrom} onTo={setTo} />
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
              ? <span><i className="ens" />전체 합주</span>
              : null}
            {tab === "me" ? <span><i style={{ background: "var(--off)" }} />나의 불가능 일정</span> : null}
          </div>
          <div id="bandSlot">
            {focus.length === 0 ? null : (
              <span className="band"><ClockIcon />집중 합주기간 <b>{focus.map((range) => `${range.from} ~ ${range.to ?? "매일"}`).join(", ")}</b> 자동 스케줄링</span>
            )}
          </div>
        </div>
      </Card>

      <SchedulerRail />

      {openDay === null ? null : tab === "all" ? (
        <DayView {...dayProps(openDay)} />
      ) : tab === "me" ? (
        <OffDialog {...dayProps(openDay)} myOff={allOffEntries(data.myOff, open)} onSaved={data.onSaved} />
      ) : (
        <BookDialog
          {...dayProps(openDay)}
          myBookings={allBookedEntries(data.myBookings, teams, open)}
          fixed={range}
          myName={me?.name ?? ""}
          onSaved={data.onSaved}
        />
      )}
    </>
  );
}
