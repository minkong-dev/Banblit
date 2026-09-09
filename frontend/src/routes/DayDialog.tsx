import { useState } from "react";
import type { CSSProperties } from "react";
import { useQueries } from "@tanstack/react-query";

import { Modal } from "../components/Modal";
import { TrashIcon } from "../components/icons";
import { askCancel, askDelete } from "../lib/confirm";
import {
  addReservation,
  addUnavailable,
  cancelBooking,
  dayWithWeekday,
  isoAt,
  loadTeamMembers,
  removeUnavailable,
  slotLabel,
  takenGrid,
} from "../lib/pipeline";
import type { Room } from "../lib/contract";
import { say } from "../lib/toast";
import type { DayTeam } from "../lib/roster";

/** 하루에 놓인 것 하나. 배정은 서버가 준 것이고, 예약과 못 나오는 시간은 화면이 넣은 것이다. */
export type Entry = {
  kind: "assign" | "book" | "off";
  team: string | null;
  room?: string;
  who?: string;
  a: number;
  b: number;
  /** 내가 지울 수 있는 것이면 지울 때 서버에 넘길 번호. 예약은 칸마다 번호가 달라
   *  여럿이다. 없으면 남의 것이거나 서버가 배정한 것이라 화면에서 지우지 못한다. */
  removeIds?: number[];
};


function hourText(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

function kindLabel(entry: Entry): string {
  if (entry.kind === "assign") return "자동 배정";
  return entry.kind === "book" ? "예약" : "못 나오는 시간";
}

export function DayDialog(props: {
  dayKey: string;
  tab: "me" | "book" | "all";
  teams: DayTeam[];
  entries: Entry[];
  openHour: number;
  closeHour: number;
  slotCount: number;
  /** 위쪽 시간 고르기에서 이미 시간을 정했으면 그 시간으로 바로 예약한다. */
  fixed: { from: number; to: number } | null;
  inFocus: boolean;
  /** 로그인한 사람 번호. 아직 못 받았으면 null이고, 그동안은 등록·예약을 막는다. */
  memberId: number | null;
  myName: string;
  /** 예약을 넣을 수 있는 합주실 전부. 어디에 넣을지는 이 안에서 고른다. */
  rooms: Room[];
  /** 서버 저장이 성공한 뒤 화면이 최신 값을 다시 받아오게 알린다. */
  onSaved: () => void;
  onClose: () => void;
}) {
  const { dayKey, tab, teams, entries, openHour, closeHour, slotCount, fixed, inFocus } = props;
  const { memberId, myName, rooms, onSaved, onClose } = props;

  const [error, setError] = useState("");
  const [who, setWho] = useState("me");
  const [roomId, setRoomId] = useState<number | null>(null);
  const [repeatsWeekly, setRepeatsWeekly] = useState(false);
  // 시각 두 칸. 기본은 그날 여는 칸부터 닫는 칸까지 전부다.
  const [off, setOff] = useState({ a: 0, b: slotCount });
  const [book, setBook] = useState({ a: 0, b: slotCount });

  // 아직 아무것도 안 골랐으면 목록의 첫 합주실이다 — 대화상자를 열자마자 어딘가는 정해져 있어야 한다.
  const room = rooms.find((item) => item.id === roomId) ?? rooms[0] ?? null;

  const label = (index: number) => slotLabel(index, openHour);
  const endLabel = (index: number) => (index >= slotCount ? `${closeHour}:00` : label(index));
  const nameOf = (entry: Entry) =>
    entry.kind === "off"
      ? entry.who ?? "못 나옴"
      : teams.find((team) => team.key === entry.team)?.name ?? entry.who ?? "개인";

  const booked = entries.filter((entry) => entry.kind !== "off");
  // 선착순은 합주실마다 따로 센다 — 고른 합주실에 놓인 것만 그 시각을 막는다.
  const grid = takenGrid(
    booked.filter((entry) => room !== null && entry.room === room.name),
    slotCount,
  );
  // 내 팀에 잡힌 배정과, 내가 직접 걸어 둔 것(removeIds 가 실린 것). 개인 이름으로 잡은
  // 예약은 팀이 없어 팀만 보고는 가려낼 수 없다.
  const mine = entries.filter(
    (entry) => entry.removeIds !== undefined
      || (entry.team !== null && teams.some((t) => t.key === entry.team && t.mine)),
  );

  // 내가 지울 수 있는 것만 모은다. 남의 예약과 서버가 배정한 것에는 removeIds 가 없다.
  const removable = entries.filter((entry) => entry.removeIds !== undefined);

  /** 하루를 세로 띠로 그린다. 시각은 왼쪽에 시간 단위로만 적는다. */
  const timeline = (list: Entry[]) => (
    <div className="tlscroll"><div className="tl">
      {Array.from({ length: closeHour - openHour }, (_, i) => openHour + i).map((hour) => (
        <div className="hr" data-h={`${hour}:00`} key={hour} />
      ))}
      {list.map((entry, index) => (
        <span
          className={`evb ${entry.team ? `${entry.team}` : "off"}`}
          style={{ "--from": entry.a, "--span": entry.b - entry.a } as CSSProperties}
          key={index}
        >
          {nameOf(entry)}
          <small>{label(entry.a)}–{endLabel(entry.b)} · {kindLabel(entry)}</small>
        </span>
      ))}
    </div></div>
  );

  const roomsLabel = [...new Set(booked.map((entry) => entry.room).filter(Boolean))].join(" · ");

  // 그날 뭔가 놓인 팀만 명단을 묻는다. 프로필·권한 구역과 같은 열쇠(["members", 팀번호])를
  // 써서, 이미 받아 둔 명단이 있으면 서버를 다시 부르지 않는다.
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

  /** 시각 두 개를 고르는 자리. 이미 찬 칸은 고를 수 없게 잠근다. */
  const picker = (
    prefix: string,
    range: { a: number; b: number },
    setRange: (next: { a: number; b: number }) => void,
    lock: boolean,
  ) => (
    <div className="pick">
      <div className="fld">
        <label htmlFor={`${prefix}-from`}>시작</label>
        <select
          id={`${prefix}-from`}
          value={range.a}
          onChange={(event) => setRange({ ...range, a: Number(event.target.value) })}
        >
          {Array.from({ length: slotCount }, (_, i) => i).map((slot) => (
            <option value={slot} key={slot} disabled={lock && grid[slot]}>
              {label(slot)}{lock && grid[slot] ? " (찼어요)" : ""}
            </option>
          ))}
        </select>
      </div>
      <div className="fld">
        <label htmlFor={`${prefix}-to`}>끝</label>
        <select
          id={`${prefix}-to`}
          value={range.b}
          onChange={(event) => setRange({ ...range, b: Number(event.target.value) })}
        >
          {Array.from({ length: slotCount }, (_, i) => i + 1).map((slot) => (
            <option value={slot} key={slot}>{endLabel(slot)}</option>
          ))}
        </select>
      </div>
    </div>
  );

  /** 걸어 둔 것 하나를 지운다. 예약은 칸마다 번호가 달라 여러 번을 한 번에 넘긴다. */
  const removeEntry = async (entry: Entry) => {
    const ids = entry.removeIds;
    if (ids === undefined || memberId === null) return;
    const when = `${label(entry.a)}–${endLabel(entry.b)}`;
    const booking = entry.kind === "book";
    if (!(booking ? askCancel(`${nameOf(entry)} ${when} 예약`) : askDelete(`${when} 안 되는 시간`))) {
      return;
    }
    try {
      await (booking ? cancelBooking(ids) : removeUnavailable(memberId, ids[0]));
    } catch (error) {
      setError(error instanceof Error ? error.message : "지우지 못했어요.");
      // 걸려도 서버 값을 다시 받는다. 예약은 칸마다 지우므로 앞쪽 몇 칸은 이미 지워졌을
      // 수 있는데, 화면이 옛 번호를 그대로 들고 있으면 다시 눌러도 이미 없는 칸부터
      // 지우려다 같은 자리에서 멈춘다.
      onSaved();
      return;
    }
    setError("");
    onSaved();
    say(booking ? "예약을 취소했어요" : "안 되는 시간을 지웠어요");
  };

  /** 타임라인 아래에 서는 목록. 내가 이 날 걸어 둔 것만 줄로 세워 지울 수 있게 한다.
   *  막대 안에 지우기를 넣지 않는 것은 한 칸짜리 막대가 14px 이라 누를 자리가 없어서다. */
  const myList = removable.length === 0 ? null : (
    <div className="people">
      <h3>내가 걸어 둔 것</h3>
      <ul className="mlist">
        {removable.map((entry) => (
          <li className="prow" key={`${entry.kind}-${entry.removeIds?.[0] ?? entry.a}`}>
            <i className={`dot ${entry.team ?? "off"}`} aria-hidden="true" />
            <span className="nm">{entry.kind === "book" ? nameOf(entry) : "안 되는 시간"}</span>
            <span className="ps">{label(entry.a)}–{endLabel(entry.b)}</span>
            <button
              className="ic danger"
              aria-label={entry.kind === "book"
                ? `${nameOf(entry)} ${label(entry.a)}–${endLabel(entry.b)} 예약 취소`
                : `${label(entry.a)}–${endLabel(entry.b)} 안 되는 시간 삭제`}
              onClick={() => { void removeEntry(entry); }}
            >
              <TrashIcon />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );

  const addOff = async () => {
    const { a, b } = off;
    if (b <= a) { setError("끝나는 시각이 시작보다 뒤여야 해요."); return; }
    if (memberId === null) { setError("내 번호를 아직 못 받아왔어요. 잠시 후 다시 시도해 주세요."); return; }
    try {
      await addUnavailable(
        memberId, isoAt(dayKey, a, openHour), isoAt(dayKey, b, openHour), repeatsWeekly,
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : "등록하지 못했어요.");
      return;
    }
    setError("");
    onSaved();
    say(repeatsWeekly ? "매주 그 시간은 안 되는 것으로 등록했어요" : "안 되는 시간으로 등록했어요");
  };

  const addBooking = async () => {
    const { a, b } = fixed ? { a: fixed.from, b: fixed.to } : book;
    if (b <= a) { setError("끝나는 시각이 시작보다 뒤여야 해요."); return; }
    // 선착순이므로 이미 찬 칸이 하나라도 있으면 먼저 걸러 서버까지 가지 않는다.
    // 두 사람이 동시에 노려 이 검사를 둘 다 통과해도, 최종 판정은 서버(선착순 유니크
    // 제약)가 하므로 아래 catch 에서 서버가 돌려준 사유를 그대로 보여준다.
    for (let i = a; i < b; i += 1) {
      if (grid[i]) { setError(`${label(i)}은 이미 찼어요. 다른 시간을 골라주세요.`); return; }
    }
    if (memberId === null || room === null) {
      setError("예약할 자리를 아직 못 받아왔어요. 잠시 후 다시 시도해 주세요.");
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
    onSaved();
    say(`${dayWithWeekday(dayKey)} ${label(a)}–${endLabel(b)} 예약했어요`);
    onClose();
  };

  const body =
    tab === "all" ? (
      booked.length
        ? <>{timeline(booked)}
            {dayTeams.length === 0 ? null : (
              <div className="people"><h3>이날 나오는 사람</h3>
                {rosterError === undefined ? (
                  <div className="plist">
                    {dayPeople.map(({ team, member }) => (
                      <div className="prow" key={`${team.id}-${member.id}`}>
                        <span
                          className="pic"
                          style={{ background: `var(--${team.key}-tint)`, color: `var(--${team.key})` }}
                        >
                          {member.name.slice(0, 2)}
                        </span>
                        <span className="nm">{member.name} <i>{team.name}</i></span>
                        <span className="ps">{member.cohort === null ? "" : `${member.cohort}기`}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="msg">
                    {rosterError instanceof Error ? rosterError.message : "명단을 못 불러왔어요."}
                  </p>
                )}
              </div>
            )}
          </>
        : <div className="blank"><b>이날은 아무도 안 써요</b><p>합주실이 하루 종일 비어 있어요.</p></div>
    ) : tab === "me" ? (
      <>
        {mine.length
          ? timeline(mine)
          : <div className="blank"><b>이날은 등록한 일정이 없어요</b><p>아래에서 안 되는 시간을 알려주세요.</p></div>}
        {myList}
        <p className="cap2">안 되는 시간</p>
        {picker("off", off, setOff, false)}
        <label className="rep">
          <input
            type="checkbox"
            checked={repeatsWeekly}
            onChange={(event) => setRepeatsWeekly(event.target.checked)}
          />
          매주 같은 요일·같은 시간에도 안 돼요
        </label>
        <p className="msg">{error}</p>
        <p className="tip">여기 넣은 시간에는 자동 배정이 절대 잡지 않아요.</p>
      </>
    ) : (
      <>
        {fixed
          ? <div className="bigtime"><b>{label(fixed.from)} – {endLabel(fixed.to)}</b><small>이 시간으로 예약해요</small></div>
          : timeline(booked)}
        {/* 합주실을 먼저 고른다 — 아래 시각 고르기가 그 합주실에 찬 자리만 잠근다. */}
        <p className="cap2">어디서 쓰실 건가요</p>
        <div className="pick">
          <div className="fld">
            <label htmlFor="broom">합주실</label>
            <select
              id="broom"
              value={room?.id ?? ""}
              onChange={(event) => setRoomId(Number(event.target.value))}
            >
              {rooms.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
            </select>
          </div>
        </div>
        {fixed ? null : <><p className="cap2">언제 쓰실 건가요</p>{picker("book", book, setBook, true)}</>}
        <p className="cap2">누구 이름으로 할까요</p>
        <div className="who2">
          <button aria-pressed={who === "me"} onClick={() => setWho("me")}>{myName} (나)</button>
          {teams.filter((team) => team.mine).map((team) => (
            <button key={team.id} aria-pressed={who === team.key} onClick={() => setWho(team.key)}>
              {team.name}
            </button>
          ))}
        </div>
        <p className="msg">{error}</p>
        {fixed ? <p className="tip">먼저 누른 사람이 가져가요. 예약한 뒤에는 내 일정에서 취소할 수 있어요.</p> : null}
      </>
    );

  const hint = `${roomsLabel || "합주실"} · ${hourText(openHour)}–${hourText(closeHour)}`
    + ` · 1시간 단위 · ${inFocus ? "배정된 기간" : "배정 없음"}`;

  // 보기만 하는 탭(all)에는 아래 단추 줄을 주지 않는다 — Modal 이 줄 자체를 그리지 않는다.
  const foot = tab === "all" ? undefined : (
    <>
      <button className="ghost" onClick={onClose}>닫기</button>
      <button
        className="primary"
        onClick={() => { void (tab === "me" ? addOff() : addBooking()); }}
      >
        {tab === "me" ? "등록하기" : "예약하기"}
      </button>
    </>
  );

  return (
    <Modal title={dayWithWeekday(dayKey)} hint={hint} foot={foot} onClose={onClose}>
      {body}
    </Modal>
  );
}
