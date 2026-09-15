// 배정 화면(routes/Assignment)의 부품입니다. 오른쪽 칸 2개는 자기 서버 호출을 직접 가집니다.

import { useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Panel } from "../components/AppShell";
import { getJSON, reason } from "../lib/api";
import { hoursOf } from "../lib/assignment";
import { checkRunTimes, slotCountLabel } from "../lib/runs";
import { say } from "../lib/toast";
import { dayOf, hhmm, stampLabel, WEEKDAY_NAMES } from "../lib/pipeline";
import type { Session } from "../lib/pipeline";
import type { AssignOut, Backup, Period } from "../lib/contract";

/** 팀마다 합주 횟수와 총 시간을 표시합니다. 합주가 0번인 팀은 흐리게 표시합니다. */
export function TeamCounts({ shown, colors }: { shown: Session[]; colors: Map<string, string> }) {
  return (
    <div className="counts">
      {[...colors.entries()].map(([name, tone]) => {
        const own = shown.filter((session) => session.team === name);
        return (
          <span className={own.length ? "cnt" : "cnt short"} key={name}>
            <i style={{ background: `var(--${tone})` }} />{name}
            {" 합주 "}<b>{own.length}번</b>{` · ${hoursOf(own).toFixed(1)}시간`}
          </span>
        );
      })}
    </div>
  );
}

/** 달력 본문입니다. 요일 머리글과 날짜 칸을 표시하고, 칸마다 그날의 합주를 색 막대로 그립니다. */
export function AssignmentCalendar({ days, shown, colors }: {
  days: string[];
  shown: Session[];
  colors: Map<string, string>;
}) {
  return (
    <>
      <div className="dow">{WEEKDAY_NAMES.map((name) => <span key={name}>{name}</span>)}</div>

      <div className="grid">
        {days.length === 0 ? (
          <div className="day" style={{ gridColumn: "1/-1" }}>
            <span className="free">캘린더에 표시할 일정이 없어요</span>
          </div>
        ) : (
          <>
            {/* 요일 머리글이 일요일부터라 첫 주의 앞쪽을 빈 칸으로 채웁니다.
                getDay()는 일요일을 0으로 세므로 그 값이 곧 빈 칸 수입니다. */}
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
                    <div className={`ses ${colors.get(session.team) ?? ""}`} key={index}>
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
    </>
  );
}

type Proposal = AssignOut["proposals"][number];

/** 달력 아래 설명 구역입니다. 오류, 지난 배정기록, 조율안, 확정 없음, 확정 있음 5가지 중 하나를 표시합니다. */
export function AssignmentStatus({
  error, roundAt, roundPending, roundError, proposal, hasConfirmed, shown, colors,
  canRun, canConfirm, confirmPending, onConfirm, onBack, actions,
}: {
  /** 조회·계산 중 첫 실패입니다. 없으면 null 입니다. */
  error: unknown;
  roundAt: string | null;
  roundPending: boolean;
  roundError: unknown;
  proposal: Proposal | null;
  hasConfirmed: boolean;
  shown: Session[];
  colors: Map<string, string>;
  canRun: boolean;
  canConfirm: boolean;
  confirmPending: boolean;
  onConfirm: (memberId: number) => void;
  onBack: () => void;
  /** 스케줄링·되돌리기 버튼 줄입니다. 권한이 둘 다 없으면 null 입니다. */
  actions: ReactNode;
}) {
  const counts = <TeamCounts shown={shown} colors={colors} />;
  const hours = hoursOf(shown);

  if (error !== null) {
    return (
      <>
        <h2>서버가 요청을 받지 못했어요</h2>
        <p className="sub">{error instanceof Error ? error.message : "알 수 없는 오류"}</p>
        {actions}
      </>
    );
  }
  if (roundAt !== null) {
    return (
      <>
        <h2>{stampLabel(roundAt)}에 밀려난 시간표입니다</h2>
        <p className="sub">
          {roundPending
            ? "불러오는 중…"
            : roundError !== null
              ? reason(roundError, "해당 배정안을 불러오지 못했어요")
              : `합주 ${shown.length}번 · 총 ${hours.toFixed(1)}시간이에요`}
        </p>
        {counts}
        <div className="act">
          <button className="btn" onClick={onBack}>현재 배정안으로 돌아가기</button>
        </div>
      </>
    );
  }
  if (proposal !== null) {
    const who = proposal.excluded_member;
    return (
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
          {!canConfirm ? null : (
            <button className="btn main" disabled={confirmPending} onClick={() => onConfirm(who.id)}>
              {confirmPending ? "배정안 확정 중…" : "해당 배정안으로 확정"}
            </button>
          )}
          <button className="btn" onClick={onBack}>현재 배정안으로 돌아가기</button>
        </div>
      </>
    );
  }
  if (!hasConfirmed) {
    return (
      <>
        <h2>현재 확정된 배정안이 없어요</h2>
        <p className="sub">
          현재 팀이나 멤버가 없거나, 집중 합주기간이 아니에요.
          생성된 팀과 가입한 멤버가 있는지 확인해주세요.
        </p>
        {counts}
        {/* 계산 버튼을 감춘 사람에게 그 버튼을 누르라고 안내하지 않습니다. */}
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
        {actions}
      </>
    );
  }
  return (
    <>
      <h2>확정된 배정안이에요</h2>
      <p className="sub">
        합주 {shown.length}번이고, 총 {hours.toFixed(1)}시간이에요.
      </p>
      {counts}
      {!canRun ? null : (
        <div className="note">다시 스케줄링하면 현재 배정안은 기록 후 새 배정안으로 변경되어요.</div>
      )}
      {actions}
    </>
  );
}

/** 오른쪽 칸의 이전 배정기록 목록입니다. 되돌리기 권한이 있는 사용자에게만 목록을 조회해 표시합니다.
 *  서버가 같은 권한으로 차단하고 있으므로, 화면에서 감추는 것은 정리일 뿐 권한 판정이 아닙니다. */
export function PastRunsPanel({ periodId, canRollback, roundAt, onSelect }: {
  periodId: number | null;
  canRollback: boolean;
  roundAt: string | null;
  onSelect: (at: string) => void;
}) {
  const backups = useQuery({
    queryKey: ["backups", periodId],
    queryFn: () => {
      if (periodId === null) throw new Error("선택할 집중 합주기간이 없어요");
      return getJSON<{ backups: Backup[] }>(`/periods/${periodId}/backups`);
    },
    enabled: periodId !== null && canRollback,
  });
  const rounds = backups.data?.backups ?? [];

  let list;
  if (!canRollback) {
    list = <li className="empty">이전 배정 되돌리기 권한이 있어야 확인이 가능해요.</li>;
  } else if (backups.isPending) {
    list = <li className="empty">이전 배정기록 불러오는 중…</li>;
  } else if (backups.isError) {
    list = <li className="empty">이전 배정기록을 불러오지 못했어요.</li>;
  } else if (rounds.length === 0) {
    list = <li className="empty">이전 배정기록이 없어요.</li>;
  } else {
    // 최근 배정기록이 위로 오게 순서를 뒤집습니다. 되돌리기는 언제나 맨 위 배정기록으로만 복원합니다.
    list = [...rounds]
      .sort((a, b) => b.saved_at.localeCompare(a.saved_at))
      .map((backup, index) => (
        <li key={backup.saved_at}>
          <button
            className={roundAt === backup.saved_at ? "round on" : "round"}
            aria-pressed={roundAt === backup.saved_at}
            onClick={() => onSelect(backup.saved_at)}
          >
            <b>{stampLabel(backup.saved_at)}</b>
            <small>{slotCountLabel(backup.slot_count)}{index === 0 ? " · 되돌린 배정안은 여기로" : ""}</small>
          </button>
        </li>
      ));
  }
  return (
    <Panel title="이전 배정기록" hint="캘린더에서 미리보기가 가능해요">
      <ul>{list}</ul>
    </Panel>
  );
}

/** 오른쪽 칸의 스케줄링 시간 편집입니다. 계산 시각은 기간에 속한 값이라 period_edit 권한이 필요합니다.
 *  설정 화면의 기간 form 과 같은 값을 같은 endpoint(API의 요청 주소 단위)로 수정합니다. 이 칸에서는 두 시각만 따로 수정할 수 있게 둡니다. */
export function RunTimesPanel({ period, canManage }: { period: Period | null; canManage: boolean }) {
  const queryClient = useQueryClient();
  // 수정한 값만 이 state 에 담습니다. 기간을 바꾸면 담긴 id 가 맞지 않으므로 그때는
  // 다시 서버 값을 사용합니다. useEffect 로 동기화하지 않고 렌더할 때마다 id 를 비교합니다.
  const [form, setForm] = useState<{ id: number; first: string; second: string } | null>(null);

  const save = useMutation({
    mutationFn: (body: { first_run_at: string; second_run_at: string }) => {
      if (period === null) throw new Error("선택할 집중 합주기간이 없어요");
      return getJSON<{ period: Period }>(`/periods/${period.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
    },
    onSuccess: async () => {
      // 수정한 값을 서버에서 다시 받아 화면과 맞춥니다. 받아온 뒤에는 수정 기록을 삭제합니다.
      await queryClient.invalidateQueries({ queryKey: ["periods"] });
      setForm(null);
      say("엔진 연산 시간을 저장했어요");
    },
    onError: (error) => say(error instanceof Error ? error.message : "엔진 연산 시간을 저장하는데 실패했어요."),
  });

  const shown = form !== null && period !== null && form.id === period.id
    ? form
    : { id: period?.id ?? 0, first: period?.first_run_at ?? "", second: period?.second_run_at ?? "" };
  const why = checkRunTimes(shown.first, shown.second);
  const changed = period !== null
    && (shown.first !== period.first_run_at || shown.second !== period.second_run_at);

  return (
    <section className="panel">
      <div className="times">
        <div className="k">스케줄링 시간</div>
        <div className="t">
          {period === null
            ? "집중 합주기간을 생성해주세요"
            : `${period.first_run_at} · ${period.second_run_at}`}
        </div>
        {period === null ? null : (
          <>
            <div className="rows">
              <input
                type="time"
                aria-label="1차 스케줄링 시간"
                disabled={!canManage || save.isPending}
                value={shown.first}
                onChange={(event) => setForm({ id: period.id, first: event.target.value, second: shown.second })}
              />
              <input
                type="time"
                aria-label="2차 스케줄링 시간"
                disabled={!canManage || save.isPending}
                value={shown.second}
                onChange={(event) => setForm({ id: period.id, first: shown.first, second: event.target.value })}
              />
            </div>
            {!canManage ? null : (
              <button
                className={changed && why === "" ? "save on" : "save"}
                disabled={!changed || why !== "" || save.isPending}
                onClick={() => save.mutate({ first_run_at: shown.first, second_run_at: shown.second })}
              >
                {save.isPending ? "변경사항 저장 중…" : "변경사항 저장"}
              </button>
            )}
            <p>
              {why !== "" ? why : canManage
                ? "지정한 시간에 스케줄링을 진행해요."
                : "스케줄링 시간 설정 권한이 있어야 시간을 지정할 수 있어요."}
            </p>
          </>
        )}
      </div>
    </section>
  );
}
