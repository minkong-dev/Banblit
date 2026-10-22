// 이름으로 팀을 검색합니다. useTeams 가 이미 받은 팀 목록에서 이름이 일치하는 팀만 남기고, 서버에 검색을 요청하지 않습니다.

import { useState } from "react";

import { loadState } from "../lib/loading";
import { matchingTeams } from "../lib/roster";
import type { Team } from "../lib/contract";
import { Empty } from "./controls";
import { useTeams } from "./queries";
import { SearchList } from "./SearchList";

export function TeamSearch({ onPick }: { onPick: (team: Team) => void }) {
  const [text, setText] = useState("");
  const teams = useTeams();
  const shown = matchingTeams(teams.data?.teams ?? [], text);

  return (
    <SearchList
      text={text}
      onText={setText}
      placeholder="팀 이름을 입력해주세요"
      items={shown.map((team) => ({ id: team.id, label: team.name }))}
      empty={<Empty state={loadState(teams)} text={text.trim() === "" ? "등록된 팀이 없어요." : "해당하는 팀을 찾지 못했어요."} />}
      onPick={(id) => {
        const team = shown.find((item) => item.id === id);
        if (team !== undefined) onPick(team);
      }}
    />
  );
}
