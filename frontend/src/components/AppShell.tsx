import { useQueries } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";

import { NotificationMenu } from "./NotificationMenu";
import { useMe, useMyTeams, usePage } from "./hooks";
import { useToast } from "../lib/toast";
import { can, roleLabel } from "../lib/account";
import { getJSON, logOut } from "../lib/pipeline";
import type { Member, Permission } from "../lib/contract";
import "../styles/shell.css";

// 사이드바 차림. 두 화면이 같은 것을 보여주고, 지금 보는 곳만 다르게 켠다.
const NAV = [
  { key: "schedule", label: "합주실 시간표", to: "/scheduler" },
  { key: "notice", label: "공지사항", to: "/notices" },
  { key: "find-team", label: "팀 찾기", to: "/teams" },
  { key: "board", label: "팀 게시판", to: "/board" },
  // 설정은 누구에게나 보인다 — 화면 밝기는 권한과 무관한 개인 설정이다. 안에서 무엇을
  // 볼지는 설정 화면이 탭 단위로 다시 가린다.
  { key: "settings", label: "설정", to: "/settings" },
] as const;

// needs 중 하나라도 가진 사람에게만 보인다.
const MANAGER_NAV = [
  { key: "assign", label: "배정 결과 확인", to: "/admin", needs: ["assign_read"] },
] as const satisfies readonly { key: string; label: string; to: string; needs: readonly Permission[] }[];

export type NavKey = (typeof NAV)[number]["key"] | (typeof MANAGER_NAV)[number]["key"];

type NavItem = { key: string; label: string; to: string };

function NavList({ items, current }: { items: readonly NavItem[]; current: NavKey | undefined }) {
  return (
    <nav>
      {items.map((item) => (
          <NavLink key={item.key} to={item.to}
            aria-current={item.key === current ? "page" : undefined}>
            {item.label}
          </NavLink>
      ))}
    </nav>
  );
}

export function AppShell(props: {
  /** 화면 CSS 가 갇혀 있는 이름 — scheduler, admin. */
  page: string;
  /** 사이드바에 없는 화면(프로필 설정)은 아무 항목도 켜지 않도록 비워 둔다. */
  current?: NavKey;
  /** 사이드바 맨 아래에 덧붙일 것. */
  sideExtra?: ReactNode;
  children: ReactNode;
}) {
  const { page, current, sideExtra, children } = props;
  const toast = useToast();
  usePage(page);
  // shell.css 가 이 표시로 껍데기(상단바·사이드바·탭·카드)를 입힌다. 계정·랜딩 화면에는 없다.
  useEffect(() => {
    document.body.dataset.shell = "";
    return () => { delete document.body.dataset.shell; };
  }, []);
  const { me } = useMe();

  // 가진 항목으로 가린다. 계정을 아직 못 받았으면 아무것도 보이지 않는다.
  const managerNav = MANAGER_NAV.filter((item) => item.needs.some((need) => can(me, need)));

  return (
    <>
      <header className="top">
        <div className="in">
          <div className="logo"><b>Banblit</b><span>IN SIX STRINGS · A실</span></div>
          <NotificationMenu />
          <ProfileMenu />
        </div>
      </header>

      <div className="shell">
        <aside className="side" aria-label="메뉴">
          <div className="inner">
            <NavList items={NAV} current={current} />
            {managerNav.length === 0 ? null : (
              <>
                <div className="sep" />
                <div className="cap">관리</div>
                <NavList items={managerNav} current={current} />
              </>
            )}
            {sideExtra}
          </div>
        </aside>

        <div className="page">{children}</div>
      </div>

      <div className={toast ? "toast on" : "toast"} role="status" aria-live="polite">
        {toast}
      </div>
    </>
  );
}

/** 흰 카드 한 장. 안쪽 배치는 각 화면 CSS 가 정한다. */
export function Card({ children }: { children: ReactNode }) {
  return <div className="card">{children}</div>;
}

export function Tabs<T extends string>(props: {
  label: string;
  items: readonly { key: T; text: string }[];
  selected: T;
  onSelect: (key: T) => void;
}) {
  const { label, items, selected, onSelect } = props;
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {items.map((item) => (
        <button key={item.key} className="tab" role="tab"
          aria-selected={item.key === selected} onClick={() => onSelect(item.key)}>
          {item.text}
        </button>
      ))}
    </div>
  );
}

/** 상단 오른쪽 프로필 단추 + 말풍선. 스케줄러·게시판류 화면이 함께 쓴다.
 *  "프로필 설정"이 이 말풍선에서 `/profile`로 들어가는 유일한 입구다. */
export function ProfileMenu() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { me } = useMe();
  const teams = useMyTeams();
  const name = me?.name ?? "";
  const sub = me ? roleLabel(me.role) : "";
  const initial = name.slice(0, 2);

  // 팀마다 그 팀의 명단을 받는다. 명단에서 내 번호와 같은 사람을 찾으면 그 사람이
  // 그 팀에서 맡은 포지션이다 — 이름이 아니라 번호로 가른다(동명이인 규칙).
  // query key 는 hooks 의 것과 같아, 이미 받아 둔 명단이 있으면 다시 부르지 않는다.
  const rosters = useQueries({
    queries: teams.map((team) => ({
      queryKey: ["members", team.id],
      queryFn: () => getJSON<{ members: Member[] }>(`/teams/${team.id}/members`),
    })),
  });

  // 서버 호출이 실패해도 로그인 화면으로는 보낸다 — 표시용 쿠키가 남아 있어도
  // 다음 요청은 401로 거절되니 화면을 붙잡아 둘 이유가 없다.
  async function handleLogOut(): Promise<void> {
    setOpen(false);
    try {
      await logOut();
    } catch {
      // 무시 — 아래에서 로그인 화면으로 보낸다.
    }
    void navigate("/login");
  }

  return (
    <>
      <button className="profbtn" aria-expanded={open} onClick={() => setOpen((on) => !on)}>
        <span className="face" aria-hidden="true">{initial}</span>
        <span className="nm">{name}</span>
        <span className="ar" aria-hidden="true">▾</span>
      </button>
      <div className={open ? "pop on" : "pop"} role="dialog" aria-label="내 프로필">
        <div className="who">
          <span className="face" aria-hidden="true">{initial}</span>
          <div><b>{name}</b><small>{sub}</small></div>
        </div>
        <hr />
        <div className="cap">소속 팀 {teams.length}개</div>
        {teams.map((team, index) => {
          const mine = rosters[index]?.data?.members.find((member) => member.id === me?.id);
          return (
            <div className="tm" key={team.id}>
              <i style={{ background: `var(--${team.colorKey})` }} />{team.name}
              {/* 명단이 아직 안 왔으면 비워 둔다. 없는 값을 지어내지 않는다. */}
              <small>{mine?.cohort == null ? "" : `${mine.cohort}기`}</small>
            </div>
          );
        })}
        <hr />
        <button className="act" onClick={() => { setOpen(false); void navigate("/profile"); }}>
          프로필 설정<span>›</span>
        </button>
        <button className="act quit" onClick={() => void handleLogOut()}>로그아웃</button>
      </div>
    </>
  );
}

/** 오른쪽 목록 한 칸. onOpen 이 있으면 머리글이 눌리는 단추가 된다. */
export function Panel(props: {
  title: string;
  hint?: string;
  onOpen?: () => void;
  children: ReactNode;
}) {
  const { title, hint, onOpen, children } = props;
  const head = <>{title}{hint === undefined ? null : <span>{hint}</span>}</>;
  return (
    <section className="panel">
      {onOpen === undefined
        ? <div className="ph">{head}</div>
        : <button className="ph" onClick={onOpen}>{head}</button>}
      {children}
    </section>
  );
}
