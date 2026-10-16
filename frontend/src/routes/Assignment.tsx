import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "../components/controls";
import { Card, Tabs } from "../components/Layout";
import { Dropdown } from "../components/Dropdown";
import { reason } from "../lib/api";
import { say } from "../components/toast";
import { askApplyRecord } from "../lib/confirm";
import { applyRecord, loadRecordRound, loadScheduleOut, runAssignment } from "../lib/pipeline";
import type { AssignBody } from "../lib/pipeline";
import { recordRoundKey, recordRoundsKey, recordsKey, SCHEDULE_KEY, useMe, usePeriods, useRooms, useTeams } from "../components/queries";
import { can } from "../lib/account";
import { NOW, colorsOf, dayRangeOf, sessionsOfRows, tabKey, tabsOf, viewOf } from "../lib/assignment";
import type { View } from "../lib/assignment";
import { AssignmentCalendar, AssignmentStatus, PastRunsPanel, RunTimesPanel } from "./AssignmentPanels";
import "../styles/assignment.css";
import type { AssignOut, ScheduleRow } from "../lib/contract";
// 조회 결과가 아직 없을 때 사용하는 빈 목록입니다. 같은 배열을 계속 사용해야 useMemo 의 의존성이 변하지 않습니다.
const NO_ROWS: ScheduleRow[] = [];

/** 선택된 집중 합주기간의 번호입니다. 없을 경우 error 를 발생시킵니다.
 *  조회·재계산·확정·되돌리기·스케줄링 기록 조회가 모두 기간 번호를 요구하고, enabled 조건으로 막아도
 *  queryFn·mutationFn 의 타입에서는 null 이 남습니다. 문구를 한 곳에 두어 다섯 곳이 같게 합니다. */
function requirePeriod(periodId: number | null): number {
  if (periodId === null) throw new Error("선택할 집중 합주기간이 없어요");
  return periodId;
}

/** 화면에 표시할 배정입니다. roundAt 이 null 이면 현재 배정안(confirmed)을, 기록 저장 시각이면 그 스케줄링 기록을 shown 으로 반환합니다.
 *  report 는 shown 의 결과 설명입니다. */
function useShownSchedule(activePeriodId: number | null, roundAt: string | null) {
  const schedule = useQuery({
    queryKey: [...SCHEDULE_KEY, activePeriodId],
    queryFn: () => loadScheduleOut(requirePeriod(activePeriodId)),
    enabled: activePeriodId !== null,
  });
  // schedule.data 가 없으면 NO_ROWS 를 사용합니다. 매 render 마다 새 빈 배열을 만들면 아래 useMemo 가 매번 다시 실행됩니다.
  const rows = schedule.data?.rows ?? NO_ROWS;

  const round = useQuery({
    queryKey: recordRoundKey(activePeriodId, roundAt),
    queryFn: () => {
      if (activePeriodId === null || roundAt === null) throw new Error("선택할 스케줄링 기록이 없어요");
      return loadRecordRound(activePeriodId, roundAt);
    },
    enabled: activePeriodId !== null && roundAt !== null,
  });

  const confirmed = useMemo(() => sessionsOfRows(rows), [rows]);

  const roundRows = round.data?.rows ?? NO_ROWS;
  const roundSessions = useMemo(() => sessionsOfRows(roundRows), [roundRows]);
  const shown = roundAt !== null ? roundSessions : confirmed;
  const report = (roundAt !== null ? round.data?.report : schedule.data?.report) ?? null;
  return { schedule, round, confirmed, shown, report };
}

/** 스케줄링 연산과 기록 적용 요청입니다. 둘 다 성공하면 현재 배정안, 기록 목록, 기록 결과 설명을 다시 조회합니다.
 *  연산하면 기록이 추가되고, 적용하면 현재 배정안이 바뀌기 때문입니다. */
function useRunAndApply(activePeriodId: number | null, roundAt: string | null, canConfirm: boolean, setView: (next: View) => void) {
  const queryClient = useQueryClient();
  // 현재 배정안과 스케줄링 기록 목록을 다시 받아 화면과 서버를 맞춥니다. 연산하면 기록이 추가되고,
  // 적용하면 현재 배정안이 바뀌므로 둘 다 다시 받습니다.
  // SCHEDULE_KEY 로 무효화해야 캘린더 화면(routes/Scheduler.tsx)의
  // [...SCHEDULE_KEY, periodIds] 캐시도 함께 무효화됩니다. activePeriodId 로만 무효화하면
  // key 모양이 달라 캘린더 화면에 이전 배정이 그대로 남습니다.
  const refreshSchedule = async () => {
    await queryClient.invalidateQueries({ queryKey: SCHEDULE_KEY });
    await queryClient.invalidateQueries({ queryKey: recordsKey(activePeriodId) });
    // 기록 1개의 결과 설명은 조회하는 시점의 불가능 일정으로 계산하므로 함께 무효화합니다.
    await queryClient.invalidateQueries({ queryKey: recordRoundsKey(activePeriodId) });
  };

  const recompute = useMutation({
    // 서버는 접수만 하고 곧바로 답합니다. 끝날 때까지 polling(주기적으로 같은 요청을 다시 보내 변경을 확인하는 방식)하는 것은 runAssignment입니다.
    mutationFn: (body: AssignBody) => runAssignment<AssignOut>(requirePeriod(activePeriodId), body),
    onSuccess: async (result) => {
      await refreshSchedule();
      // 연산 결과는 기록으로만 쌓입니다(사용자 결정 2026-10-13). 기록 조회는 서버가 proposal_confirm 권한으로
      // 검증하므로 그 권한이 있을 때만 그 기록을 캘린더에 표시하고, 없으면 현재 배정안에 머뭅니다.
      const record = canConfirm ? result.record_saved_at : null;
      setView(record === null ? NOW : { kind: "round", at: record });
      say("스케줄링 연산에 성공했어요");
    },
    onError: (error) => say(reason(error, "엔진이 연산에 실패했어요")),
  });

  // 표시 중인 스케줄링 기록을 현재 배정안으로 적용합니다. 기록은 목록에 남습니다.
  const confirm = useMutation({
    mutationFn: () => {
      if (roundAt === null) throw new Error("선택할 스케줄링 기록이 없어요");
      return applyRecord(requirePeriod(activePeriodId), roundAt);
    },
    onSuccess: async () => {
      await refreshSchedule();
      setView(NOW);
      say("선택한 배정안을 적용했어요");
    },
    // 서버가 거절한 사유를 그대로 표시합니다. 다른 기간과 합주실·시각이 겹쳐 적용할 수 없는 경우가 있습니다.
    onError: (error) => say(reason(error, "해당 배정안을 적용하는데 실패했어요")),
  });
  return { recompute, confirm };
}

export function Assignment() {
  const { me } = useMe();
  // 계산은 assign_run, 스케줄링 기록 조회와 적용은 proposal_confirm 권한입니다.
  const canRun = can(me, "assign_run");
  const canConfirm = can(me, "proposal_confirm");
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

  // 선택한 스케줄링 기록입니다. view 값 하나를 사용하므로 달력, 아래 설명, 탭이 값 하나로 결정됩니다.
  const roundAt = view.kind === "round" ? view.at : null;
  const { schedule, round, confirmed, shown, report } = useShownSchedule(activePeriodId, roundAt);

  // 자동 배정(jobs/auto_assign.py)과 같이 멤버가 있는 전체 팀과 전체 합주실을 계산에 넣습니다. 확정된 배정안에
  // 나온 팀만 넣으면 그 뒤에 만든 팀과 합주실은 다시 계산해도 배정받지 못합니다. 멤버가 없는 팀이 들어가면 서버가 계산 전체를 거절합니다.
  const teamIds = (teams.data?.teams ?? []).filter((team) => team.filled_count > 0).map((team) => team.id);
  const roomIds = (rooms.data?.rooms ?? []).map((room) => room.id);

  const { recompute, confirm } = useRunAndApply(activePeriodId, roundAt, canConfirm, setView);

  const teamList = teams.data?.teams;
  const colors = useMemo(
    () => colorsOf([...confirmed, ...shown], teamList ?? []),
    [confirmed, shown, teamList],
  );

  const tabs = tabsOf(roundAt);
  const days = dayRangeOf(shown);

  // 계산 권한(assign_run)이 없으면 버튼 줄 자체를 표시하지 않습니다.
  const actions = !canRun ? null : (
    <div className="act">
      <Button kind="go" pending={recompute.isPending} pendingLabel="스케줄링 진행 중…" disabled={activePeriodId === null || teamIds.length === 0 || roomIds.length === 0}
        onClick={() => recompute.mutate({ team_ids: teamIds, room_ids: roomIds })}>
        스케줄링
      </Button>
    </div>
  );

  const firstError = periods.error ?? rooms.error ?? teams.error ?? schedule.error ?? recompute.error ?? null;

  return (
    <>
      <Tabs label="배정안" items={tabs} selected={tabKey(view)} onSelect={(key) => setView(viewOf(key))} />

      <div className="main">
        <Card>
          <div className="calhead">
            <b>집중 합주기간</b>
            <span>
              {/* 선택한 기간의 날짜 범위는 드롭다운의 항목 글자가 보여 주므로 따로 적지 않습니다(사용자 결정 2026-10-07).
                  id 가 아니라 날짜 범위로 표시합니다. 화면에서 기간을 번호로 표시하지 않습니다. */}
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
          </div>

          {/* 요일 머리글과 날짜 칸을 한 요소로 묶습니다. 휴대폰 폭에서 달력만 가로로 스크롤할 때
              둘이 따로 스크롤되면 요일과 칸이 어긋납니다(styles/assignment.css). */}
          <div className="cal">
            <AssignmentCalendar days={days} shown={shown} colors={colors} />
          </div>

          <div className="under">
            <AssignmentStatus
              error={firstError}
              roundAt={roundAt}
              roundPending={round.isPending}
              roundError={round.error}
              report={report}
              hasConfirmed={confirmed.length > 0}
              shown={shown}
              colors={colors}
              canRun={canRun}
              canConfirm={canConfirm}
              confirmPending={confirm.isPending}
              onConfirm={() => { if (askApplyRecord()) confirm.mutate(); }}
              onBack={() => setView(NOW)}
              actions={actions}
            />
          </div>
        </Card>
      </div>

      <div className="rail">
        <PastRunsPanel
          periodId={activePeriodId}
          canView={canConfirm}
          roundAt={roundAt}
          onSelect={(at) => setView({ kind: "round", at })}
        />
        <RunTimesPanel period={activePeriod} canManage={can(me, "period_edit")} />
      </div>
    </>
  );
}
