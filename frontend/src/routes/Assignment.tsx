import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AppShell, Card, Tabs } from "../components/AppShell";
import { Dropdown } from "../components/Dropdown";
import { getJSON, reason } from "../lib/api";
import { say } from "../lib/toast";
import { runAssignment } from "../lib/pipeline";
import type { AssignBody } from "../lib/pipeline";
import { useMe, usePeriods, useRooms, useTeams } from "../components/queries";
import { can } from "../lib/account";
import { NOW, colorsOf, runResultText, sessionsOf, tabKey, viewOf } from "../lib/assignment";
import type { View } from "../lib/assignment";
import { AssignmentCalendar, AssignmentStatus, PastRunsPanel, RunTimesPanel } from "./AssignmentPanels";
import "../styles/assignment.css";
import type { AssignOut, ScheduleRow } from "../lib/contract";
import { datesBetween, dayOf, mergeSessions, stampLabel } from "../lib/pipeline";

// 조회 결과가 아직 없을 때 사용하는 빈 목록입니다. 같은 배열을 계속 사용해야 useMemo 의 의존성이 변하지 않습니다.
const NO_ROWS: ScheduleRow[] = [];

export function Assignment() {
  const { me } = useMe();
  const queryClient = useQueryClient();
  const [periodId, setPeriodId] = useState<number | null>(null);
  const [view, setView] = useState<View>(NOW);

  const periods = usePeriods();
  // 이 화면은 집중 합주기간만 다룹니다. 상시 기간은 자동 배정 대상이 아닙니다.
  const focusedPeriods = (periods.data?.periods ?? []).filter((period) => period.kind === "focused");
  // 사용자가 아직 선택하지 않았으면 목록의 첫 기간을 사용합니다. useEffect 로 동기화하지 않고
  // 렌더할 때마다 이렇게 계산합니다.
  const activePeriodId = periodId ?? focusedPeriods[0]?.id ?? null;
  const activePeriod = focusedPeriods.find((period) => period.id === activePeriodId) ?? null;

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
  // schedule.data 가 없으면 NO_ROWS 를 사용합니다. 매 render 마다 새 빈 배열을 만들면 아래 useMemo 가 매번 다시 실행됩니다.
  const rows = schedule.data?.rows ?? NO_ROWS;

  // 확정된 시간표에 나온 id를 재계산에 그대로 넘깁니다. 아직 아무것도 확정되지 않았으면
  // 목록 endpoint(API의 요청 주소 단위)가 준 전체를 사용합니다.
  const uniqueSorted = (values: number[]) => [...new Set(values)].sort((a, b) => a - b);
  const teamIds = rows.length
    ? uniqueSorted(rows.map((row) => row.team_id))
    : (teams.data?.teams ?? []).map((team) => team.id);
  const roomIds = rows.length
    ? uniqueSorted(rows.map((row) => row.room_id))
    : (rooms.data?.rooms ?? []).map((room) => room.id);

  // 저장까지 끝났으면 확정된 시간표를 다시 받아 화면과 서버를 맞춥니다. 저장이 되었으면
  // 이전 시간표가 배정기록으로 밀려나므로 목록도 다시 받습니다.
  const refreshSchedule = async () => {
    await queryClient.invalidateQueries({ queryKey: ["schedule", activePeriodId] });
    await queryClient.invalidateQueries({ queryKey: ["backups", activePeriodId] });
    setView(NOW);
  };

  const recompute = useMutation({
    mutationFn: (body: AssignBody) => {
      if (activePeriodId === null) throw new Error("선택할 집중 합주기간이 없어요");
      // 서버는 접수만 하고 곧바로 답합니다. 끝날 때까지 polling(주기적으로 같은 요청을 다시 보내 변경을 확인하는 방식)하는 것은 runAssignment입니다.
      return runAssignment<AssignOut>(activePeriodId, body);
    },
    onSuccess: async (result) => {
      await refreshSchedule();
      say(runResultText(result));
    },
    onError: (error) => say(reason(error, "엔진이 연산에 실패했어요")),
  });

  // 조율안 확정입니다. 조율안이 지목한 멤버를 제외한 채로 같은 계산을 다시 실행해 저장합니다. 서버 경로가
  // 다를 뿐 결과를 받는 방식은 재계산과 같습니다.
  const confirm = useMutation({
    mutationFn: (memberId: number) => {
      if (activePeriodId === null) throw new Error("선택할 집중 합주기간이 없어요");
      return runAssignment<AssignOut>(activePeriodId, { team_ids: teamIds, room_ids: roomIds }, memberId);
    },
    onSuccess: async (result) => {
      await refreshSchedule();
      say(result.saved ? "선택한 배정으로 확정했어요" : "해당 배정을 선택하지 않았어요");
    },
    onError: (error) => say(reason(error, "해당 배정을 선택하는데 실패했어요")),
  });

  const rollback = useMutation({
    mutationFn: () => {
      if (activePeriodId === null) throw new Error("선택할 집중 합주기간이 없어요");
      // 배정기록을 받지 않는 endpoint 입니다. 언제나 바로 직전 배정기록으로만 되돌아갑니다.
      return getJSON<{ rolled_back: boolean }>(`/periods/${activePeriodId}/rollback`, { method: "POST" });
    },
    onSuccess: async (result) => {
      // 되돌린 배정기록은 목록에서 제거됩니다.
      await refreshSchedule();
      say(result.rolled_back ? "이전 배정안으로 되돌렸어요" : "이전 배정기록이 없어요");
    },
    // 서버가 거절한 사유를 그대로 표시합니다. 합주실·시각이 겹쳐 되돌릴 수 없는 경우가 있습니다.
    onError: (error) => say(error instanceof Error ? error.message : "이전 배정기록으로 되돌리는데 실패했어요"),
  });

  // 선택한 배정기록입니다. 조율안과 같은 view 값 하나를 사용하므로 달력·아래 설명·탭이 값 하나로 결정됩니다.
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

  const confirmed = useMemo(
    () => mergeSessions(rows.map((row) => ({ team: row.team, room: row.room, start: row.start, end: row.end }))),
    [rows],
  );

  // recompute.data 가 없을 때만 매번 새 빈 배열이 생깁니다. 재계산 전에는 proposals 를
  // 사용하는 곳도 없어 아래 useMemo 가 다시 실행되어도 비용이 없습니다.
  const proposals = recompute.data?.proposals ?? [];
  const proposalIndex = view.kind === "proposal" ? view.index : null;
  const proposal = proposalIndex === null ? null : proposals[proposalIndex] ?? null;
  const roundRows = round.data?.rows ?? NO_ROWS;
  const roundSessions = useMemo(
    () => mergeSessions(roundRows.map((row) => ({ team: row.team, room: row.room, start: row.start, end: row.end }))),
    [roundRows],
  );
  const shown = useMemo(() => {
    if (roundAt !== null) return roundSessions;
    return proposal ? sessionsOf(proposal.assignment.slots_by_team) : confirmed;
  }, [roundAt, roundSessions, proposal, confirmed]);

  const teamList = teams.data?.teams;
  const colors = useMemo(
    () => colorsOf([...confirmed, ...shown], teamList ?? []),
    [confirmed, shown, teamList],
  );

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

  // 버튼마다 필요한 권한이 다릅니다. 계산은 assign_run, 되돌리기는 rollback 입니다.
  // 둘 다 없으면 버튼 줄 자체를 표시하지 않습니다.
  const canRun = can(me, "assign_run");
  const canRollback = can(me, "rollback");
  const actions = !canRun && !canRollback ? null : (
    <div className="act">
      {!canRun ? null : (
        <button className="btn main" disabled={recompute.isPending || activePeriodId === null}
          onClick={() => recompute.mutate({ team_ids: teamIds, room_ids: roomIds })}>
          {recompute.isPending ? "스케줄링 진행 중…" : "스케줄링"}
        </button>
      )}
      {/* ponytail: 되돌리기는 취소할 수 없어 확인을 한 번 요청합니다. 이 화면에는 확인 dialog(화면 위에 뜨는 대화 상자)가
          없어 브라우저 기본 대화상자를 사용합니다. 화면 자체의 dialog 가 생기면 그 dialog 로 교체합니다. */}
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

  const firstError = periods.error ?? rooms.error ?? teams.error ?? schedule.error ?? recompute.error ?? null;

  return (
    <AppShell page="admin" current="assign">
      <Tabs label="배정안" items={tabs} selected={tabKey(view)} onSelect={(key) => setView(viewOf(key))} />

      <div className="main">
        <Card>
          <div className="calhead">
            <b>집중 합주기간</b>
            <span>
              {days.length ? `${days[0]} – ${days[days.length - 1]}` : "일정이 없어요"}
              {" · 기간 "}
              {/* id 가 아니라 날짜 범위로 표시합니다. 화면에서 기간을 번호로 표시하지 않습니다. */}
              <Dropdown
                ariaLabel="기간 선택"
                value={activePeriodId ?? 0}
                choices={focusedPeriods.map((period) => ({
                  value: period.id,
                  label: `${period.starts_on} – ${period.ends_on}`,
                }))}
                onChange={(next) => { setPeriodId(next); setView(NOW); }}
              />
            </span>
            <div className="keys">
              {[...colors.entries()].map(([name, tone]) => (
                <i key={name}><em style={{ background: `var(--${tone})` }} />{name}</i>
              ))}
            </div>
          </div>

          <AssignmentCalendar days={days} shown={shown} colors={colors} />

          <div className="under">
            <AssignmentStatus
              error={firstError}
              roundAt={roundAt}
              roundPending={round.isPending}
              roundError={round.error}
              proposal={proposal}
              hasConfirmed={confirmed.length > 0}
              shown={shown}
              colors={colors}
              canRun={canRun}
              canConfirm={can(me, "proposal_confirm")}
              confirmPending={confirm.isPending}
              onConfirm={(memberId) => confirm.mutate(memberId)}
              onBack={() => setView(NOW)}
              actions={actions}
            />
          </div>
        </Card>
      </div>

      <div className="rail">
        <PastRunsPanel
          periodId={activePeriodId}
          canRollback={canRollback}
          roundAt={roundAt}
          onSelect={(at) => setView({ kind: "round", at })}
        />
        <RunTimesPanel period={activePeriod} canManage={can(me, "period_edit")} />
      </div>
    </AppShell>
  );
}
