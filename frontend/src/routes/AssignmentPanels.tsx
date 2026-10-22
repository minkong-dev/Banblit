// 배정 화면(routes/Assignment)의 부품입니다. 오른쪽 칸 2개는 자기 서버 호출을 직접 가집니다.

import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button, Empty } from "../components/controls";
import { Panel } from "../components/Layout";
import { recordsKey, NOTIFICATIONS_KEY, PERIODS_KEY } from "../components/queries";
import { ReasonDialog } from "../components/RejectDialog";
import { getJSON, reason } from "../lib/api";
import { loadRecords, unfixPeriod } from "../lib/pipeline";
import { periodTitle } from "../lib/settings";
import { absentOf, hoursOf, reportLines } from "../lib/assignment";
import { appliedLabel, checkRunTimes, scoreLabel } from "../lib/runs";
import { say } from "../components/toast";
import { LOADING_TEXT, loadState } from "../lib/loading";
import type { Period, ScheduleReport, SessionAbsence } from "../lib/contract";
import { WEEKDAY_NAMES, stampLabel } from "../lib/calendar";
import { dayOf, timeRangeLabel } from "../lib/slots";
import type { Session } from "../lib/slots";

/** 팀마다 배정된 합주 총 시간을 표시합니다. 배정된 합주가 0건인 팀은 흐리게 표시합니다. */
function TeamCounts({ shown, colors }: { shown: Session[]; colors: Map<string, string> }) {
  return (
    <div className="counts">
      {[...colors.entries()].map(([name, tone]) => {
        const own = shown.filter((session) => session.team === name);
        return (
          <span className={own.length ? "cnt" : "cnt short"} key={name}>
            <i style={{ background: `var(--${tone})` }} />{name}
            {" 합주 "}<b>{hoursOf(own).toFixed(1)}시간</b>
          </span>
        );
      })}
    </div>
  );
}

/** 달력 본문입니다. 요일 머리글과 날짜 칸을 표시하고, 칸마다 그날의 합주를 색 막대로 그립니다. */
export function AssignmentCalendar({ days, shown, colors, absences }: {
  days: string[];
  shown: Session[];
  colors: Map<string, string>;
  absences: SessionAbsence[];
}) {
  return (
    <>
      <div className="dow">{WEEKDAY_NAMES.map((name) => <span key={name}>{name}</span>)}</div>

      <div className="grid">
        {days.length === 0 ? (
          <div className="day" style={{ gridColumn: "1/-1" }}>
            <span className="free">캘린더에 표시할 일정이 존재하지 않아요</span>
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
                      <small>{timeRangeLabel(session.start, session.end)}</small>
                      <span className="out">{session.room}</span>
                      {/* 불참자가 없어도 4번째 줄을 비워 두어 블록 높이를 같게 합니다. */}
                      <b className="ab">{absentOf(session, absences) || "\u00a0"}</b>
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

/** 부족분과 불참자 설명입니다. 문단 문구는 lib/assignment 의 reportLines 가 만듭니다. 두 목록이 모두 비면 표시하지 않습니다. */
function ScheduleReportBlock({ report }: { report: ScheduleReport | null }) {
  const paragraphs = report === null ? [] : reportLines(report);
  if (paragraphs.length === 0) return null;
  return (
    <div className="report">
      {paragraphs.map((paragraph) => (
        <section className={paragraph.tail === null ? "rp short" : "rp absent"} key={paragraph.title}>
          <h3>{paragraph.title}</h3>
          {/* 목록은 서버가 준 순서 그대로이고 다시 정렬되지 않아 index 를 key 로 씁니다. 같은 문구 2줄이 있어도 충돌하지 않습니다. */}
          {paragraph.lines.length === 0 ? null : <ul>{paragraph.lines.map((line, index) => <li key={index}>{line}</li>)}</ul>}
          {paragraph.groups.map((group) => (
            <div className="grp" key={group.team}>
              <b>{group.team}</b>
              <ul>{group.lines.map((line, index) => <li key={index}>{line}</li>)}</ul>
            </div>
          ))}
          {paragraph.tail === null ? null : <p>{paragraph.tail}</p>}
        </section>
      ))}
    </div>
  );
}

/** 달력 아래 설명 구역입니다. 오류, 스케줄링 기록, 현재 배정안 없음, 현재 배정안 있음 4가지 중 하나를 표시합니다. */
export function AssignmentStatus({
  error, roundAt, roundPending, roundError, report, hasConfirmed, shown, colors,
  canRun, canConfirm, confirmPending, onConfirm, onBack, actions,
}: {
  /** 조회, 계산 중 첫 실패입니다. 없으면 null 입니다. */
  error: unknown;
  roundAt: string | null;
  roundPending: boolean;
  roundError: unknown;
  /** 표시 중인 시간표의 부족분과 불참자입니다. */
  report: ScheduleReport | null;
  hasConfirmed: boolean;
  shown: Session[];
  colors: Map<string, string>;
  canRun: boolean;
  canConfirm: boolean;
  confirmPending: boolean;
  onConfirm: () => void;
  onBack: () => void;
  /** 스케줄링 버튼 줄입니다. 계산 권한이 없으면 null 입니다. */
  actions: ReactNode;
}) {
  const counts = <TeamCounts shown={shown} colors={colors} />;
  const reportBlock = <ScheduleReportBlock report={report} />;
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
        <h2>{stampLabel(roundAt)} 연산 결과예요</h2>
        <p className="sub">
          {roundPending
            ? LOADING_TEXT
            : roundError !== null
              ? reason(roundError, "해당 배정안을 불러오지 못했어요")
              : `총 ${hours.toFixed(1)}시간이에요`}
        </p>
        {counts}
        {reportBlock}
        <div className="note">적용할 경우에만 메인 캘린더에 반영되니, 신중하게 결정해주세요.</div>
        <div className="act">
          {!canConfirm ? null : (
            <Button kind="go" pending={confirmPending} pendingLabel="배정안 적용 중…" onClick={onConfirm}>
              이 배정안 적용
            </Button>
          )}
          <Button kind="ghost" onClick={onBack}>현재 배정안으로 돌아가기</Button>
        </div>
      </>
    );
  }
  if (!hasConfirmed) {
    return (
      <>
        <h2>현재 확정된 배정안이 존재하지 않아요</h2>
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
              연산 결과는 스케줄링 기록에 쌓이고, 적용해야 메인 캘린더에 반영돼요.
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
        총 {hours.toFixed(1)}시간이에요.
      </p>
      {/* 결과 설명은 조회하는 시점의 불가능 일정으로 계산합니다. 적용 뒤 불가능 일정이 바뀌어 허용 인원을 넘으면 경고합니다(사용자 결정 2026-10-13). */}
      {report?.over_absent !== true ? null : (
        <div className="warn" role="alert">
          <b>현재 적용 중인 배정안이 불가능 일정 변동으로 인해 불참 허용 인원을 초과했어요.</b>
          새로 연산된 배정안으로 업데이트하는 것을 추천드려요.
        </div>
      )}
      {counts}
      {reportBlock}
      {!canRun ? null : (
        <div className="note">다시 스케줄링하면 연산 결과가 스케줄링 기록에 쌓이고, 현재 배정안은 적용할 때만 바뀌어요.</div>
      )}
      {actions}
    </>
  );
}

/** 오른쪽 칸의 스케줄링 기록 목록입니다. 스케줄링 기록 확정 권한(proposal_confirm)이 있는 사용자에게만 목록을 조회해 표시합니다.
 *  서버가 같은 권한으로 차단하고 있으므로, 화면에서 감추는 것은 정리일 뿐 권한 판정이 아닙니다. */
export function PastRunsPanel({ periodId, canView, roundAt, onSelect }: {
  periodId: number | null;
  canView: boolean;
  roundAt: string | null;
  onSelect: (at: string) => void;
}) {
  const records = useQuery({
    queryKey: recordsKey(periodId),
    queryFn: () => {
      if (periodId === null) throw new Error("선택한 집중 합주기간이 존재하지 않아요");
      return loadRecords(periodId);
    },
    enabled: periodId !== null && canView,
  });
  const rounds = records.data ?? [];

  let list;
  if (!canView) {
    list = <Empty as="li" text="스케줄링 기록 확정 권한이 있어야 확인이 가능해요." />;
  } else if (!records.isSuccess || rounds.length === 0) {
    list = <Empty as="li" state={loadState(records)} text="스케줄링 기록이 존재하지 않아요." />;
  } else {
    // 최근 기록이 위로 오게 정렬합니다.
    list = [...rounds]
      .sort((a, b) => b.saved_at.localeCompare(a.saved_at))
      .map((record) => (
        <li key={record.saved_at}>
          <button
            className={roundAt === record.saved_at ? "round on" : "round"}
            aria-pressed={roundAt === record.saved_at}
            onClick={() => onSelect(record.saved_at)}
          >
            <b>{stampLabel(record.saved_at)}</b>
            {record.score === null ? null : <span className="badge score">{scoreLabel(record.score)}</span>}
            {record.applied_at === null ? null : <span className="badge applied">{appliedLabel(record.applied_at)}</span>}
          </button>
        </li>
      ));
  }
  return (
    <Panel title="스케줄링 기록" hint="캘린더에서 미리보기가 가능해요">
      <ul>{list}</ul>
    </Panel>
  );
}

/** 오른쪽 칸의 스케줄링 시간 편집입니다. 계산 시각은 기간에 속한 값이라 period_edit 권한이 필요합니다.
 *  설정 화면의 기간 form 과 같은 값을 같은 endpoint(API 의 요청 주소 단위)로 수정합니다. 이 칸에서는 두 시각만 따로 수정할 수 있게 둡니다. */
export function RunTimesPanel({ period, canManage }: { period: Period | null; canManage: boolean }) {
  const queryClient = useQueryClient();
  // 수정한 값만 이 state 에 담습니다. 기간을 변경하면 담긴 id 가 맞지 않으므로 그때는
  // 다시 서버 값을 사용합니다. useEffect 로 동기화하지 않고 렌더할 때마다 id 를 비교합니다.
  const [form, setForm] = useState<{ id: number; first: string; second: string } | null>(null);

  const save = useMutation({
    mutationFn: (body: { first_run_at: string; second_run_at: string }) => {
      if (period === null) throw new Error("선택한 집중 합주기간이 존재하지 않아요");
      return getJSON<{ period: Period }>(`/periods/${period.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
    },
    onSuccess: async () => {
      // 수정한 값을 서버에서 다시 받아 화면과 맞춥니다. 받아온 뒤에는 수정 기록을 삭제합니다.
      await queryClient.invalidateQueries({ queryKey: PERIODS_KEY });
      setForm(null);
      say("엔진 연산 시간을 저장했어요");
    },
    onError: (error) => say(error instanceof Error ? error.message : "엔진 연산 시간을 저장하지 못했어요."),
  });

  const shown = form !== null && period !== null && form.id === period.id
    ? form
    : { id: period?.id ?? 0, first: period?.first_run_at ?? "", second: period?.second_run_at ?? "" };
  const why = checkRunTimes(shown.first, shown.second);
  const changed = period !== null
    && (shown.first !== period.first_run_at || shown.second !== period.second_run_at);

  return (
    <Panel title="스케줄링 시간" hint="지정한 시간에 스케줄링을 진행해요">
      <div className="times">
        {/* 큰 시각 표시는 두지 않습니다(사용자 결정 2026-10-07). 입력칸이 저장된 값을 보여 주고, 칸 위에 1차, 2차를 작게 적습니다. */}
        {period === null ? <div className="t">집중 합주기간을 생성해주세요</div> : (
          <>
            <div className="rows">
              <label className="run">
                1차
                <input
                  type="time"
                  aria-label="1차 스케줄링 시간"
                  disabled={!canManage || save.isPending}
                  value={shown.first}
                  onChange={(event) => setForm({ id: period.id, first: event.target.value, second: shown.second })}
                />
              </label>
              <label className="run">
                2차
                <input
                  type="time"
                  aria-label="2차 스케줄링 시간"
                  disabled={!canManage || save.isPending}
                  value={shown.second}
                  onChange={(event) => setForm({ id: period.id, first: shown.first, second: event.target.value })}
                />
              </label>
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
            {/* 안내는 패널 부제에 있습니다. 아래 줄은 검증 오류와 권한 없음일 때만 표시합니다(사용자 결정 2026-10-07). */}
            {why === "" && canManage ? null : (
              <p>{why !== "" ? why : "스케줄링 시간 설정 권한이 있어야 시간을 지정할 수 있어요."}</p>
            )}
          </>
        )}
      </div>
    </Panel>
  );
}

/** 확정 해제 버튼과 사유 modal 입니다. 해제하면 마감 일시가 삭제되고 전체 멤버에게 해제 사유를 포함한 알림을 전송합니다(사용자 결정 2026-10-20). */
export function UnfixButton({ period }: { period: Period }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const buttonRef = useRef<HTMLButtonElement>(null);
  // 해제되면 이 버튼이 사라지므로 focus 를 같은 머리줄의 기간 드롭다운으로 이동합니다.
  async function done(): Promise<void> {
    const dropdown = buttonRef.current?.closest(".calhead")?.querySelector<HTMLElement>(".ddbtn");
    setOpen(false);
    say("확정을 해제했어요.");
    await Promise.all([PERIODS_KEY, NOTIFICATIONS_KEY].map((queryKey) => queryClient.invalidateQueries({ queryKey })));
    dropdown?.focus();
  }
  return (
    <>
      <Button ref={buttonRef} kind="ghost" className="unfix" aria-label={`${periodTitle(period)} 확정 해제`} onClick={() => setOpen(true)}>확정 해제</Button>
      {!open ? null : (
        <ReasonDialog
          title="확정 해제"
          hint="확정을 해제하면 마감 일시가 삭제되고, 전체 멤버에게 해제 사유를 포함한 알림을 전송해요."
          subject={periodTitle(period)}
          action="해제"
          onSubmit={(text) => unfixPeriod(period.id, text)}
          onDone={() => { void done(); }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
