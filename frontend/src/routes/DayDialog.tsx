import { useState } from "react";
import { useQueries } from "@tanstack/react-query";

import { Modal } from "../components/Modal";
import { Dropdown } from "../components/Dropdown";
import { CloseIcon } from "../components/icons";
import { askCancel, askDelete } from "../lib/confirm";
import {
  addReservation,
  addUnavailable,
  editUnavailable,
  NO_REPEAT,
  cancelBooking,
  dayWithWeekday,
  isoAt,
  loadTeamMembers,
  removeUnavailable,
  takenGrid,
} from "../lib/pipeline";
import type { Repeat } from "../lib/pipeline";
import { firstTaken, unitLabel } from "../lib/calendar";
import { useSlotMinutes } from "../components/queries";
import type { Room } from "../lib/contract";
import { offWhenLabel } from "../lib/dayEntries";
import type { DayTab, EnsembleOn, Entry } from "../lib/dayEntries";
import { EnsembleDayEditor } from "./SettingsEnsemble";
import type { DayTeam } from "../lib/roster";
import { say } from "../lib/toast";
import {
  DayPeople, DayTimeline, MyEntriesList, RepeatFields, SlotPicker, entryName, repeatConflict, slotLabels,
} from "./DayDialogParts";
import type { SlotRange } from "./DayDialogParts";

function hourText(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

export function DayDialog({
  dayKey, tab, teams, entries, myOff, myBookings, openHour, closeHour, slotCount, fixed, inFocus, ensemble, canEditEnsemble,
  memberId, myName, rooms, onSaved, onClose,
}: {
  /** 선택한 날짜의이 전체합주 날짜면 그 시각입니다. 아니면 null 입니다. */
  ensemble: EnsembleOn | null;
  /** 날짜별 전체합주 시각을 변경할 수 있는지입니다. 서버 권한 항목 period_edit 과 같습니다. */
  canEditEnsemble: boolean;
  dayKey: string;
  tab: DayTab;
  teams: DayTeam[];
  entries: Entry[];
  /** 로그인한 사용자가 등록한 불가능 일정 전부입니다(lib/dayEntries 의 allOffEntries). 선택한 날짜의의 항목만이 아닙니다. */
  myOff: Entry[];
  /** 로그인한 사용자가 잡은 예약 중 아직 끝나지 않은 것 전부입니다(lib/dayEntries 의 allBookedEntries). 선택한 날짜의 항목만이 아닙니다. */
  myBookings: Entry[];
  openHour: number;
  closeHour: number;
  slotCount: number;
  /** 위쪽 시간 선택에서 이미 시간을 지정했으면 그 시간으로 바로 예약합니다. */
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
  const [repeat, setRepeat] = useState<Repeat>(NO_REPEAT);
  // 수정 중인 불가능 일정의 번호입니다. null 이면 새로 등록하는 중입니다.
  const [editing, setEditing] = useState<number | null>(null);
  const [offName, setOffName] = useState("");
  const [offReason, setOffReason] = useState("");
  // 선택한 구간입니다. 타임라인 드래그와 시작·끝 select 가 같은 값을 변경합니다. null 이면 아직 선택하지 않은 것이고, 그때는 그날 전부(picked)로 등록합니다.
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
    slotMinutes,
  );
  // 내 팀에 배정된 항목과, 내가 직접 등록한 항목(removeIds 가 있는 항목)입니다. 개인 이름으로 한 예약은
  // 팀이 없어 팀만 보고는 구분할 수 없습니다.
  const mine = entries.filter(
    (entry) => entry.removeIds !== undefined || entry.bookingId !== undefined
      || (entry.team !== null && teams.some((t) => t.key === entry.team && t.mine)),
  );
  // 오른쪽 목록입니다. 내 일정 탭은 선택한 날짜의의 항목이 아니라 내가 등록한 불가능 일정 전부(myOff)를 나열합니다.
  // 예약 탭도 선택한 날짜가 아니라 내가 잡은 예약 전부(myBookings)를 나열합니다. 끝난 예약은 서버가 빼고 줍니다.
  const removable = tab === "me" ? myOff : myBookings;

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
    // 두 목록 모두 여러 날짜의 항목을 나열하므로 확인 문구에 날짜를 함께 적습니다.
    const when = `${offWhenLabel(entry)} ${label(entry.a)}–${endLabel(entry.b)}`.trim();
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

  /** 목록의 수정 버튼입니다. 그 일정의 값을 위쪽 폼에 되살리고, 저장하면 새로 만들지 않고 덮어씁니다. */
  const startEdit = (entry: Entry) => {
    const id = entry.removeIds?.[0];
    if (id === undefined) return;
    setEditing(id);
    setRange({ a: entry.a, b: entry.b });
    setOffName(entry.who === "불가능 일정" ? "" : (entry.who ?? ""));
    setOffReason(entry.note ?? "");
    setRepeat({
      weekdays: entry.repeatWeekdays ?? 0,
      count: entry.repeatCount ?? null,
      until: entry.repeatUntil ?? null,
    });
    setError("");
  };

  /** 수정을 그만두고 새로 등록하는 상태로 되돌립니다. */
  const cancelEdit = () => {
    setEditing(null);
    setRange(null);
    setOffName("");
    setOffReason("");
    setRepeat(NO_REPEAT);
    setError("");
  };

  /** 불가능 일정 하나를 등록합니다. dialog 는 닫지 않습니다. 같은 날에 여러 개를 이어서 등록할 수 있게 합니다. */
  const addOff = async () => {
    const { a, b } = picked;
    if (b <= a) { setError("끝 시간을 시작 시간 이후로 설정해주세요."); return; }
    if (memberId === null) { setError("요청이 많아 지연되고 있어요. 잠시 후 다시 시도해 주세요."); return; }
    const conflict = repeatConflict(repeat);
    if (conflict !== "") { setError(conflict); return; }
    try {
      // editing 이 있으면 그 일정을 덮어쓰고, 없으면 새로 등록합니다.
      const from = isoAt(dayKey, a, openHour);
      const to = isoAt(dayKey, b, openHour);
      if (editing === null) await addUnavailable(memberId, from, to, repeat, offReason, offName);
      else await editUnavailable(memberId, editing, from, to, repeat, offReason, offName);
    } catch (error) {
      setError(error instanceof Error ? error.message : "등록하지 못했어요.");
      return;
    }
    const edited = editing !== null;
    setError("");
    setOffName("");
    setOffReason("");
    setRange(null);
    setRepeat(NO_REPEAT);
    setEditing(null);
    onSaved();
    say(edited ? "불가능 일정을 수정했어요" : "불가능 시간을 등록했어요");
  };

  /** 예약 하나를 만듭니다. 위쪽 시간 선택으로 열린 경우(fixed)에만 닫고, 아니면 이어서 예약할 수 있게 둡니다. */
  const addBooking = async () => {
    const { a, b } = fixed ? { a: fixed.from, b: fixed.to } : picked;
    if (b <= a) { setError("끝 시간을 시작 시간 이후로 설정해주세요."); return; }
    // 선착순이므로 이미 예약된 slot 이 하나라도 있으면 먼저 거절해 서버를 호출하지 않습니다.
    // 두 사람이 동시에 시도해 이 검증을 둘 다 통과해도, 최종 판정은 서버(겹침 금지
    // 제약)가 하므로 아래 catch 에서 서버가 반환한 사유를 그대로 표시합니다.
    const taken = firstTaken(grid, a, b, slotMinutes);
    if (taken !== null) { setError(`${label(taken)}은 이미 예약되어있어요. 다른 시간을 선택해주세요.`); return; }
    // room 이 null 이면 합주실 목록이 비어 있습니다. 등록된 합주실이 0개이거나 목록을 조회하지 못한 경우이며,
    // 두 경우 모두 다시 시도해도 해결되지 않으므로 "잠시 후 다시 시도" 로 안내하지 않습니다.
    if (room === null) { setError("예약할 합주실이 없어요. 설정에 합주실이 등록되어 있는지 확인해주세요."); return; }
    if (memberId === null) {
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
      <h3>{editing === null ? "불가능 일정을 추가할 수 있어요." : "불가능 일정을 수정하고 있어요."}</h3>
      <p className="sub">타임라인을 드래그하거나 시간을 선택해주세요.</p>
      <p className="cap2">날짜</p>
      <b className="dayline">{dayName}</b>
      <p className="cap2">시간</p>
      <SlotPicker prefix="off" range={picked} onChange={setRange} grid={grid} lock={false} slotMinutes={slotMinutes} {...hours} />
      <RepeatFields dayKey={dayKey} value={repeat} onChange={setRepeat} />
      <label className="fld3" htmlFor="offName">
        일정 이름
        <input
          id="offName"
          value={offName}
          maxLength={60}
          placeholder="미입력시 기본값으로 표시돼요"
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
      <h3>합주실 예약</h3>
      <p className="sub">{fixed ? "해당 선택한 시간으로 예약할게요." : "타임라인을 드래그하거나 시각을 선택해요."}</p>
      <p className="cap2">날짜</p>
      <b className="dayline">{dayName}</b>
      {/* 합주실을 먼저 선택합니다. 아래 시각 선택이 그 합주실의 예약된 slot 만 차단합니다. */}
      <label className="fld3" htmlFor="broom">
        합주실
        <Dropdown
          id="broom"
          value={room?.id ?? 0}
          choices={rooms.map((item) => ({ value: item.id, label: item.name }))}
          onChange={setRoomId}
        />
      </label>
      {fixed
        ? <div className="bigtime"><b>{label(fixed.from)} – {endLabel(fixed.to)}</b><small>해당 시간으로 예약할게요</small></div>
        : <>
            <p className="cap2">시간</p>
            <SlotPicker prefix="book" range={picked} onChange={setRange} grid={grid} lock slotMinutes={slotMinutes} {...hours} />
          </>}
      {/* 일정 이름은 팀 이름입니다. 팀을 선택하지 않으면 예약자 이름으로 표시됩니다. */}
      <label className="fld3" htmlFor="bookWho">
        일정 이름
        <Dropdown
          id="bookWho"
          value={who}
          choices={[
            { value: "me", label: `${myName} (나)` },
            ...teams.filter((team) => team.mine).map((team) => ({ value: team.key, label: team.name })),
          ]}
          onChange={setWho}
        />
      </label>
      <p className="msg">{error}</p>
      {fixed ? <p className="tip">예약 후에는 마이캘린더에서 취소 및 변경이 가능해요.</p> : null}
    </div>
  );

  // 전체합주 날짜에서 권한이 있는 사람에게만 표시합니다. 다른 사람은 타임라인의 전체합주 막대로 시각을 봅니다.
  const ensembleEditor = ensemble === null || !canEditEnsemble ? null : (
    <div className="ensday">
      <p className="cap2">선택한 날짜의 전체합주 시각</p>
      <EnsembleDayEditor
        key={`${ensemble.startsAt}-${ensemble.endsAt}`}
        day={dayKey}
        on={ensemble}
        room={rooms.find((item) => item.id === ensemble.roomId)}
      />
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
        {ensembleEditor}
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
          : <DayTimeline list={booked} teams={teams} pick={fixed ? undefined : { ...pick, grid }} {...hours} />}
        {ensembleEditor}
      </section>
      <section className="pane">
        {tab === "me" ? offForm : bookForm}
        <div className="mfoot">
          <button className="ghost" onClick={editing === null ? onClose : cancelEdit}>
            {editing === null ? "닫기" : "수정 취소"}
          </button>
          <button
            className="primary"
            onClick={() => { void (tab === "me" ? addOff() : addBooking()); }}
          >
            {tab !== "me" ? "예약하기" : editing === null ? "등록하기" : "수정 저장"}
          </button>
        </div>
      </section>
      <section className="pane">
        <MyEntriesList
          title={tab === "me" ? "불가능 일정 목록" : "내 예약"}
          empty={tab === "me" ? "등록한 불가능 일정이 없어요." : "잡은 예약이 없어요."}
          entries={removable}
          teams={teams}
          onRemove={(entry) => { void removeEntry(entry); }}
          onEdit={startEdit}
          {...hours}
        />
      </section>
    </Modal>
  );
}
