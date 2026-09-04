import { useEffect, useRef, useState } from "react";

import { CloseIcon } from "../components/icons";
import { addReservation, addUnavailable, isoAt, slotLabel, takenGrid } from "../lib/pipeline";


/** 하루에 놓인 것 하나. 배정은 서버가 준 것이고, 예약과 못 나오는 시간은 화면이 넣은 것이다. */
/** 달력이 그리는 팀 — 서버 규격(lib/contract 의 Team)이 아니라 이 화면이
 *  확정 시간표에서 만들어 쓰는 것이다. 색(key)과 내 팀인지(mine)를 함께 든다. */
export type DayTeam = { id: number; name: string; key: string; mine: boolean };

export type Entry = {
  kind: "assign" | "book" | "off";
  team: string | null;
  room?: string;
  who?: string;
  a: number;
  b: number;
};

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const PIXELS_PER_SLOT = 17;

function dayTitle(key: string): string {
  const date = new Date(`${key}T00:00:00`);
  return `${date.getMonth() + 1}월 ${date.getDate()}일 ${WEEKDAYS[date.getDay()]}요일`;
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
  /** 예약을 넣을 합주실 번호. 방을 고르는 자리가 화면에 없어 하나로 고정해 받는다. */
  roomId: number | null;
  /** 서버 저장이 성공한 뒤 화면이 최신 값을 다시 받아오게 알린다. */
  onSaved: () => void;
  onSay: (message: string) => void;
  onClose: () => void;
}) {
  const { dayKey, tab, teams, entries, openHour, closeHour, slotCount, fixed, inFocus } = props;
  const { memberId, roomId, onSaved, onSay, onClose } = props;

  const dialog = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState("");
  const [who, setWho] = useState("me");

  // <dialog> 는 showModal 로 열어야 뒤쪽을 가리고 초점이 안으로 들어간다.
  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const label = (index: number) => slotLabel(index, openHour);
  const endLabel = (index: number) => (index >= slotCount ? `${closeHour}:00` : label(index));
  const nameOf = (entry: Entry) =>
    entry.kind === "off"
      ? entry.who ?? "못 나옴"
      : teams.find((team) => team.key === entry.team)?.name ?? entry.who ?? "개인";

  const booked = entries.filter((entry) => entry.kind !== "off");
  const grid = takenGrid(booked, slotCount);
  const mine = entries.filter(
    (entry) => entry.kind === "off" || (entry.team !== null && teams.some((t) => t.key === entry.team && t.mine)),
  );

  /** 하루를 세로 띠로 그린다. 시각은 왼쪽에 시간 단위로만 적는다. */
  const timeline = (list: Entry[]) => (
    <div className="tl">
      {Array.from({ length: closeHour - openHour }, (_, i) => openHour + i).map((hour) => (
        <div className="hr" data-h={`${hour}:00`} key={hour} />
      ))}
      {list.map((entry, index) => (
        <span
          className={`evb ${entry.team ? `${entry.team}` : "off"}`}
          style={{ top: entry.a * PIXELS_PER_SLOT, height: (entry.b - entry.a) * PIXELS_PER_SLOT - 3 }}
          key={index}
        >
          {nameOf(entry)}
          <small>{label(entry.a)}–{endLabel(entry.b)} · {kindLabel(entry)}</small>
        </span>
      ))}
    </div>
  );

  const roomsLabel = [...new Set(booked.map((entry) => entry.room).filter(Boolean))].join(" · ");

  /** 시각 두 개를 고르는 자리. 이미 찬 칸은 고를 수 없게 잠근다. */
  const picker = (fromName: string, toName: string, lock: boolean) => (
    <div className="pick">
      <div className="fld">
        <label htmlFor={fromName}>시작</label>
        <select id={fromName} name={fromName} defaultValue="16">
          {Array.from({ length: slotCount }, (_, i) => i).map((slot) => (
            <option value={slot} key={slot} disabled={lock && grid[slot]}>
              {label(slot)}{lock && grid[slot] ? " (찼어요)" : ""}
            </option>
          ))}
        </select>
      </div>
      <div className="fld">
        <label htmlFor={toName}>끝</label>
        <select id={toName} name={toName} defaultValue="24">
          {Array.from({ length: slotCount }, (_, i) => i + 1).map((slot) => (
            <option value={slot} key={slot}>{endLabel(slot)}</option>
          ))}
        </select>
      </div>
    </div>
  );

  const readValue = (name: string): number =>
    Number((document.getElementById(name) as HTMLSelectElement | null)?.value ?? 0);

  const addOff = async () => {
    const a = readValue("mf");
    const b = readValue("mt");
    if (b <= a) { setError("끝나는 시각이 시작보다 뒤여야 해요."); return; }
    if (memberId === null) { setError("내 번호를 아직 못 받아왔어요. 잠시 후 다시 시도해 주세요."); return; }
    try {
      await addUnavailable(memberId, isoAt(dayKey, a, openHour), isoAt(dayKey, b, openHour));
    } catch (error) {
      setError(error instanceof Error ? error.message : "등록하지 못했어요.");
      return;
    }
    setError("");
    onSaved();
    onSay("안 되는 시간으로 등록했어요");
  };

  const addBooking = async () => {
    const a = fixed ? fixed.from : readValue("bf");
    const b = fixed ? fixed.to : readValue("bt");
    if (b <= a) { setError("끝나는 시각이 시작보다 뒤여야 해요."); return; }
    // 선착순이므로 이미 찬 칸이 하나라도 있으면 먼저 걸러 서버까지 가지 않는다.
    // 두 사람이 동시에 노려 이 검사를 둘 다 통과해도, 최종 판정은 서버(선착순 유니크
    // 제약)가 하므로 아래 catch 에서 서버가 돌려준 사유를 그대로 보여준다.
    for (let i = a; i < b; i += 1) {
      if (grid[i]) { setError(`${label(i)}은 이미 찼어요. 다른 시간을 골라주세요.`); return; }
    }
    if (memberId === null || roomId === null) {
      setError("예약할 자리를 아직 못 받아왔어요. 잠시 후 다시 시도해 주세요.");
      return;
    }
    const teamId = who === "me" ? null : teams.find((team) => team.key === who)?.id ?? null;
    try {
      await addReservation({
        room_id: roomId,
        member_id: memberId,
        team_id: teamId,
        starts_at: isoAt(dayKey, a, openHour),
        ends_at: isoAt(dayKey, b, openHour),
      });
    } catch (error) {
      setError(error instanceof Error ? error.message : "예약하지 못했어요.");
      return;
    }
    onSaved();
    onSay(`${dayTitle(dayKey)} ${label(a)}–${endLabel(b)} 예약했어요`);
    onClose();
  };

  const body =
    tab === "all" ? (
      booked.length
        ? <>{timeline(booked)}
            <div className="people"><h3>이날 나오는 사람</h3>
              <p style={{ opacity: .7, padding: "6px 2px" }}>팀 명단을 주는 API 가 아직 없습니다 (미연동)</p>
            </div>
          </>
        : <div className="blank"><b>이날은 아무도 안 써요</b><p>합주실이 하루 종일 비어 있어요.</p></div>
    ) : tab === "me" ? (
      <>
        {mine.length
          ? timeline(mine)
          : <div className="blank"><b>이날은 등록한 일정이 없어요</b><p>아래에서 안 되는 시간을 알려주세요.</p></div>}
        <p className="cap2">안 되는 시간</p>
        {picker("mf", "mt", false)}
        <p className="msg">{error}</p>
        <p className="tip">여기 넣은 시간에는 자동 배정이 절대 잡지 않아요.</p>
      </>
    ) : (
      <>
        {fixed
          ? <div className="bigtime"><b>{label(fixed.from)} – {endLabel(fixed.to)}</b><small>이 시간으로 예약해요</small></div>
          : <>{timeline(booked)}<p className="cap2">언제 쓰실 건가요</p>{picker("bf", "bt", true)}</>}
        <p className="cap2">누구 이름으로 할까요</p>
        <div className="who2">
          <button aria-pressed={who === "me"} onClick={() => setWho("me")}>이도현 (나)</button>
          {teams.filter((team) => team.mine).map((team) => (
            <button key={team.id} aria-pressed={who === team.key} onClick={() => setWho(team.key)}>
              {team.name}
            </button>
          ))}
        </div>
        <p className="msg">{error}</p>
        {fixed ? <p className="tip">먼저 누른 사람이 가져가요. 예약한 뒤에도 취소하거나 시간을 바꿀 수 있어요.</p> : null}
      </>
    );

  return (
    <dialog ref={dialog} aria-labelledby="modalTitle" onClose={onClose}>
      <div className="mhead">
        <div>
          <h2 id="modalTitle">{dayTitle(dayKey)}</h2>
          <p>
            {roomsLabel || "합주실"} · {String(openHour).padStart(2, "0")}:00–{String(closeHour).padStart(2, "0")}:00
            {" · 30분 단위 · "}{inFocus ? "배정된 기간" : "배정 없음"}
          </p>
        </div>
        <button aria-label="닫기" onClick={() => dialog.current?.close()}><CloseIcon /></button>
      </div>

      <div className="mbody">{body}</div>

      {tab === "all" ? null : (
        <div className="mfoot">
          <button className="ghost" onClick={() => dialog.current?.close()}>닫기</button>
          <button
            className="primary"
            onClick={() => { void (tab === "me" ? addOff() : addBooking()); }}
          >
            {tab === "me" ? "등록하기" : "예약하기"}
          </button>
        </div>
      )}
    </dialog>
  );
}
