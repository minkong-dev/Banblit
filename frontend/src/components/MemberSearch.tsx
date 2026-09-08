// 사람을 이름으로 찾는 알맹이. 팀 자리와 권한 두 곳이 같은 것을 쓴다.
// 껍데기는 Modal 이 맡는다 — 이 부품은 입력칸과 결과 목록만 그린다.
//
// 빈 검색어에는 아무것도 나오지 않는다. 서버가 그렇게 답하기도 하고, 명단을 통째로
// 내주는 자리가 아니기 때문이다.

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { getJSON, reason } from "../lib/api";
import { memberLabel } from "../lib/pipeline";
import type { Member } from "../lib/contract";


export function MemberSearch(props: {
  onPick: (member: Member) => void;
  /** 이미 골라 둔 사람은 목록에서 뺀다. 같은 사람을 두 번 넣을 이유가 없다. */
  exclude?: number[];
}) {
  const { onPick, exclude } = props;
  const [text, setText] = useState("");
  const query = text.trim();

  const found = useQuery({
    queryKey: ["member-search", query],
    queryFn: () =>
      getJSON<{ members: Member[] }>(`/members/search?q=${encodeURIComponent(query)}`),
    enabled: query !== "",
  });
  const skip = new Set(exclude ?? []);
  const members = (found.data?.members ?? []).filter((member) => !skip.has(member.id));

  let body;
  if (query === "") {
    body = <p className="empty">이름을 입력하면 찾아 드려요.</p>;
  } else if (found.isPending) {
    body = <p className="empty">찾는 중…</p>;
  } else if (found.isError) {
    body = <p className="empty">{reason(found.error)}</p>;
  } else if (members.length === 0) {
    body = <p className="empty">그런 이름을 찾지 못했어요.</p>;
  } else {
    body = (
      <ul className="found">
        {members.map((member) => (
          <li key={member.id}>
            <button onClick={() => onPick(member)}>
              {memberLabel(member.name, member.cohort)}
            </button>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="seek">
      <input
        autoFocus
        type="search"
        value={text}
        aria-label="찾을 이름"
        placeholder="이름"
        onChange={(event) => setText(event.target.value)}
      />
      {body}
    </div>
  );
}
