// 이름으로 멤버를 검색합니다. 팀 생성 화면, permission set(권한 집합) 편집 화면, 불가능 일정 화면이 같은 컴포넌트를 사용합니다.
// Modal 이 제목과 아래 버튼 줄을 렌더하고, 이 컴포넌트는 서버 조회 결과를 SearchList 에 전달합니다.
//
// 검색어가 비어 있으면 명단 전체를 이름 순으로 표시합니다. 누가 있는지 보이지 않으면 찾으려는 사람의
// 이름을 한 글자씩 넣어 보는 수밖에 없기 때문입니다. 목록은 modal 본문이 스크롤합니다.

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { getJSON } from "../lib/api";
import { memberLabel, noMembersMessage } from "../lib/pipeline";
import { loadState } from "../lib/loading";
import type { Member } from "../lib/contract";
import { Empty } from "./controls";
import { SearchList } from "./SearchList";

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
    // 한 글자 넣을 때마다 조회가 새로 나갑니다. 이전 결과를 지우지 않고 두면 목록이
    // "불러오는 중…" 으로 사라졌다 돌아오지 않고, 다음 결과가 도착할 때 한 번에 바뀝니다.
    placeholderData: keepPreviousData,
  });
  const skip = new Set(exclude ?? []);
  const members = found.isSuccess ? found.data.members.filter((member) => !skip.has(member.id)) : [];

  return (
    <SearchList
      text={text}
      onText={setText}
      placeholder="이름을 입력해주세요"
      items={members.map((member) => ({ id: member.id, label: memberLabel(member.name, member.cohort) }))}
      empty={<Empty state={loadState(found)} text={noMembersMessage(query)} />}
      onPick={(id) => {
        const member = members.find((item) => item.id === id);
        if (member !== undefined) onPick(member);
      }}
    />
  );
}
