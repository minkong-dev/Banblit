// 이름으로 멤버를 검색합니다. 팀 생성 화면과 permission set(권한 집합) 편집 화면이 같은 컴포넌트를 사용합니다.
// Modal 이 제목과 아래 버튼 줄을 렌더하고, 이 컴포넌트는 입력 칸과 검색 결과 목록만 렌더합니다.
//
// 검색어가 비어 있을 때는 아무것도 표시하지 않습니다. 서버도 그렇게 응답하고,
// 전체 멤버 목록을 반환하는 기능이 아니기 때문입니다.

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { getJSON, reason } from "../lib/api";
import { memberLabel } from "../lib/pipeline";
import type { Member } from "../lib/contract";


export function MemberSearch(props: {
  onPick: (member: Member) => void;
  /** 이미 선택한 멤버는 목록에서 제외합니다. 같은 멤버를 두 번 선택할 필요가 없습니다. */
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
    body = <p className="empty">검색을 위해 이름을 입력해주세요.</p>;
  } else if (found.isPending) {
    body = <p className="empty">검색 중…</p>;
  } else if (found.isError) {
    body = <p className="empty">{reason(found.error)}</p>;
  } else if (members.length === 0) {
    body = <p className="empty">해당하는 사용자를 찾지 못했어요.</p>;
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
        // eslint-disable-next-line jsx-a11y/no-autofocus -- 검색 컴포넌트가 열릴 때 검색어 입력칸으로 초점을 이동합니다. 페이지 최초 로드가 아닙니다.
        autoFocus
        type="search"
        value={text}
        aria-label="검색어"
        placeholder="이름을 입력해주세요"
        onChange={(event) => setText(event.target.value)}
      />
      {body}
    </div>
  );
}
