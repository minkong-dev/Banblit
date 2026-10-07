// 관리자 메뉴의 불가능 일정 구역입니다. 전체 멤버가 등록한 불가능 일정을 한 표에서 봅니다.
// "타 멤버 불가능 일정 조회"(unavailable_read) 권한자에게만 이 항목이 표시되고, 서버도 같은 권한으로
// 거절합니다(backend/src/backend/services/unavailable/unavailable_service.py 의 _require_read).
//
// "타 멤버 불가능 일정 반려"(unavailable_manage) 권한이 있으면 다른 멤버의 일정을 반려 사유를 적어 삭제합니다.
// 사유는 그 멤버에게 알림으로 갑니다. 본인 일정은 바로 삭제합니다. 다른 멤버의 일정을 대신 등록하거나
// 수정할 수는 없습니다 — 다른 사람이 대신 등록한 불가능 일정은 본인이 모르는 채로 배정에 반영됩니다.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Card, SectionHead } from "../components/Layout";
import { RejectDialog } from "../components/RejectDialog";
import { useMe } from "../components/queries";
import { can } from "../lib/account";
import { reason } from "../lib/api";
import { repeatLabel } from "../lib/calendar";
import { askDelete } from "../lib/confirm";
import { dayWithWeekday, hhmm, loadAllUnavailable, rejectUnavailable, removeUnavailable } from "../lib/pipeline";
import type { MemberUnavailable } from "../lib/contract";
import { say } from "../lib/toast";

// 전체 목록의 queryKey 입니다. 앞머리가 달력의 불가능 일정 조회와 같은 "unavailable" 이라, 반려·삭제 뒤 둘 다 다시 조회합니다.
const LIST_KEY = ["unavailable", "all"] as const;

/** 반복 일정이 끝나는 시점입니다. 종료일과 횟수는 동시에 값을 가질 수 없고, 둘 다 없으면 빈 문자열입니다.
 *  횟수는 고른 요일 전부를 한 세트로 세는 주 단위입니다(lib/dayEntries 의 repeatDays 와 같은 규칙). */
function repeatEndLabel(row: MemberUnavailable): string {
  if (row.repeat_until !== null) return `${row.repeat_until} 까지`;
  if (row.repeat_count !== null) return `${row.repeat_count}주`;
  return "";
}

/** 표와 반려 modal 이 같이 쓰는 일정 한 줄입니다. "9월 14일 월요일 18:00–19:00" */
function whenLabel(row: MemberUnavailable): string {
  return `${dayWithWeekday(row.starts_at.slice(0, 10))} ${hhmm(row.starts_at)}–${hhmm(row.ends_at)}`;
}

export function UnavailableCards() {
  const client = useQueryClient();
  const { me } = useMe();
  // 검색어입니다. 멤버가 늘면 표가 길어지므로 이름으로 좁힙니다.
  const [keyword, setKeyword] = useState("");
  // 반려 사유 modal 을 연 일정입니다. null 이면 modal 이 닫혀 있습니다.
  const [rejecting, setRejecting] = useState<MemberUnavailable | null>(null);

  const list = useQuery({ queryKey: LIST_KEY, queryFn: loadAllUnavailable });

  const rows = list.data ?? [];
  const needle = keyword.trim();
  const shown = needle === "" ? rows : rows.filter((row) => row.member.includes(needle));

  return (
    <Card>
      <SectionHead title="불가능 일정" desc="전체 멤버가 등록한 불가능 일정이에요." />

      <div className="roster">
        <label className="find">
          <span>멤버 이름</span>
          <input
            type="search"
            value={keyword}
            placeholder="이름으로 찾기"
            onChange={(event) => setKeyword(event.target.value)}
          />
        </label>

        {list.isError ? <p className="empty">{reason(list.error)}</p> : null}
        <UnavailableTable
          rows={shown}
          meId={me?.id ?? null}
          canReject={can(me, "unavailable_manage")}
          onReject={setRejecting}
        />
        {list.isPending ? <p className="empty">불가능 일정을 불러오고 있어요.</p> : null}
        {list.isSuccess && rows.length === 0 ? <p className="empty">등록된 불가능 일정이 없어요</p> : null}
        {list.isSuccess && rows.length > 0 && shown.length === 0 ? (
          <p className="empty">{needle} 님이 등록한 불가능 일정이 없어요</p>
        ) : null}
      </div>

      {rejecting === null ? null : (
        <RejectDialog
          target="unavailable"
          owner={rejecting.member}
          subject={`${whenLabel(rejecting)} ${rejecting.name ?? "불가능 일정"}`}
          onReject={(text) => rejectUnavailable(rejecting.member_id, rejecting.id, text)}
          onDone={() => {
            setRejecting(null);
            void client.invalidateQueries({ queryKey: ["unavailable"] });
            say("불가능 일정을 반려했어요");
          }}
          onClose={() => setRejecting(null)}
        />
      )}
    </Card>
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
            <td>{hhmm(row.starts_at)}–{hhmm(row.ends_at)}</td>
            <td>{[repeatLabel(row.repeat_weekdays ?? 0), repeatEndLabel(row)].filter(Boolean).join(" ")}</td>
            {/* 이름을 입력하지 않은 일정은 달력과 같은 문구로 표시합니다. */}
            <td>{row.name ?? "불가능 일정"}</td>
            <td>{row.reason ?? ""}</td>
            <td className="fill" />
            <td>
              {row.member_id === meId ? (
                <DeleteOwnButton row={row} />
              ) : canReject ? (
                <button className="btn" aria-label={`${row.member} ${whenLabel(row)} 반려`} onClick={() => onReject(row)}>
                  반려
                </button>
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
    onSettled: () => { void client.invalidateQueries({ queryKey: ["unavailable"] }); },
    onSuccess: () => say("불가능 일정을 삭제했어요"),
    onError: (error) => say(reason(error, "불가능 일정을 삭제하지 못했어요")),
  });
  const label = `${whenLabel(row)} 불가능 일정`;
  return (
    <button
      className="btn"
      disabled={remove.isPending}
      aria-label={`${label} 삭제`}
      onClick={() => { if (askDelete(label)) remove.mutate(); }}
    >
      삭제
    </button>
  );
}
