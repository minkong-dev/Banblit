import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AppShell, Card, Panel, Tabs } from "../components/AppShell";
import { getJSON, reason } from "../lib/api";
import { say } from "../lib/toast";
import { runAssignment } from "../lib/pipeline";
import type { AssignBody } from "../lib/pipeline";
import { useMe, usePeriods, useRooms, useTeams } from "../components/hooks";
import { can } from "../lib/account";
import { checkRunTimes, slotCountLabel } from "../lib/runs";
import "../styles/assignment.css";
import type { AssignOut, Backup, Period, ScheduleRow, Slot } from "../lib/contract";
import { colorKey, datesBetween, dayOf, hhmm, mergeSessions, stampLabel, WEEKDAY_NAMES } from "../lib/pipeline";
import type { Session } from "../lib/pipeline";

const MINUTES_PER_HOUR = 60;
const HALF_HOUR_SECONDS = 1800;

/** 달력이 보이는 것 — 지금 확정된 시간표, 조율안 n번, 지난 회차 하나. */
type View = { kind: "now" } | { kind: "proposal"; index: number } | { kind: "round"; at: string };
const NOW: View = { kind: "now" };

// 탭은 글자 키만 받는다. 글자와 View 를 오가는 곳은 아래 둘뿐이다.
function tabKey(view: View): string {
  if (view.kind === "proposal") return `p${view.index}`;
  return view.kind === "round" ? `r:${view.at}` : "now";
}

function viewOf(key: string): View {
  if (key.startsWith("p")) return { kind: "proposal", index: Number(key.slice(1)) };
  return key.startsWith("r:") ? { kind: "round", at: key.slice(2) } : NOW;
}


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

/** 계산이 끝난 뒤 알릴 한 줄. 자리를 다 채웠는지, 채웠으면 저장까지 됐는지로 갈린다. */
function runResultText(result: AssignOut): string {
  if (!result.assignment.feasible) {
    return `모든 시간을 다 사용하지는 못했어요 · 배정 제안 ${result.proposals.length}건`;
  }
  return result.saved ? "선택한 배정으로 확정했어요" : "해당 배정을 선택하지 않았어요";
}

/** 팀 이름에 색을 하나씩 매긴다. 이름 순으로 매겨야 다시 그려도 색이 안 바뀐다. */
function colorsOf(sessions: Session[]): Map<string, string> {
  const names = [...new Set(sessions.map((session) => session.team))].sort();
  return new Map(names.map((name, index) => [name, colorKey(index)]));
}

export function Assignment() {
  const { me } = useMe();
  const queryClient = useQueryClient();
  const [periodId, setPeriodId] = useState<number | null>(null);
  const [view, setView] = useState<View>(NOW);
  // 계산 시각은 고친 것만 여기 담는다. 기간을 바꾸면 담긴 번호가 어긋나므로 그때는
  // 다시 서버 값으로 돌아간다 — useEffect 로 맞추지 않고 그릴 때마다 번호를 견준다.
  const [runForm, setRunForm] = useState<{ id: number; first: string; second: string } | null>(null);

  const periods = usePeriods();
  // 이 화면은 집중 합주기간만 다룬다 — 상시 개방 기간은 자동 배정 대상이 아니다.
  const focusedPeriods = (periods.data?.periods ?? []).filter((period) => period.kind === "focused");
  // 사람이 아직 고르지 않았으면 목록의 첫 기간을 쓴다. useEffect 로 동기화하지 않고
  // 그릴 때마다 이렇게 계산한다.
  const activePeriodId = periodId ?? focusedPeriods[0]?.id ?? null;

  const rooms = useRooms();

  const teams = useTeams();

  const schedule = useQuery({
    queryKey: ["schedule", activePeriodId],
    queryFn: () => {
      if (activePeriodId === null) throw new Error("선택할 집중 합주기간이 없어요");
      return getJSON<{ rows: ScheduleRow[] }>(`/periods/${activePeriodId}/schedule`);
    },
    enabled: activePeriodId !== null,
  });
  // schedule.data 가 없을 때만 매번 새 빈 배열이 생긴다 — 아래 useMemo 가 그동안 다시
  // 돌아도 빈 배열을 합치는 가벼운 계산이라 따로 감쌀 만큼은 아니다.
  const rows = schedule.data?.rows ?? [];

  const recompute = useMutation({
    mutationFn: (body: AssignBody) => {
      if (activePeriodId === null) throw new Error("선택할 집중 합주기간이 없어요");
      // 서버는 접수만 하고 곧바로 답한다. 끝날 때까지 되묻는 것은 runAssignment 다.
      return runAssignment<AssignOut>(activePeriodId, body);
    },
    onSuccess: async (result) => {
      // 저장까지 끝났으면 확정 시간표를 다시 받아 화면과 서버를 맞춘다.
      await queryClient.invalidateQueries({ queryKey: ["schedule", activePeriodId] });
      // 저장이 됐으면 이전 시간표가 회차로 밀려나므로 목록도 다시 받는다.
      await queryClient.invalidateQueries({ queryKey: ["backups", activePeriodId] });
      setView(NOW);
      say(runResultText(result));
    },
    onError: () => say("엔진이 연산에 실패했어요"),
  });

  // 조율안 확정 — 그 사람을 뺀 채로 같은 계산을 다시 돌려 저장한다. 서버 경로가
  // 다를 뿐 결과를 받는 방식은 재계산과 같다.
  const confirm = useMutation({
    mutationFn: (memberId: number) => {
      if (activePeriodId === null) throw new Error("선택할 집중 합주기간이 없어요");
      return runAssignment<AssignOut>(
        activePeriodId, { team_ids: teamIds, room_ids: roomIds }, memberId,
      );
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["schedule", activePeriodId] });
      await queryClient.invalidateQueries({ queryKey: ["backups", activePeriodId] });
      setView(NOW);
      say(result.saved ? "선택한 배정으로 확정했어요" : "해당 배정을 선택하지 않았어요");
    },
    onError: () => say("해당 배정을 선택하는데 실패했어요"),
  });

  const rollback = useMutation({
    mutationFn: () => {
      if (activePeriodId === null) throw new Error("선택할 집중 합주기간이 없어요");
      // 회차를 받지 않는 endpoint 다. 언제나 바로 직전 회차로만 되돌아간다.
      return getJSON<{ rolled_back: boolean }>(`/periods/${activePeriodId}/rollback`, {
        method: "POST",
      });
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["schedule", activePeriodId] });
      // 되돌린 회차는 목록에서 빠진다.
      await queryClient.invalidateQueries({ queryKey: ["backups", activePeriodId] });
      setView(NOW);
      say(result.rolled_back ? "이전 배정안으로 되돌렸어요" : "이전 배정기록이 없어요");
    },
    // 서버가 거절한 사유를 그대로 보여준다 — 방·시각이 겹쳐 되돌리지 못하는 경우가 있다.
    onError: (error) => say(error instanceof Error ? error.message : "이전 배정기록으로 되돌리는데 실패했어요"),
  });

  // 되돌리기 항목이 없으면 이 목록도 부르지 않는다 — 서버가 같은 항목으로 막고 있어
  // 불러봐야 403 이고, 화면에도 그 칸을 두지 않는다.
  const canRollbackNow = can(me, "rollback");
  const backups = useQuery({
    queryKey: ["backups", activePeriodId],
    queryFn: () => {
      if (activePeriodId === null) throw new Error("선택할 집중 합주기간이 없어요");
      return getJSON<{ backups: Backup[] }>(`/periods/${activePeriodId}/backups`);
    },
    enabled: activePeriodId !== null && canRollbackNow,
  });

  // 고른 회차. 조율안과 같은 view 하나를 쓰므로 달력·아래 설명·탭이 한 값만 보고 갈린다.
  const roundAt = view.kind === "round" ? view.at : null;
  const round = useQuery({
    queryKey: ["backup-round", activePeriodId, roundAt],
    queryFn: () => {
      if (activePeriodId === null || roundAt === null) throw new Error("선택할 이전 배정기록이 없어요");
      return getJSON<{ rows: ScheduleRow[] }>(
        `/periods/${activePeriodId}/backups/${encodeURIComponent(roundAt)}`,
      );
    },
    enabled: activePeriodId !== null && roundAt !== null,
  });

  const saveRunTimes = useMutation({
    mutationFn: (body: { first_run_at: string; second_run_at: string }) => {
      if (activePeriodId === null) throw new Error("선택할 집중 합주기간이 없어요");
      return getJSON<{ period: Period }>(`/periods/${activePeriodId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
    },
    onSuccess: async () => {
      // 고친 값을 서버에서 다시 받아 화면과 맞춘다. 받아온 뒤에는 고친 자국을 버린다.
      await queryClient.invalidateQueries({ queryKey: ["periods"] });
      setRunForm(null);
      say("엔진 연산 시간을 저장했어요");
    },
    onError: (error) => say(error instanceof Error ? error.message : "엔진 연산 시간을 저장하는데 실패했어요."),
  });

  const confirmed = useMemo(
    () => mergeSessions(rows.map((row) => ({
      team: row.team, room: row.room, start: row.start, end: row.end,
    }))),
    [rows],
  );

  // recompute.data 가 없을 때만 매번 새 빈 배열이 생긴다 — 재계산 전에는 proposals 를
  // 쓰는 곳도 없어 아래 useMemo 가 다시 돌아도 비용이 없다.
  const proposals = recompute.data?.proposals ?? [];
  const proposalIndex = view.kind === "proposal" ? view.index : null;
  const roundRows = round.data?.rows ?? [];
  const roundSessions = useMemo(
    () => mergeSessions(roundRows.map((row) => ({
      team: row.team, room: row.room, start: row.start, end: row.end,
    }))),
    [roundRows],
  );
  const shown = useMemo(() => {
    if (roundAt !== null) return roundSessions;
    if (proposalIndex === null) return confirmed;
    const proposal = proposals[proposalIndex];
    return proposal ? sessionsOf(proposal.assignment.slots_by_team) : confirmed;
  }, [roundAt, roundSessions, proposalIndex, proposals, confirmed]);

  const colors = useMemo(() => colorsOf([...confirmed, ...shown]), [confirmed, shown]);

  // 확정 시간표에 나온 번호를 재계산에 그대로 넘긴다. 아직 아무것도 확정되지 않았으면
  // 목록 endpoint 가 준 전체를 쓴다.
  const uniqueSorted = (values: number[]) => [...new Set(values)].sort((a, b) => a - b);
  const teamIds = rows.length
    ? uniqueSorted(rows.map((row) => row.team_id))
    : (teams.data?.teams ?? []).map((team) => team.id);
  const roomIds = rows.length
    ? uniqueSorted(rows.map((row) => row.room_id))
    : (rooms.data?.rooms ?? []).map((room) => room.id);

  const tabs = [
    { key: "now", text: "현재 확정된 배정안" },
    ...proposals.map((_, index) => ({
      key: `p${index}`,
      text: `${String.fromCharCode(65 + index)}안`,
    })),
    ...(roundAt === null ? [] : [{ key: `r:${roundAt}`, text: stampLabel(roundAt) }]),
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

  // 단추마다 필요한 항목이 다르다 — 계산은 assign_run, 되돌리기는 rollback.
  // 둘 다 없으면 줄 자체를 두지 않는다.
  const canRun = can(me, "assign_run");
  const canRollback = canRollbackNow;
  const again = !canRun && !canRollback ? null : (
    <div className="act">
      {!canRun ? null : (
        <button className="btn main" disabled={recompute.isPending || activePeriodId === null}
          onClick={() => recompute.mutate({ team_ids: teamIds, room_ids: roomIds })}>
          {recompute.isPending ? "스케줄링 진행 중…" : "스케줄링"}
        </button>
      )}
      {/* ponytail: 되돌리기는 무를 수 없어 한 번 되묻는다. 이 화면에는 확인 대화상자가
          없어 브라우저 것을 쓴다. 화면 자체의 대화상자가 생기면 그것으로 옮긴다. */}
      {!canRollback ? null : (
        <button className="btn" disabled={rollback.isPending || activePeriodId === null}
          onClick={() => {
            if (window.confirm("현재 확정된 시간표를 해당 배정안으로 되돌려요. 해당 작업은 진행 후 다시 복구하기 어려워요. 그래도 되돌릴까요?")) {
              rollback.mutate();
            }
          }}>
          {rollback.isPending ? "되돌리는 중…" : "이전 배정안으로 되돌리기"}
        </button>
      )}
    </div>
  );

  let under;
  if (periods.isError || rooms.isError || teams.isError || schedule.isError || recompute.isError) {
    const error = periods.error ?? rooms.error ?? teams.error ?? schedule.error ?? recompute.error;
    under = (
      <>
        <h2>서버가 요청을 받지 못했어요</h2>
        <p className="sub">{error instanceof Error ? error.message : "알 수 없는 오류"}</p>
        {again}
      </>
    );
  } else if (roundAt !== null) {
    const hours = shown.reduce((sum, session) => sum + minutesOf(session), 0) / MINUTES_PER_HOUR;
    under = (
      <>
        <h2>{stampLabel(roundAt)}에 밀려난 시간표입니다</h2>
        <p className="sub">
          {round.isPending
            ? "불러오는 중…"
            : round.isError
              ? reason(round.error, "해당 배정안을 불러오지 못했어요")
              : `합주 ${shown.length}번 · 총 ${hours.toFixed(1)}시간이에요`}
        </p>
        {counts}
        <div className="act">
          <button className="btn" onClick={() => setView(NOW)}>현재 배정안으로 돌아가기</button>
        </div>
      </>
    );
  } else if (proposalIndex !== null && proposals[proposalIndex]) {
    const who = proposals[proposalIndex].excluded_member;
    under = (
      <>
        <h2>{who.name} 멤버를 제외하면 될 것 같아요.</h2>
        <p className="sub">
          해당 인원의 불가능 시간으로 인해 이상적인 배정안을 찾지 못했어요.
        </p>
        {counts}
        <div className="note">
          현재 캘린더는 해당 멤버를 제외한 예상 결과를 보여주고 있어요.
          확정할 경우에만 해당 배정안으로 확정되니, 신중하게 결정해주세요.
        </div>
        <div className="act">
          {!can(me, "proposal_confirm") ? null : (
            <button className="btn main" disabled={confirm.isPending}
              onClick={() => confirm.mutate(who.id)}>
              {confirm.isPending ? "배정안 확정 중…" : "해당 배정안으로 확정"}
            </button>
          )}
          <button className="btn" onClick={() => setView(NOW)}>현재 배정안으로 돌아가기</button>
        </div>
      </>
    );
  } else if (confirmed.length === 0) {
    under = (
      <>
        <h2>현재 확정된 배정안이 없어요</h2>
        <p className="sub">
          현재 팀이나 멤버가 없거나, 집중 합주기간이 아니에요. 
          생성된 팀과 가입한 멤버가 있는지 확인해주세요.
        </p>
        {counts}
        {/* 계산 단추를 감춘 사람에게 그 단추를 누르라고 안내하지 않는다. */}
        <div className="note">
          {canRun ? (
            <>
              아래의 <b>스케줄링</b> 버튼을 누르면 스케줄링 엔진이 즉시 다시 연산을 시작해요.
              즉시 연산이 필요할 경우에만 사용해주세요.
            </>
          ) : (
            "관리자가 배정을 진행할 경우 배정안이 여기에 표시돼요."
          )}
        </div>
        {again}
      </>
    );
  } else {
    const hours = shown.reduce((sum, session) => sum + minutesOf(session), 0) / MINUTES_PER_HOUR;
    under = (
      <>
        <h2>확정된 배정안이에요</h2>
        <p className="sub">
          합주 {shown.length}번이고, 총 {hours.toFixed(1)}시간이에요.
        </p>
        {counts}
        {!canRun ? null : (
          <div className="note">다시 스케줄링하면 현재 배정안은 기록 후 새 배정안으로 변경되어요.</div>
        )}
        {again}
      </>
    );
  }

  // ── 오른쪽 칸 ───────────────────────────────────────────────────────────────
  // 되돌리기 권한이 있는 멤버에게만 이전 배정기록을 표시합니다. 
  // 서버가 같은 항목으로 막고 있어, 감추는 것은 정리일 뿐 근거가 아니다. < 이게 뭔말인데;
  const rounds = backups.data?.backups ?? [];
  let roundList;
  if (!canRollback) {
    roundList = <li className="empty">이전 배정 되돌리기 권한이 있어야 확인이 가능해요.</li>;
  } else if (backups.isPending) {
    roundList = <li className="empty">이전 배정기록 불러오는 중…</li>;
  } else if (backups.isError) {
    roundList = <li className="empty">이전 배정기록을 불러오지 못했어요.</li>;
  } else if (rounds.length === 0) {
    roundList = <li className="empty">이전 배정기록이 없어요.</li>;
  } else {
    // 최근 것이 위로 오게 뒤집는다. 되돌리기는 언제나 맨 위 회차로만 간다.
    roundList = [...rounds]
      .sort((a, b) => b.saved_at.localeCompare(a.saved_at))
      .map((backup, index) => (
        <li key={backup.saved_at}>
          <button
            className={roundAt === backup.saved_at ? "round on" : "round"}
            aria-pressed={roundAt === backup.saved_at}
            onClick={() => setView({ kind: "round", at: backup.saved_at })}
          >
            <b>{stampLabel(backup.saved_at)}</b>
            <small>{slotCountLabel(backup.slot_count)}{index === 0 ? " · 되돌린 배정안은 여기로" : ""}</small>
          </button>
        </li>
      ));
  }
  const pastRuns = (
    <Panel title="이전 배정기록" hint="캘린더에서 미리보기가 가능해요">
      <ul>{roundList}</ul>
    </Panel>
  );

  // 계산 시각은 기간에 딸린 값이라 기간 항목이 가른다. 설정 화면의 기간 서식과
  // 같은 값을 같은 endpoint 로 고친다 — 여기서는 두 시각만 따로 손댈 수 있게 둔다.
  const canManagePeriod = can(me, "period_edit");
  const activePeriod = focusedPeriods.find((period) => period.id === activePeriodId) ?? null;
  const shownRun = runForm !== null && runForm.id === activePeriodId
    ? runForm
    : { id: activePeriodId ?? 0, first: activePeriod?.first_run_at ?? "", second: activePeriod?.second_run_at ?? "" };
  const runWhy = checkRunTimes(shownRun.first, shownRun.second);
  const runChanged = activePeriod !== null
    && (shownRun.first !== activePeriod.first_run_at || shownRun.second !== activePeriod.second_run_at);
  const runTimes = (
    <section className="panel">
      <div className="times">
        <div className="k">스케줄링 시간</div>
        <div className="t">
          {activePeriod === null
            ? "집중 합주기간을 생성해주세요"
            : `${activePeriod.first_run_at} · ${activePeriod.second_run_at}`}
        </div>
        {activePeriod === null ? null : (
          <>
            <div className="rows">
              {/* step 은 초 단위다 — 3600 이면 60분마다 고를 수 있다. */}
              <input
                type="time"
                step={HALF_HOUR_SECONDS}
                aria-label="1차 스케줄링 시간"
                disabled={!canManagePeriod || saveRunTimes.isPending}
                value={shownRun.first}
                onChange={(event) => setRunForm({
                  id: activePeriod.id, first: event.target.value, second: shownRun.second,
                })}
              />
              <input
                type="time"
                step={HALF_HOUR_SECONDS}
                aria-label="2차 스케줄링 시간"
                disabled={!canManagePeriod || saveRunTimes.isPending}
                value={shownRun.second}
                onChange={(event) => setRunForm({
                  id: activePeriod.id, first: shownRun.first, second: event.target.value,
                })}
              />
            </div>
            {!canManagePeriod ? null : (
              <button
                className={runChanged && runWhy === "" ? "save on" : "save"}
                disabled={!runChanged || runWhy !== "" || saveRunTimes.isPending}
                onClick={() => saveRunTimes.mutate({
                  first_run_at: shownRun.first, second_run_at: shownRun.second,
                })}
              >
                {saveRunTimes.isPending ? "변경사항 저장 중…" : "변경사항 저장"}
              </button>
            )}
            <p>
              {runWhy !== "" ? runWhy : canManagePeriod
                ? "지정한 시간에 스케줄링을 진행해요."
                : "집중 합주기간이 있어야 시간을 지정할 수 있어요."}
            </p>
          </>
        )}
      </div>
    </section>
  );

  return (
    <AppShell
      page="admin"
      current="assign"
    >
      <Tabs label="배정안" items={tabs} selected={tabKey(view)} onSelect={(key) => setView(viewOf(key))} />

      <div className="main">
        <Card>
          <div className="calhead">
            <b>집중 합주기간</b>
            <span>
              {days.length ? `${days[0]} – ${days[days.length - 1]}` : "일정이 없어요"}
              {" · 기간 "}
              <select value={activePeriodId ?? ""} aria-label="기간 선택"
                onChange={(event) => { setPeriodId(Number(event.target.value)); setView(NOW); }}>
                {/* 번호가 아니라 날짜 범위로 보여준다 — 사람·기간을 번호로 부르지 않는다. */}
                {focusedPeriods.map((period) => (
                  <option value={period.id} key={period.id}>
                    {period.starts_on} – {period.ends_on}
                  </option>
                ))}
              </select>
            </span>
            <div className="keys">
              {[...colors.entries()].map(([name, tone]) => (
                <i key={name}><em style={{ background: `var(--${tone})` }} />{name}</i>
              ))}
            </div>
          </div>

          <div className="dow">{WEEKDAY_NAMES.map((name) => <span key={name}>{name}</span>)}</div>

          <div className="grid">
            {days.length === 0 ? (
              <div className="day" style={{ gridColumn: "1/-1" }}>
                <span className="free">캘린더에 표시할 일정이 없어요</span>
              </div>
            ) : (
              <>
                {/* 요일 머리글이 일요일부터라 첫 주의 앞쪽을 빈 칸으로 채운다.
                    getDay() 는 일요일을 0으로 세므로 그 값이 곧 빈 칸 수다. */}
                {Array.from(
                  { length: new Date(`${days[0]}T12:00:00`).getDay() },
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
        {pastRuns}
        {runTimes}
      </div>
    </AppShell>
  );
}
