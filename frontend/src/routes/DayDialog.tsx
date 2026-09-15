import { useState } from "react";
import { useQueries } from "@tanstack/react-query";

import { Modal } from "../components/Modal";
import { CloseIcon } from "../components/icons";
import { askCancel, askDelete } from "../lib/confirm";
import {
  addReservation,
  addUnavailable,
  cancelBooking,
  dayWithWeekday,
  isoAt,
  loadTeamMembers,
  removeUnavailable,
  takenGrid,
} from "../lib/pipeline";
import type { RepeatCycle } from "../lib/pipeline";
import { unitLabel } from "../lib/calendar";
import { useSlotMinutes } from "../components/queries";
import type { Room } from "../lib/contract";
import type { DayTab, Entry } from "../lib/dayEntries";
import type { DayTeam } from "../lib/roster";
import { say } from "../lib/toast";
import { DayPeople, DayTimeline, MyEntriesList, SlotPicker, entryName, slotLabels } from "./DayDialogParts";
import type { SlotRange } from "./DayDialogParts";

function hourText(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

export function DayDialog({
  dayKey, tab, teams, entries, openHour, closeHour, slotCount, fixed, inFocus,
  memberId, myName, rooms, onSaved, onClose,
}: {
  dayKey: string;
  tab: DayTab;
  teams: DayTeam[];
  entries: Entry[];
  openHour: number;
  closeHour: number;
  slotCount: number;
  /** 위쪽 시간 선택에서 이미 시간을 정했으면 그 시간으로 바로 예약합니다. */
  fixed: { from: number; to: number } | null;
  inFocus: boolean;
  /** 로그인한 사용자 id입니다. 아직 받지 못했으면 null이고, 그동안은 등록·예약을 차단합니다. */
  memberId: number | null;
  myName: string;
  /** 예약 가능한 합주실을 표시합니다. */
  rooms: Room[];
  /** 서버 저장이 성공한 뒤 화면이 최신 값을 다시 받아오게 알립니다. */
  onSaved: () => void;
  onClose: () => void;
}) {
  const [error, setError] = useState("");
  const [who, setWho] = useState("me");
  const [roomId, setRoomId] = useState<number | null>(null);
  const [repeat, setRepeat] = useState<RepeatCycle>("none");
  const [offName, setOffName] = useState("");
  const [offReason, setOffReason] = useState("");
  // 고른 구간입니다. 타임라인 드래그와 시작·끝 select 가 같은 값을 바꿉니다. null 이면 아직 고르지 않은 것이고, 그때는 그날 전부(picked)로 등록합니다.
  const [range, setRange] = useState<SlotRange | null>(null);
  // 시각 선택지의 간격과 머리글의 단위 문구는 저장소 설정(slot_minutes)을 따릅니다.
  const slotMinutes = useSlotMinutes();

  // 아직 아무것도 선택하지 않았으면 목록의 첫 합주실입니다. dialog(화면 위에 뜨는 대화 상자)를 열자마자 합주실 하나는 선택되어 있어야 합니다.
  const room = rooms.find((item) => item.id === roomId) ?? rooms[0] ?? null;

  const hours = { openHour, closeHour, slotCount };
  const { label, endLabel } = slotLabels(openHour, closeHour, slotCount);
  const dayName = dayWithWeekday(dayKey);
  const picked = range ?? { a: 0, b: slotCount };
  const pick = { range, slotMinutes, onChange: setRange };

  const booked = entries.filter((entry) => entry.kind !== "off");
  // 선착순은 합주실마다 따로 계산합니다. 선택한 합주실에 등록된 항목만 그 시각을 차단합니다.
  const grid = takenGrid(
    booked.filter((entry) => room !== null && entry.room === room.name),
    slotCount,
  );
  // 내 팀에 배정된 항목과, 내가 직접 등록한 항목(removeIds 가 있는 항목)입니다. 개인 이름으로 한 예약은
  // 팀이 없어 팀만 보고는 구분할 수 없습니다.
  const mine = entries.filter(
    (entry) => entry.removeIds !== undefined || entry.bookingId !== undefined
      || (entry.team !== null && teams.some((t) => t.key === entry.team && t.mine)),
  );
  // 오른쪽 목록입니다. 내 일정 탭은 내가 등록한 불가능 일정(removeIds 가 있는 항목), 예약 탭은 내가 한 예약(bookingId 가 있는 항목)만
  // 모읍니다. 다른 사용자의 예약과 서버가 배정한 항목에는 둘 다 없습니다.
  const removable = entries.filter(
    (entry) => (tab === "me" ? entry.removeIds : entry.bookingId) !== undefined,
  );

  const roomsLabel = [...new Set(booked.map((entry) => entry.room).filter(Boolean))].join(" · ");

  // 그날 뭔가 놓인 팀만 명단을 조회합니다. 프로필·권한 구역과 같은 query key(["members", team id])를
  // 써서, 이미 받아 둔 명단이 있으면 서버를 다시 조회하지 않습니다.
  const dayTeams = teams.filter((team) => booked.some((entry) => entry.team === team.key));
  const rosters = useQueries({
    queries: dayTeams.map((team) => ({
      queryKey: ["members", team.id],
      queryFn: () => loadTeamMembers(team.id),
    })),
  });
  const dayPeople = dayTeams.flatMap((team, index) =>
    (rosters[index]?.data ?? []).map((member) => ({ team, member })));
  const rosterError = rosters.find((query) => query.isError)?.error;

  /** 등록한 항목 하나를 삭제합니다. 예약은 번호 하나로 통째로 취소하고, 불가능 일정은 그 행의 id 로 삭제합니다. */
  const removeEntry = async (entry: Entry) => {
    if (memberId === null) return;
    const when = `${label(entry.a)}–${endLabel(entry.b)}`;
    const bookingId = entry.bookingId;
    const booking = bookingId !== undefined;
    if (booking) {
      if (!askCancel(`${entryName(entry, teams)} ${when} 예약`)) return;
    } else if (entry.removeIds !== undefined) {
      if (!askDelete(`${when} 불가능 일정`)) return;
    } else {
      return;
    }
    try {
      await (bookingId !== undefined
        ? cancelBooking(bookingId)
        : removeUnavailable(memberId, entry.removeIds![0]));
    } catch (error) {
      setError(error instanceof Error ? error.message : "삭제하지 못했어요.");
      onSaved();
      return;
    }
    setError("");
    onSaved();
    say(booking ? "예약을 취소했어요" : "해당 불가능 일정을 삭제했어요");
  };

  /** 불가능 일정 하나를 등록합니다. dialog 는 닫지 않습니다. 같은 날에 여러 개를 이어서 등록할 수 있게 합니다. */
  const addOff = async () => {
    const { a, b } = picked;
    if (b <= a) { setError("끝 시간을 시작 시간 이후로 설정해주세요."); return; }
    if (memberId === null) { setError("요청이 많아 지연되고 있어요. 잠시 후 다시 시도해 주세요."); return; }
    try {
      await addUnavailable(
        memberId,
        isoAt(dayKey, a, openHour),
        isoAt(dayKey, b, openHour),
        repeat,
        offReason,
        offName,
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : "등록하지 못했어요.");
      return;
    }
    setError("");
    setOffName("");
    setOffReason("");
    setRange(null);
    onSaved();
    say(repeat === "none" ? "불가능 시간을 등록했어요" : "반복 일정을 등록했어요");
  };

  /** 예약 하나를 만듭니다. 위쪽 시간 선택으로 열린 경우(fixed)에만 닫고, 아니면 이어서 예약할 수 있게 둡니다. */
  const addBooking = async () => {
    const { a, b } = fixed ? { a: fixed.from, b: fixed.to } : picked;
    if (b <= a) { setError("끝 시간을 시작 시간 이후로 설정해주세요."); return; }
    // 선착순이므로 이미 예약된 slot 이 하나라도 있으면 먼저 거절해 서버를 호출하지 않습니다.
    // 두 사람이 동시에 시도해 이 검증을 둘 다 통과해도, 최종 판정은 서버(겹침 금지
    // 제약)가 하므로 아래 catch 에서 서버가 반환한 사유를 그대로 표시합니다.
    // a·b 는 설정 단위의 소수일 수 있으므로 걸친 1시간 칸 전부를 봅니다.
    for (let i = Math.floor(a); i < Math.ceil(b); i += 1) {
      if (grid[i]) { setError(`${label(i)}은 이미 예약되어있어요. 다른 시간을 선택해주세요.`); return; }
    }
    if (memberId === null || room === null) {
      setError("요청이 많아 지연되고 있어요. 잠시 후 다시 시도해 주세요.");
      return;
    }
    const teamId = who === "me" ? null : teams.find((team) => team.key === who)?.id ?? null;
    try {
      await addReservation({
        room_id: room.id,
        team_id: teamId,
        starts_at: isoAt(dayKey, a, openHour),
        ends_at: isoAt(dayKey, b, openHour),
      });
    } catch (error) {
      setError(error instanceof Error ? error.message : "예약하지 못했어요.");
      return;
    }
    setError("");
    setRange(null);
    onSaved();
    say(`${dayName} ${label(a)}–${endLabel(b)} 예약했어요`);
    if (fixed) onClose();
  };

  const offForm = (
    <div className="col">
      <h3>불가능 일정을 추가할 수 있어요.</h3>
      <p className="sub">타임라인을 드래그하거나 시각을 골라요.</p>
      <p className="cap2">날짜</p>
      <b className="dayline">{dayName}</b>
      <p className="cap2">시간</p>
      <SlotPicker prefix="off" range={picked} onChange={setRange} grid={grid} lock={false} slotMinutes={slotMinutes} {...hours} />
      <label className="fld3" htmlFor="offRepeat">
        반복
        <select id="offRepeat" value={repeat} onChange={(event) => setRepeat(event.target.value as RepeatCycle)}>
          <option value="none">반복 없음</option>
          <option value="daily">매일</option>
          <option value="weekly">매주 {dayName.split(" ").at(-1)}마다</option>
        </select>
      </label>
      <label className="fld3" htmlFor="offName">
        일정 이름
        <input
          id="offName"
          value={offName}
          maxLength={60}
          placeholder="미입력 시 불가능 일정"
          onChange={(event) => setOffName(event.target.value)}
        />
      </label>
      <label className="fld3" htmlFor="offReason">
        사유
        <textarea
          id="offReason"
          value={offReason}
          maxLength={200}
          placeholder="사유를 적어주세요"
          onChange={(event) => setOffReason(event.target.value)}
        />
      </label>
      <p className="msg">{error}</p>
    </div>
  );

  const bookForm = (
    <div className="col">
      <h3>합주실을 예약할 수 있어요.</h3>
      <p className="sub">{fixed ? "위에서 고른 시간으로 예약해요." : "타임라인을 드래그하거나 시각을 골라요."}</p>
      <p className="cap2">날짜</p>
      <b className="dayline">{dayName}</b>
      {/* 합주실을 먼저 선택합니다. 아래 시각 선택이 그 합주실의 예약된 slot 만 차단합니다. */}
      <label className="fld3" htmlFor="broom">
        합주실
        <select id="broom" value={room?.id ?? ""} onChange={(event) => setRoomId(Number(event.target.value))}>
          {rooms.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
        </select>
      </label>
      {fixed
        ? <div className="bigtime"><b>{label(fixed.from)} – {endLabel(fixed.to)}</b><small>해당 시간으로 예약할게요</small></div>
        : <>
            <p className="cap2">시간</p>
            <SlotPicker prefix="book" range={picked} onChange={setRange} grid={grid} lock slotMinutes={slotMinutes} {...hours} />
          </>}
      {/* 일정 이름은 팀 이름입니다. 팀을 고르지 않으면 예약자 이름으로 표시됩니다(사용자 결정 2026-09-15). */}
      <label className="fld3" htmlFor="bookWho">
        일정 이름
        <select id="bookWho" value={who} onChange={(event) => setWho(event.target.value)}>
          <option value="me">{myName} (나)</option>
          {teams.filter((team) => team.mine).map((team) => (
            <option value={team.key} key={team.id}>{team.name}</option>
          ))}
        </select>
      </label>
      <p className="msg">{error}</p>
      {fixed ? <p className="tip">예약 후에는 마이캘린더에서 취소 및 변경이 가능해요.</p> : null}
    </div>
  );

  const hint = `${roomsLabel || "합주실"} · ${hourText(openHour)}–${hourText(closeHour)}`
    + ` · ${unitLabel(slotMinutes)} · ${inFocus ? "배정된 기간" : "배정 없음"}`;

  // 조회 전용 탭(all)은 카드 하나짜리 일반 modal 입니다. 버튼 줄이 없습니다.
  if (tab === "all") {
    return (
      <Modal title={dayName} hint={hint} onClose={onClose}>
        {booked.length
          ? <>
              <DayTimeline list={booked} teams={teams} {...hours} />
              {dayTeams.length === 0 ? null : <DayPeople people={dayPeople} error={rosterError} />}
            </>
          : <div className="blank"><b>현재 예약이 없어요</b></div>}
      </Modal>
    );
  }

  // 내 일정·예약 탭은 카드 3장입니다. 제목과 닫기 버튼은 왼쪽 카드, 등록 버튼은 가운데 카드 안에 있습니다.
  return (
    <Modal title={dayName} panes onClose={onClose}>
      <section className="pane">
        <div className="mhead">
          <div>
            <h2>{dayName}</h2>
            <p>{hint}</p>
          </div>
          <button aria-label="닫기" onClick={onClose}><CloseIcon /></button>
        </div>
        {tab === "me"
          ? <DayTimeline list={mine} teams={teams} pick={pick} {...hours} />
          : <DayTimeline list={booked} teams={teams} pick={fixed ? undefined : pick} {...hours} />}
      </section>
      <section className="pane">
        {tab === "me" ? offForm : bookForm}
        <div className="mfoot">
          <button className="ghost" onClick={onClose}>닫기</button>
          <button
            className="primary"
            onClick={() => { void (tab === "me" ? addOff() : addBooking()); }}
          >
            {tab === "me" ? "등록하기" : "예약하기"}
          </button>
        </div>
      </section>
      <section className="pane">
        <MyEntriesList
          title={tab === "me" ? "불가능 일정 목록" : "내 예약"}
          empty={tab === "me" ? "이날 등록한 불가능 일정이 없어요." : "이날 내가 한 예약이 없어요."}
          entries={removable}
          teams={teams}
          onRemove={(entry) => { void removeEntry(entry); }}
          {...hours}
        />
      </section>
    </Modal>
  );
}
