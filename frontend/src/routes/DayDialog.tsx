// 달력의 하루 창입니다. 탭마다 창 1개입니다 — 전체 일정은 DayView(보기 전용), 내 일정은 OffDialog(불가능 일정 등록),
// 예약은 BookDialog(합주실 예약). 어느 창을 열지는 routes/Scheduler 가 정합니다.

import { useState } from "react";
import type { ReactNode } from "react";
import { useQueries } from "@tanstack/react-query";

import { Modal } from "../components/Modal";
import { Dropdown } from "../components/Dropdown";
import { Button, CloseButton } from "../components/controls";
import { askCancel, askDelete } from "../lib/confirm";
import { addReservation, addUnavailable, editUnavailable, NO_REPEAT, cancelBooking, removeUnavailable, repeatConflict } from "../lib/pipeline";
import type { Repeat } from "../lib/pipeline";
import { dayWithWeekday, firstTaken, hourLabel, slotLabels, takenGrid, unitLabel } from "../lib/calendar";
import { teamMembersQuery, useMe, useSlotMinutes } from "../components/queries";
import type { Member, Room } from "../lib/contract";
import { entryName, myEntries, offWhenLabel } from "../lib/dayEntries";
import type { EnsembleOn, Entry } from "../lib/dayEntries";
import { EnsembleDayEditor } from "../components/EnsembleDayEditor";
import type { DayTeam } from "../lib/roster";
import { say } from "../components/toast";
import {
  DayPeople, DayTimeline, MyEntriesList, RepeatFields, SlotPicker,
} from "./DayDialogParts";
import type { SlotRange } from "./DayDialogParts";
import { isoAt } from "../lib/slots";

/** 하루 창 3개가 공통으로 받는 값입니다. */
export type DayProps = {
  dayKey: string;
  teams: DayTeam[];
  /** 선택한 날짜의 배정, 예약, 불가능 일정입니다. */
  entries: Entry[];
  openHour: number;
  closeHour: number;
  slotCount: number;
  inFocus: boolean;
  /** 선택한 날짜가 전체 합주 날짜면 그 시각입니다. 아니면 null 입니다. */
  ensemble: EnsembleOn | null;
  /** 날짜별 전체 합주 시각을 변경할 수 있는지입니다. 서버 권한 항목 period_edit 과 같습니다. */
  canEditEnsemble: boolean;
  /** 예약 가능한 합주실입니다. 전체 합주 입력은 이 목록에서 합주실 이름을 찾습니다. */
  rooms: Room[];
  onClose: () => void;
};

/** 등록하는 창(OffDialog, BookDialog)이 더 받는 값입니다. */
type EditProps = DayProps & {
  /** 서버 저장이 성공한 뒤 화면이 최신 값을 다시 받아오게 알립니다. */
  onSaved: () => void;
};

/** 등록하는 창 2개가 함께 쓰는 값과 목록 삭제입니다. */
type DayForm = {
  error: string;
  setError: (message: string) => void;
  slotMinutes: number;
  /** 로그인한 사용자의 번호입니다. 조회 중이거나 조회에 실패하면 null 입니다. */
  memberId: number | null;
  /** memberId 가 null 일 때 표시할 사유입니다. */
  noMemberWhy: string;
  hours: { openHour: number; closeHour: number; slotCount: number };
  label: (slot: number) => string;
  endLabel: (slot: number) => string;
  booked: Entry[];
  dayName: string;
  hint: string;
  removeEntry: (entry: Entry) => Promise<void>;
};

function useDayForm({ dayKey, teams, entries, openHour, closeHour, slotCount, inFocus, onSaved }: EditProps): DayForm {
  const [error, setError] = useState("");
  // 시각 선택지의 간격과 머리글의 단위 문구는 저장소 설정(slot_minutes)을 따릅니다.
  const slotMinutes = useSlotMinutes();
  // queryKey 가 ME_KEY 로 같아 Scheduler 가 받아 둔 응답을 그대로 씁니다.
  const { me, meState } = useMe();
  const memberId = me?.id ?? null;
  // memberId 가 null 인 경우는 조회 중과 조회 실패 둘입니다. 조회 실패는 다시 눌러도 같은 결과이므로 사유를 그대로 표시합니다.
  const noMemberWhy = meState.kind === "failed"
    ? meState.why
    : "요청이 많아 지연되고 있어요. 잠시 후 다시 시도해 주세요.";
  const { label, endLabel } = slotLabels(openHour, closeHour, slotCount);
  const booked = entries.filter((entry) => entry.kind !== "off");

  /** 등록한 항목 하나를 삭제합니다. 예약은 번호 하나로 통째로 취소하고, 불가능 일정은 그 행의 id 로 삭제합니다. */
  const removeEntry = async (entry: Entry): Promise<void> => {
    if (memberId === null) return;
    // 두 목록 모두 여러 날짜의 항목을 나열하므로 확인 문구에 날짜를 함께 적습니다.
    const when = `${offWhenLabel(entry)} ${label(entry.a)}–${endLabel(entry.b)}`.trim();
    // 두 id 를 지역 변수로 받아 아래 요청까지 타입이 좁혀진 상태를 유지합니다. entry 에서 다시
    // 읽으면 undefined 가 아니라는 사실이 남지 않아 non-null 단언(!)이 필요해집니다.
    const bookingId = entry.bookingId;
    const removeIds = entry.removeIds;
    if (bookingId !== undefined) {
      if (!askCancel(`${entryName(entry, teams)} ${when} 예약`)) return;
    } else if (removeIds !== undefined) {
      if (!askDelete(`${when} 불가능 일정`)) return;
    } else {
      return;
    }
    try {
      // 불가능 일정은 removeIds 의 첫 id 로 삭제합니다. 반복으로 전개한 항목은 같은 행에서
      // 나왔으므로 그 행 하나를 삭제하면 전개된 항목이 모두 사라집니다.
      if (bookingId !== undefined) await cancelBooking(bookingId);
      else if (removeIds !== undefined) await removeUnavailable(memberId, removeIds[0]);
    } catch (error) {
      setError(error instanceof Error ? error.message : "삭제하지 못했어요.");
      onSaved();
      return;
    }
    setError("");
    onSaved();
    say(bookingId !== undefined ? "예약을 취소했어요" : "해당 불가능 일정을 삭제했어요");
  };

  return {
    error, setError, slotMinutes, memberId, noMemberWhy, label, endLabel, booked, removeEntry,
    hours: { openHour, closeHour, slotCount },
    dayName: dayWithWeekday(dayKey),
    hint: dayHint(booked, openHour, closeHour, slotMinutes, inFocus),
  };
}

/** 등록하는 창의 카드 3장입니다. 왼쪽은 제목, 닫기 버튼, 타임라인이고 가운데는 입력 form 과 버튼 줄, 오른쪽은 내가 등록한 항목 목록입니다. */
function DayPanes({ dayName, hint, onClose, timeline, form, footer, list }: {
  dayName: string;
  hint: string;
  onClose: () => void;
  timeline: ReactNode;
  form: ReactNode;
  footer: ReactNode;
  list: ReactNode;
}) {
  return (
    <Modal title={dayName} panes onClose={onClose}>
      <section className="pane">
        <div className="mhead">
          <div>
            <h2>{dayName}</h2>
            <p>{hint}</p>
          </div>
          <CloseButton onClick={onClose} />
        </div>
        {timeline}
      </section>
      <section className="pane">
        {form}
        <div className="mfoot">{footer}</div>
      </section>
      <section className="pane">{list}</section>
    </Modal>
  );
}

/** 내 일정 탭의 하루 창입니다. 불가능 일정을 등록하거나, 오른쪽 목록에서 고른 일정을 수정합니다. 창은 닫지 않고 이어서 등록할 수 있습니다. */
export function OffDialog(props: EditProps & {
  /** 로그인한 사용자가 등록한 불가능 일정 전부입니다(lib/dayEntries 의 allOffEntries). 선택한 날짜의 항목만이 아닙니다. */
  myOff: Entry[];
}) {
  const { dayKey, teams, entries, openHour, slotCount, ensemble, canEditEnsemble, rooms, myOff, onSaved, onClose } = props;
  const day = useDayForm(props);
  const [repeat, setRepeat] = useState<Repeat>(NO_REPEAT);
  // 수정 중인 불가능 일정의 번호입니다. null 이면 새로 등록하는 중입니다.
  const [editing, setEditing] = useState<number | null>(null);
  const [offName, setOffName] = useState("");
  const [offReason, setOffReason] = useState("");
  // 선택한 구간입니다. 타임라인 드래그와 시작·종료 select 가 같은 값을 변경합니다. null 이면 그날 전부로 등록합니다.
  const [range, setRange] = useState<SlotRange | null>(null);
  const picked = range ?? { a: 0, b: slotCount };

  /** 새로 등록하는 상태로 되돌립니다. 수정 취소와 저장 성공이 함께 씁니다. */
  const resetForm = (): void => {
    setEditing(null);
    setRange(null);
    setOffName("");
    setOffReason("");
    setRepeat(NO_REPEAT);
    day.setError("");
  };

  /** 목록의 수정 버튼입니다. 그 일정의 값을 form 에 되살리고, 저장하면 새로 만들지 않고 덮어씁니다. */
  const startEdit = (entry: Entry): void => {
    const id = entry.removeIds?.[0];
    if (id === undefined) return;
    setEditing(id);
    setRange({ a: entry.a, b: entry.b });
    setOffName(entry.who ?? "");
    setOffReason(entry.note ?? "");
    setRepeat({ weekdays: entry.repeatWeekdays ?? 0, count: entry.repeatCount ?? null, until: entry.repeatUntil ?? null });
    day.setError("");
  };

  const addOff = async (): Promise<void> => {
    const { a, b } = picked;
    if (b <= a) { day.setError("종료 시간을 시작 시간 이후로 설정해주세요."); return; }
    if (day.memberId === null) { day.setError(day.noMemberWhy); return; }
    const conflict = repeatConflict(repeat);
    if (conflict !== "") { day.setError(conflict); return; }
    try {
      const from = isoAt(dayKey, a, openHour);
      const to = isoAt(dayKey, b, openHour);
      if (editing === null) await addUnavailable(day.memberId, from, to, repeat, offReason, offName);
      else await editUnavailable(day.memberId, editing, from, to, repeat, offReason, offName);
    } catch (error) {
      day.setError(error instanceof Error ? error.message : "등록하지 못했어요.");
      return;
    }
    const edited = editing !== null;
    resetForm();
    onSaved();
    say(edited ? "불가능 일정을 수정했어요" : "불가능 일정을 등록했어요");
  };

  return (
    <DayPanes
      dayName={day.dayName}
      hint={day.hint}
      onClose={onClose}
      timeline={<>
        <DayTimeline list={myEntries(entries, teams)} teams={teams} pick={{ range, slotMinutes: day.slotMinutes, onChange: setRange }} {...day.hours} />
        <DayEnsemble ensemble={ensemble} canEdit={canEditEnsemble} dayKey={dayKey} rooms={rooms} />
      </>}
      form={
        <div className="col">
          <h3>{editing === null ? "불가능 일정을 추가할 수 있어요." : "불가능 일정을 수정하고 있어요."}</h3>
          <p className="sub">타임라인을 드래그하거나 시간을 선택해주세요.</p>
          <p className="cap2">날짜</p>
          <b className="dayline">{day.dayName}</b>
          <p className="cap2">시간</p>
          <SlotPicker prefix="off" range={picked} onChange={setRange} slotMinutes={day.slotMinutes} {...day.hours} />
          <RepeatFields dayKey={dayKey} value={repeat} onChange={setRepeat} />
          <label className="fld3" htmlFor="offName">
            일정 이름
            <input id="offName" value={offName} maxLength={60} placeholder="미입력시 기본값으로 표시돼요" onChange={(event) => setOffName(event.target.value)} />
          </label>
          <label className="fld3" htmlFor="offReason">
            사유
            <textarea id="offReason" value={offReason} maxLength={200} placeholder="사유를 적어주세요" onChange={(event) => setOffReason(event.target.value)} />
          </label>
          <p className="msg">{day.error}</p>
        </div>
      }
      footer={<>
        <Button kind="ghost" onClick={editing === null ? onClose : resetForm}>{editing === null ? "닫기" : "수정 취소"}</Button>
        <Button kind="go" onClick={() => { void addOff(); }}>{editing === null ? "등록하기" : "수정 저장"}</Button>
      </>}
      list={
        <MyEntriesList
          title="불가능 일정 목록"
          empty="등록한 불가능 일정이 없어요."
          entries={myOff}
          teams={teams}
          onRemove={(entry) => { void day.removeEntry(entry); }}
          onEdit={startEdit}
          {...day.hours}
        />
      }
    />
  );
}

/** 예약 탭의 하루 창입니다. 합주실과 시간을 골라 예약합니다. 위쪽 시간 선택으로 연 경우(fixed)에는 예약한 뒤 창을 닫습니다. */
export function BookDialog(props: EditProps & {
  /** 로그인한 사용자가 잡은 예약 중 아직 끝나지 않은 것 전부입니다(lib/dayEntries 의 allBookedEntries). 선택한 날짜의 항목만이 아닙니다. */
  myBookings: Entry[];
  /** 위쪽 시간 선택에서 이미 시간을 지정했으면 그 시간으로 바로 예약합니다. */
  fixed: { from: number; to: number } | null;
  myName: string;
}) {
  const { dayKey, teams, openHour, slotCount, ensemble, canEditEnsemble, rooms, myBookings, fixed, myName, onSaved, onClose } = props;
  const day = useDayForm(props);
  const [who, setWho] = useState("me");
  const [roomId, setRoomId] = useState<number | null>(null);
  const [range, setRange] = useState<SlotRange | null>(null);
  const picked = range ?? { a: 0, b: slotCount };
  // 아직 아무것도 선택하지 않았으면 목록의 첫 합주실입니다. 창을 열자마자 합주실 하나는 선택되어 있어야 합니다.
  const room = rooms.find((item) => item.id === roomId) ?? rooms[0] ?? null;
  // 선착순은 합주실마다 따로 계산합니다. 선택한 합주실에 등록된 항목만 그 시각을 차단합니다.
  const grid = takenGrid(day.booked.filter((entry) => room !== null && entry.room === room.name), slotCount, day.slotMinutes);
  const { label, endLabel } = day;

  const addBooking = async (): Promise<void> => {
    const { a, b } = fixed ? { a: fixed.from, b: fixed.to } : picked;
    if (b <= a) { day.setError("종료 시간을 시작 시간 이후로 설정해주세요."); return; }
    // 선착순이므로 이미 예약된 slot 이 하나라도 있으면 먼저 거절해 서버를 호출하지 않습니다.
    // 두 사람이 동시에 이 검증을 통과해도 최종 판정은 서버의 겹침 금지 제약이 하고, 아래 catch 가 그 사유를 표시합니다.
    const taken = firstTaken(grid, a, b, day.slotMinutes);
    if (taken !== null) { day.setError(`${label(taken)}은 이미 예약되어있어요. 다른 시간을 선택해주세요.`); return; }
    // room 이 null 이면 등록된 합주실이 0개이거나 목록을 조회하지 못한 경우입니다. 다시 시도해도 해결되지 않습니다.
    if (room === null) { day.setError("예약할 합주실이 없어요. 설정에 합주실이 등록되어 있는지 확인해주세요."); return; }
    if (day.memberId === null) { day.setError(day.noMemberWhy); return; }
    const teamId = who === "me" ? null : teams.find((team) => team.key === who)?.id ?? null;
    try {
      await addReservation({
        room_id: room.id,
        team_id: teamId,
        starts_at: isoAt(dayKey, a, openHour),
        ends_at: isoAt(dayKey, b, openHour),
      });
    } catch (error) {
      day.setError(error instanceof Error ? error.message : "예약하지 못했어요.");
      return;
    }
    day.setError("");
    setRange(null);
    onSaved();
    say(`${day.dayName} ${label(a)}–${endLabel(b)} 예약했어요`);
    if (fixed) onClose();
  };

  return (
    <DayPanes
      dayName={day.dayName}
      hint={day.hint}
      onClose={onClose}
      timeline={<>
        <DayTimeline
          list={day.booked}
          teams={teams}
          pick={fixed ? undefined : { range, slotMinutes: day.slotMinutes, onChange: setRange, grid }}
          {...day.hours}
        />
        <DayEnsemble ensemble={ensemble} canEdit={canEditEnsemble} dayKey={dayKey} rooms={rooms} />
      </>}
      form={
        <div className="col">
          <h3>합주실 예약</h3>
          <p className="sub">{fixed ? "해당 선택한 시간으로 예약할게요." : "타임라인을 드래그하거나 시각을 선택해요."}</p>
          <p className="cap2">날짜</p>
          <b className="dayline">{day.dayName}</b>
          {/* 합주실을 먼저 선택합니다. 아래 시각 선택이 그 합주실의 예약된 slot 만 차단합니다. */}
          <label className="fld3" htmlFor="broom">
            합주실
            <Dropdown id="broom" value={room?.id ?? 0} choices={rooms.map((item) => ({ value: item.id, label: item.name }))} onChange={setRoomId} />
          </label>
          {fixed
            ? <div className="bigtime"><b>{label(fixed.from)} – {endLabel(fixed.to)}</b><small>해당 시간으로 예약할게요</small></div>
            : <>
                <p className="cap2">시간</p>
                <SlotPicker prefix="book" range={picked} onChange={setRange} grid={grid} slotMinutes={day.slotMinutes} {...day.hours} />
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
          <p className="msg">{day.error}</p>
          {fixed ? <p className="tip">예약 후에는 마이캘린더에서 취소 및 변경이 가능해요.</p> : null}
        </div>
      }
      footer={<>
        <Button kind="ghost" onClick={onClose}>닫기</Button>
        <Button kind="go" onClick={() => { void addBooking(); }}>예약하기</Button>
      </>}
      list={
        <MyEntriesList
          title="내 예약"
          empty="잡은 예약이 없어요."
          entries={myBookings}
          teams={teams}
          onRemove={(entry) => { void day.removeEntry(entry); }}
          {...day.hours}
        />
      }
    />
  );
}

/** 하루 창 머리의 안내 한 줄입니다. "1번방 18:00–24:00 1시간 단위 배정된 기간" */
function dayHint(booked: Entry[], openHour: number, closeHour: number, slotMinutes: number, inFocus: boolean): string {
  const roomsLabel = [...new Set(booked.map((entry) => entry.room).filter(Boolean))].join(", ");
  return `${roomsLabel || "합주실"} ${hourLabel(openHour)}–${hourLabel(closeHour)} ${unitLabel(slotMinutes)} ${inFocus ? "배정된 기간" : "배정 없음"}`;
}

/** 전체 합주 날짜의 시각 입력입니다. period_edit 권한이 있는 사람에게만 표시하고, 다른 사람은 타임라인의 막대로 봅니다. */
function DayEnsemble({ ensemble, canEdit, dayKey, rooms }: {
  ensemble: EnsembleOn | null; canEdit: boolean; dayKey: string; rooms: Room[];
}) {
  if (ensemble === null || !canEdit) return null;
  return (
    <div className="ensday">
      <p className="cap2">선택한 날짜의 전체 합주 시각</p>
      <EnsembleDayEditor
        key={`${ensemble.startsAt}-${ensemble.endsAt}`}
        day={dayKey}
        on={ensemble}
        room={rooms.find((item) => item.id === ensemble.roomId)}
      />
    </div>
  );
}

/** 전체 일정 탭의 하루 창입니다. 그날의 배정, 예약, 전체 합주와 그 팀원을 보기만 합니다. 버튼 줄이 없는 카드 1장입니다. */
export function DayView({ dayKey, teams, entries, openHour, closeHour, slotCount, inFocus, ensemble, canEditEnsemble, rooms, onClose }: DayProps) {
  const slotMinutes = useSlotMinutes();
  const booked = entries.filter((entry) => entry.kind !== "off");
  // 그날 뭔가 놓인 팀만 명단을 조회합니다. 프로필, 팀 화면과 같은 queryKey 라 이미 받은 명단은 다시 조회하지 않습니다.
  const dayTeams = teams.filter((team) => booked.some((entry) => entry.team === team.key));
  const rosters = useQueries({ queries: dayTeams.map((team) => teamMembersQuery(team.id)) });
  // useQueries 는 queries 와 같은 순서로 결과를 반환하므로 rosters[index] 가 dayTeams[index] 의 명단입니다.
  const dayPeople: { team: DayTeam; member: Member }[] = [];
  for (const [index, team] of dayTeams.entries()) {
    for (const member of rosters[index]?.data ?? []) dayPeople.push({ team, member });
  }
  const rosterError = rosters.find((query) => query.isError)?.error;
  const hours = { openHour, closeHour, slotCount };

  return (
    <Modal title={dayWithWeekday(dayKey)} hint={dayHint(booked, openHour, closeHour, slotMinutes, inFocus)} onClose={onClose}>
      {booked.length
        ? <>
            <DayTimeline list={booked} teams={teams} {...hours} />
            {dayTeams.length === 0 ? null : <DayPeople people={dayPeople} error={rosterError} />}
          </>
        : <div className="blank"><b>현재 예약이 없어요</b></div>}
      <DayEnsemble ensemble={ensemble} canEdit={canEditEnsemble} dayKey={dayKey} rooms={rooms} />
    </Modal>
  );
}
