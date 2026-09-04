// 화면이 함께 쓰는 훅. 흩어져 있던 네 파일을 한 기능 파일로 묶었다.
// 서버를 부르는 것은 시퀀스 파일(lib/pipeline)을 거친다.

import { useQueries, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import { fetchMe, getJSON } from "../lib/pipeline";
import type { Account, Team } from "../lib/contract";

/** 화면 CSS 는 body[data-page="..."] 안에 갇혀 있다. 그 표시를 걸고 떼는 자리. */
export function usePage(page: string): void {
  useEffect(() => {
    document.body.dataset.page = page;
    return () => {
      delete document.body.dataset.page;
    };
  }, [page]);
}

// 알림 문구가 화면에 머무는 시간(밀리초). 프로토타입 세 화면이 쓰던 값 그대로다.
const HOLD_MS = 2600;

/** 짧은 알림 문구 하나를 띄웠다 지운다. 문구를 어디에 그릴지는 부르는 화면이 정한다. */
export function useToast(): { message: string; say: (message: string) => void } {
  const [message, setMessage] = useState("");
  const timer = useRef<number | undefined>(undefined);

  const say = useCallback((next: string) => {
    setMessage(next);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMessage(""), HOLD_MS);
  }, []);

  // 화면을 떠날 때 남은 시계를 끈다. 없어진 화면에 값을 넣으려 하면 경고가 뜬다.
  useEffect(() => () => window.clearTimeout(timer.current), []);

  return { message, say };
}

/** 지금 로그인한 계정과 그 계정이 속한 팀 번호들. /me 로 계정을 받고, 그 계정의
 *  번호(id)가 어느 팀 명단에 있는지를 훑어 소속을 가려낸다 — 이름이 아니라 번호로
 *  가른다(동명이인 규칙). 아직 못 불러왔으면 me 는 null 이다. */
export function useMe(): { me: Account | null; teamIds: number[]; teams: Team[] } {
  const account = useQuery({ queryKey: ["me"], queryFn: fetchMe, retry: false });
  const teamList = useQuery({
    queryKey: ["teams"],
    queryFn: () => getJSON<{ teams: Team[] }>("/teams"),
  });
  const teams = teamList.data?.teams ?? [];

  // 팀 목록을 먼저 받아야 명단을 물을 곳을 안다. 그래서 팀이 오기 전에는 아무것도
  // 묻지 않는다 — 순서가 반대일 수 없다.
  const rosters = useQueries({
    queries: teams.map((team) => ({
      queryKey: ["members", team.id],
      queryFn: () =>
        getJSON<{ members: { id: number; name: string }[] }>(`/teams/${team.id}/members`),
    })),
  });

  const me = account.data ?? null;
  const teamIds: number[] = [];
  if (me !== null) {
    rosters.forEach((query, index) => {
      const team = teams[index];
      if (team === undefined || query.data === undefined) return;
      if (query.data.members.some((member) => member.id === me.id)) teamIds.push(team.id);
    });
  }

  return { me, teamIds: [...teamIds].sort((a, b) => a - b), teams };
}

export type MyTeam = { id: number; name: string; colorKey: string };

/** 내가 속한 팀을 전체 팀 목록에서 골라내고, 목록 안 자리로 색을 매긴다(스케줄러와
 *  같은 규칙 — 전체 팀 목록에서의 순서가 곧 달력 색이다). 프로필 말풍선이 화면마다
 *  쓴다. 아직 못 불러왔거나 실패하면 빈 배열을 돌려준다 — 말풍선은 팀 없이도 그려진다. */
export function useMyTeams(): MyTeam[] {
  const { teamIds, teams } = useMe();
  return teams
    .map((team, index) => ({ ...team, colorKey: `c${(index % 4) + 1}` }))
    .filter((team) => teamIds.includes(team.id));
}
