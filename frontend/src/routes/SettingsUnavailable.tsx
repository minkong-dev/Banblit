// 관리자 메뉴의 불가능 일정 구역입니다(unavailable_read). 전체 멤버가 등록한 불가능 일정을 표 또는 캘린더(routes/UnavailableCalendar)로 표시합니다.
// unavailable_manage 권한자는 사유를 입력해 다른 멤버의 일정을 반려합니다. 사유는 그 멤버에게 알림으로 전송됩니다. 본인 일정은 바로 삭제합니다.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button, Empty, IconButton, SearchInput } from "../components/controls";
import { BulletListIcon, CalendarIcon, SearchIcon } from "../components/icons";
import "../styles/unavailable.css";
import { Card, SectionHead } from "../components/Layout";
import { RejectDialog } from "../components/RejectDialog";
import { ALL_UNAVAILABLE_KEY, UNAVAILABLE_KEY, useMe } from "../components/queries";
import { can } from "../lib/account";
import { reason } from "../lib/api";
import { repeatLabel } from "../lib/calendar";
import { askDelete } from "../lib/confirm";
import { loadAllUnavailable, rejectUnavailable, removeUnavailable } from "../lib/pipeline";
import type { MemberUnavailable } from "../lib/contract";
import { loadState } from "../lib/loading";
import type { LoadState } from "../lib/loading";
import { say } from "../components/toast";
import { UnavailableCalendar } from "./UnavailableCalendar";
import { dayWithWeekday } from "../lib/calendar";
import { dayTimeRangeLabel, timeRangeLabel } from "../lib/slots";

/** 반복 일정이 끝나는 시점입니다. 종료일과 횟수는 동시에 값을 가질 수 없고, 둘 다 없으면 빈 문자열입니다.
 *  횟수는 선택한 요일 전부를 한 세트로 세는 주 단위입니다(lib/dayEntries 의 repeatDays 와 같은 규칙). */
function repeatEndLabel(row: MemberUnavailable): string {
  if (row.repeat_until !== null) return `${row.repeat_until} 까지`;
  if (row.repeat_count !== null) return `${row.repeat_count}주`;
  return "";
}

/** 표와 반려 modal 이 같이 쓰는 일정 한 줄입니다. "9월 14일 월요일 18:00–19:00" */
function whenLabel(row: MemberUnavailable): string {
  return dayTimeRangeLabel(row.starts_at, row.ends_at);
}

export function UnavailableCards() {
  const client = useQueryClient();
  const { me } = useMe();
  // 반려 사유 modal 을 연 일정입니다. null 이면 modal 이 닫혀 있습니다.
  const [rejecting, setRejecting] = useState<MemberUnavailable | null>(null);
  const [calendar, setCalendar] = useState(false);

  const list = useQuery({ queryKey: ALL_UNAVAILABLE_KEY, queryFn: loadAllUnavailable });
  const rows = list.data ?? [];

  return (
    <Card>
      <SectionHead title="불가능 일정" desc="전체 멤버가 등록한 불가능 일정이에요.">
        <div className="viewswitch" role="group" aria-label="보기 방식">
          <IconButton label="캘린더로 보기" icon={<CalendarIcon />} pressed={calendar} onClick={() => setCalendar(true)} />
          <IconButton label="목록으로 보기" icon={<BulletListIcon />} pressed={!calendar} onClick={() => setCalendar(false)} />
        </div>
      </SectionHead>

      {calendar ? <UnavailableCalendar times={rows} /> : (
        <UnavailableList
          rows={rows}
          state={loadState(list)}
          meId={me?.id ?? null}
          canReject={can(me, "unavailable_manage")}
          onReject={setRejecting}
        />
      )}

      {rejecting === null ? null : (
        <RejectDialog
          target="unavailable"
          owner={rejecting.member}
          subject={`${whenLabel(rejecting)} ${rejecting.name ?? "불가능 일정"}`}
          onReject={(text) => rejectUnavailable(rejecting.member_id, rejecting.id, text)}
          onDone={() => {
            setRejecting(null);
            void client.invalidateQueries({ queryKey: UNAVAILABLE_KEY });
            say("불가능 일정을 반려했어요");
          }}
          onClose={() => setRejecting(null)}
        />
      )}
    </Card>
  );
}

/** 표 보기입니다. 검색어로 멤버 이름을 좁힙니다. 멤버가 늘면 표가 길어지기 때문입니다. */
function UnavailableList({ rows, state, meId, canReject, onReject }: {
  rows: MemberUnavailable[];
  state: LoadState;
  meId: number | null;
  canReject: boolean;
  onReject: (row: MemberUnavailable) => void;
}) {
  const [keyword, setKeyword] = useState("");
  const needle = keyword.trim();
  const shown = needle === "" ? rows : rows.filter((row) => row.member.includes(needle));

  return (
    <div className="roster unavail">
      {/* 캘린더 보기의 대상 선택 줄(.unavbar)과 같은 높이, 같은 자리에 둡니다. */}
      <div className="unavbar">
        <div className="pickfield">
          <SearchIcon aria-hidden="true" />
          <SearchInput label="멤버 이름" value={keyword} placeholder="멤버 이름을 입력해주세요." onChange={setKeyword} />
        </div>
      </div>

      {state.kind === "failed" ? <Empty text={state.why} /> : null}
      <UnavailableTable rows={shown} meId={meId} canReject={canReject} onReject={onReject} />
      {state.kind === "loading" ? <Empty text="불가능 일정을 불러오고 있어요." /> : null}
      {state.kind === "ready" && rows.length === 0 ? <Empty text="등록된 불가능 일정이 존재하지 않아요" /> : null}
      {state.kind === "ready" && rows.length > 0 && shown.length === 0 ? (
        <Empty text={`${needle} 님이 등록한 불가능 일정이 존재하지 않아요`} />
      ) : null}
    </div>
  );
}

/** 불가능 일정 표입니다. 마지막 열은 본인 일정이면 삭제, 다른 멤버의 일정이면 canReject 일 때만 반려 버튼입니다. */
function UnavailableTable({ rows, meId, canReject, onReject }: {
  rows: MemberUnavailable[];
  meId: number | null;
  canReject: boolean;
  onReject: (row: MemberUnavailable) => void;
}) {
  return (
    <table>
      <thead>
        <tr>
          <th>멤버</th>
          <th>날짜</th>
          <th>시간</th>
          <th>반복</th>
          <th>일정 이름</th>
          <th>사유</th>
          <th className="fill" aria-hidden="true" />
          <th aria-hidden="true" />
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <td>{row.member}</td>
            <td>{dayWithWeekday(row.starts_at.slice(0, 10))}</td>
            <td>{timeRangeLabel(row.starts_at, row.ends_at)}</td>
            <td>{[repeatLabel(row.repeat_weekdays ?? 0), repeatEndLabel(row)].filter(Boolean).join(" ")}</td>
            {/* 이름을 입력하지 않은 일정은 달력과 같은 문구로 표시합니다. */}
            <td>{row.name ?? "불가능 일정"}</td>
            <td>{row.reason ?? ""}</td>
            <td className="fill" />
            <td>
              {row.member_id === meId ? (
                <DeleteOwnButton row={row} />
              ) : canReject ? (
                <Button kind="ghost" aria-label={`${row.member} ${whenLabel(row)} 반려`} onClick={() => onReject(row)}>
                  반려
                </Button>
              ) : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** 본인 일정의 삭제 버튼입니다. 본인 일정은 반려 사유 없이 바로 삭제합니다. */
function DeleteOwnButton({ row }: { row: MemberUnavailable }) {
  const client = useQueryClient();
  const remove = useMutation({
    mutationFn: () => removeUnavailable(row.member_id, row.id),
    onSettled: () => { void client.invalidateQueries({ queryKey: UNAVAILABLE_KEY }); },
    onSuccess: () => say("불가능 일정을 삭제했어요"),
    onError: (error) => say(reason(error, "불가능 일정을 삭제하지 못했어요")),
  });
  const label = `${whenLabel(row)} 불가능 일정`;
  return (
    <Button
      kind="ghost"
      disabled={remove.isPending}
      aria-label={`${label} 삭제`}
      onClick={() => { if (askDelete(label)) remove.mutate(); }}
    >
      삭제
    </Button>
  );
}
