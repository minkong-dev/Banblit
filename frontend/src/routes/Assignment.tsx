import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AppShell, Card, Panel, Tabs } from "../components/AppShell";
import { getJSON } from "../lib/api";
import { datesBetween } from "../lib/calendar";
import { dayOf, hhmm, mergeSessions } from "../lib/slots";
import type { Session } from "../lib/slots";
import { useToast } from "../useToast";
import "../styles/assignment.css";

// 기간 목록을 주는 API 가 아직 없어 시드가 넣은 번호를 그대로 쓴다.
const PERIOD_IDS = [1, 2];
// 팀·합주실 목록 API 도 없다. 확정된 시간표에서 번호를 뽑고, 비어 있으면 이것을 쓴다.
const FALLBACK_TEAM_IDS = [1, 2, 3, 4];
const FALLBACK_ROOM_IDS = [1, 2];
const WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"];
const MINUTES_PER_HOUR = 60;

type ScheduleRow = {
  team_id: number; team: string; room_id: number; room: string; start: string; end: string;
};
type Slot = { room_id: number; room: string; start: string; end: string };
type AssignmentOut = { feasible: boolean; slots_by_team: Record<string, Slot[]> };
type AssignOut = {
  saved: boolean;
  assignment: AssignmentOut;
  proposals: { excluded_member: { id: number; name: string }; assignment: AssignmentOut }[];
};

/** 팀별로 나뉘어 온 칸을 한 줄로 펴서 합주 한 번씩으로 합친다. */
function sessionsOf(byTeam: Record<string, Slot[]>): Session[] {
  const flat: Session[] = [];
  for (const [team, slots] of Object.entries(byTeam)) {
    for (const slot of slots) {
      flat.push({ team, room: slot.room, start: slot.start, end: slot.end });
    }
  }
  return mergeSessions(flat);
}

function minutesOf(session: Session): number {
  return (new Date(session.end).getTime() - new Date(session.start).getTime()) / 60000;
}

/** 팀 이름에 색을 하나씩 매긴다. 이름 순으로 매겨야 다시 그려도 색이 안 바뀐다. */
function colorsOf(sessions: Session[]): Map<string, string> {
  const names = [...new Set(sessions.map((session) => session.team))].sort();
  return new Map(names.map((name, index) => [name, `c${(index % 4) + 1}`]));
}

export function Assignment() {
  const { message, say } = useToast();
  const queryClient = useQueryClient();
  const [periodId, setPeriodId] = useState(PERIOD_IDS[0]);
  const [view, setView] = useState("now");

  const schedule = useQuery({
    queryKey: ["schedule", periodId],
    queryFn: () => getJSON<{ rows: ScheduleRow[] }>(`/periods/${periodId}/schedule`),
  });
  const rows = schedule.data?.rows ?? [];

  const recompute = useMutation({
    mutationFn: (body: { team_ids: number[]; room_ids: number[] }) =>
      getJSON<AssignOut>(`/periods/${periodId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: async (result) => {
      // 저장까지 끝났으면 확정 시간표를 다시 받아 화면과 서버를 맞춘다.
      await queryClient.invalidateQueries({ queryKey: ["schedule", periodId] });
      setView("now");
      say(
        result.assignment.feasible
          ? result.saved ? "배정을 새로 확정했습니다" : "배정은 됐지만 저장되지 않았습니다"
          : `자리를 다 채우지 못했습니다 · 조율안 ${result.proposals.length}개`,
      );
    },
    onError: () => say("계산하지 못했습니다"),
  });

  const confirmed = useMemo(
    () => mergeSessions(rows.map((row) => ({
      team: row.team, room: row.room, start: row.start, end: row.end,
    }))),
    [rows],
  );

  const proposals = recompute.data?.proposals ?? [];
  const proposalIndex = view.startsWith("p") ? Number(view.slice(1)) : null;
  const shown = useMemo(() => {
    if (proposalIndex === null) return confirmed;
    const proposal = proposals[proposalIndex];
    return proposal ? sessionsOf(proposal.assignment.slots_by_team) : confirmed;
  }, [proposalIndex, proposals, confirmed]);

  const colors = useMemo(() => colorsOf([...confirmed, ...shown]), [confirmed, shown]);

  // 확정 시간표에 나온 번호를 재계산에 그대로 넘긴다. 비어 있으면 시드 번호를 쓴다.
  const uniqueSorted = (values: number[]) => [...new Set(values)].sort((a, b) => a - b);
  const teamIds = rows.length ? uniqueSorted(rows.map((row) => row.team_id)) : FALLBACK_TEAM_IDS;
  const roomIds = rows.length ? uniqueSorted(rows.map((row) => row.room_id)) : FALLBACK_ROOM_IDS;

  const tabs = [
    { key: "now", text: "지금 확정된 것" },
    ...proposals.map((_, index) => ({
      key: `p${index}`,
      text: `${String.fromCharCode(65 + index)}안`,
    })),
  ];

  const days = shown.length
    ? datesBetween(
        dayOf(shown.map((session) => session.start).sort()[0]),
        dayOf(shown.map((session) => session.start).sort().reverse()[0]),
      )
    : [];

  const counts = (
    <div className="counts">
      {[...colors.entries()].map(([name, tone]) => {
        const own = shown.filter((session) => session.team === name);
        const hours = own.reduce((sum, session) => sum + minutesOf(session), 0) / MINUTES_PER_HOUR;
        return (
          <span className={own.length ? "cnt" : "cnt short"} key={name}>
            <i style={{ background: `var(--${tone})` }} />{name}
            {" 합주 "}<b>{own.length}번</b>{` · ${hours.toFixed(1)}시간`}
          </span>
        );
      })}
    </div>
  );

  const again = (
    <div className="act">
      <button className="btn main" disabled={recompute.isPending}
        onClick={() => recompute.mutate({ team_ids: teamIds, room_ids: roomIds })}>
        {recompute.isPending ? "계산하는 중…" : "지금 다시 계산"}
      </button>
    </div>
  );

  let under;
  if (schedule.isError || recompute.isError) {
    const error = schedule.error ?? recompute.error;
    under = (
      <>
        <h2>서버가 요청을 받지 못했습니다</h2>
        <p className="sub">{error instanceof Error ? error.message : "알 수 없는 오류"}</p>
        {again}
      </>
    );
  } else if (proposalIndex !== null && proposals[proposalIndex]) {
    const who = proposals[proposalIndex].excluded_member;
    under = (
      <>
        <h2>{who.name}(#{who.id}) 을 빼면 이렇게 됩니다</h2>
        <p className="sub">
          이 사람의 못 나오는 시간 때문에 팀 전원이 모일 자리를 찾지 못했습니다.
          빠지는 것은 이 기간의 합주뿐입니다.
        </p>
        {counts}
        <div className="note">
          달력이 이 안대로 바뀐 시간표를 보여주고 있습니다.
          고르기(확정) 기능은 아직 서버에 없어 지금은 보기만 합니다.
        </div>
        <div className="act">
          <button className="btn" onClick={() => setView("now")}>지금 것으로 돌아가기</button>
        </div>
      </>
    );
  } else if (confirmed.length === 0) {
    under = (
      <>
        <h2>아직 확정된 시간표가 없습니다</h2>
        <p className="sub">
          이 기간은 자동 배정이 아직 자리를 다 채우지 못했습니다.
          빈 시간표를 내보내지 않고 여기서 멈춰 있습니다.
        </p>
        {counts}
        <div className="note">
          아래 <b>지금 다시 계산</b>을 누르면 서버가 배정을 돌립니다.
          풀리지 않으면 누구를 빼면 되는지 <b>A안·B안</b> 탭으로 나옵니다.
        </div>
        {again}
      </>
    );
  } else {
    const hours = shown.reduce((sum, session) => sum + minutesOf(session), 0) / MINUTES_PER_HOUR;
    under = (
      <>
        <h2>확정된 시간표입니다</h2>
        <p className="sub">
          합주 {shown.length}번 · 모두 합쳐 {hours.toFixed(1)}시간. 서버에 저장된 배정을 그대로 보여줍니다.
        </p>
        {counts}
        <div className="note">다시 계산하면 지금 시간표는 백업으로 밀려나고 새 결과가 확정됩니다.</div>
        {again}
      </>
    );
  }

  return (
    <AppShell
      page="admin"
      current="assign"
      toast={message}
      profile={
        <button className="profbtn">
          <span className="face" aria-hidden="true">박서</span>
          <span className="nm">박서연</span>
          <span className="role">헤드매니저</span>
        </button>
      }
    >
      <Tabs label="배정안" items={tabs} selected={view} onSelect={setView} />

      <div className="main">
        <Card>
          <div className="calhead">
            <b>집중 합주기간</b>
            <span>
              {days.length ? `${days[0]} – ${days[days.length - 1]}` : "표시할 일정 없음"}
              {" · 기간 "}
              <select value={periodId} aria-label="기간 고르기"
                onChange={(event) => { setPeriodId(Number(event.target.value)); setView("now"); }}>
                {PERIOD_IDS.map((id) => <option value={id} key={id}>{id}번</option>)}
              </select>
            </span>
            <div className="keys">
              {[...colors.entries()].map(([name, tone]) => (
                <i key={name}><em style={{ background: `var(--${tone})` }} />{name}</i>
              ))}
            </div>
          </div>

          <div className="dow">{WEEKDAYS.map((name) => <span key={name}>{name}</span>)}</div>

          <div className="grid">
            {days.length === 0 ? (
              <div className="day" style={{ gridColumn: "1/-1" }}>
                <span className="free">표시할 일정이 없습니다</span>
              </div>
            ) : (
              <>
                {/* 요일 머리글이 월요일부터라 첫 주의 앞쪽을 빈 칸으로 채운다. */}
                {Array.from(
                  { length: (new Date(`${days[0]}T12:00:00`).getDay() + 6) % 7 },
                  (_, i) => <div className="day" aria-hidden="true" key={`pad-${i}`} />,
                )}
                {days.map((key) => {
                  const date = new Date(`${key}T12:00:00`);
                  const items = shown
                    .filter((session) => dayOf(session.start) === key)
                    .sort((x, y) => x.start.localeCompare(y.start));
                  return (
                    <div className={date.getDay() === 0 ? "day sunday" : "day"} key={key}>
                      <span className="n">{date.getDate()}</span>
                      {items.map((session, index) => (
                        <div className={`ses ${colors.get(session.team) ?? "c1"}`} key={index}>
                          {session.team}
                          <small>{hhmm(session.start)}–{hhmm(session.end)}</small>
                          <span className="out">{session.room}</span>
                        </div>
                      ))}
                      {items.length ? null : <span className="free">합주 없음</span>}
                    </div>
                  );
                })}
              </>
            )}
          </div>

          <div className="under">{under}</div>
        </Card>
      </div>

      <div className="rail">
        <Panel title="지난 계산" hint="누르면 그때 시간표를 봅니다">
          <ul>
            <li style={{ padding: "12px 14px", opacity: .72, lineHeight: 1.6 }}>
              <b>미연동</b><br />지난 계산 이력을 주는 API 가 아직 없습니다.
            </li>
          </ul>
        </Panel>
        <section className="panel">
          <div className="times">
            <div className="k">계산이 도는 시각</div>
            <div className="t">미연동</div>
            <p>읽고 쓸 API 가 아직 없어 이 자리를 잠가 두었습니다.</p>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
