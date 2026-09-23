import { useQueries } from "@tanstack/react-query";
import { useLayoutEffect } from "react";
import type { ReactNode } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import { NotificationMenu } from "./NotificationMenu";
import { CloseIcon, WideMenuIcon } from "./icons";
import { useDismissible, usePage } from "./hooks";
import { useMe, useMyTeams } from "./queries";
import { useToast } from "../lib/toast";
import { Avatar } from "./Avatar";
import { can, canOpenSettings, roleLabel, teamNavLabel } from "../lib/account";
import { cohortLabel } from "../lib/roster";
import { getJSON, logOut } from "../lib/pipeline";
import type { Member, Permission } from "../lib/contract";
import "../styles/shell.css";

// 사이드바 메뉴입니다. 권한에 따라 표시되는 항목이 다릅니다.
const NAV = [
  { key: "schedule", label: "대시보드", to: "/scheduler" },
  { key: "notice", label: "공지사항", to: "/notices" },
  { key: "find-team", label: "팀 찾기", to: "/teams" },
  { key: "board", label: "팀 게시판", to: "/board" },
  // 관리 권한이 있는 사람에게만 표시합니다. 자기 계정에 대한 설정은 프로필 화면에 있습니다.
  { key: "settings", label: "설정", to: "/settings" },
] as const;

// 필요 권한을 가진 사람만 배정 결과를 확인할 수 있습니다.
const MANAGER_NAV = [
  { key: "assign", label: "배정 결과 확인", to: "/admin", needs: ["assign_read"] },
] as const satisfies readonly { key: string; label: string; to: string; needs: readonly Permission[] }[];

// 주소의 첫 구간 → 화면 CSS 가 격리되는 이름(body[data-page])입니다. 공지사항과 팀 게시판은 board.css 를 함께 씁니다.
const PAGE_BY_PATH: Record<string, string> = {
  scheduler: "scheduler",
  admin: "admin",
  settings: "settings",
  notices: "board",
  board: "board",
  teams: "teams",
  profile: "profile",
};

type NavItem = { key: string; label: string; to: string };

// 휴대폰 메뉴 판의 id 입니다. 상단바의 햄버거 버튼이 popoverTarget 으로 이 판을 엽니다.
const MENU_ID = "shellmenu";

// NavLink 는 주소가 to 와 같거나 그 아래(/notices/new 등)이면 aria-current="page" 를 붙입니다.
// 사이드바에 없는 화면(프로필 설정)에서는 아무 항목도 켜지지 않습니다.
function NavList({ items }: { items: readonly NavItem[] }) {
  return (
    <nav>
      {items.map((item) => <NavLink key={item.key} to={item.to}>{item.label}</NavLink>)}
    </nav>
  );
}

/** 사이드바와 휴대폰 메뉴 판이 함께 쓰는 메뉴 목록입니다. 관리자 메뉴는 권한이 있을 때만 붙습니다. */
function MenuItems({ nav, managerNav }: { nav: readonly NavItem[]; managerNav: readonly NavItem[] }) {
  return (
    <>
      <NavList items={nav} />
      {managerNav.length === 0 ? null : (
        <>
          <div className="sep" />
          <div className="cap">관리자 메뉴</div>
          <NavList items={managerNav} />
        </>
      )}
    </>
  );
}

/** 로그인 뒤 화면의 layout route 입니다. 화면을 이동해도 유지되고 Outlet 안의 화면만 교체됩니다. */
export function AppShell() {
  const { pathname } = useLocation();
  const toast = useToast();
  usePage(PAGE_BY_PATH[pathname.split("/")[1]] ?? "");
  // shell.css 가 이 속성으로 공통 layout(상단바·사이드바·탭·카드)의 스타일을 적용합니다. 계정·랜딩 화면에는 없습니다.
  // AppShell 이 유지되므로 로그인 뒤 화면 사이를 이동하는 동안에는 삭제되지 않습니다.
  useLayoutEffect(() => {
    document.body.dataset.shell = "";
    return () => { delete document.body.dataset.shell; };
  }, []);
  const { me } = useMe();

  // 가진 권한으로 필터링합니다. 계정을 아직 받지 못했으면 아무것도 표시되지 않습니다.
  const managerNav = MANAGER_NAV.filter((item) => item.needs.some((need) => can(me, need)));
  // 팀 메뉴 이름만 권한에 따라 "팀 관리"·"내 팀"으로 변경됩니다. 주소와 key 는 같습니다.
  const nav = NAV.filter((item) => item.key !== "settings" || canOpenSettings(me)).map((item) =>
    item.key === "find-team" ? { ...item, label: teamNavLabel(me) } : item,
  );

  return (
    <>
      <header className="top">
        <div className="in">
          {/* 휴대폰(767px 이하)에서만 보입니다. 넓은 창에서는 사이드바가 늘 보이므로 CSS 가 숨깁니다. */}
          <button className="menubtn" aria-label="메뉴 열기" popoverTarget={MENU_ID}>
            <WideMenuIcon />
          </button>
          <div className="logo"><b>Banblit</b><span>IN SIX STRINGS</span></div>
          <NotificationMenu />
          <ProfileMenu />
        </div>
      </header>

      <div className="shell">
        <aside className="side" aria-label="메뉴">
          <div className="inner"><MenuItems nav={nav} managerNav={managerNav} /></div>
        </aside>

        <div className="page"><Outlet /></div>
      </div>

      {/* 휴대폰 메뉴 판입니다(Material Design 모달 드로어). popover="auto" 라 바깥을 누르거나 Esc 를 누르면 브라우저가 닫습니다.
          링크는 popoverTarget 을 걸 수 없어서(버튼만 가능) 링크를 누르면 여기서 닫습니다. */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- 링크를 눌렀을 때 판을 닫습니다. 키보드의 Enter 는 click 으로 전달되고 Escape 는 브라우저가 처리합니다. */}
      <div
        id={MENU_ID}
        popover="auto"
        className="drawer"
        role="dialog"
        aria-label="메뉴"
        onClick={(event) => { if ((event.target as HTMLElement).closest("a")) event.currentTarget.hidePopover(); }}
      >
        <button className="x" aria-label="메뉴 닫기" popoverTarget={MENU_ID} popoverTargetAction="hide">
          <CloseIcon />
        </button>
        <MenuItems nav={nav} managerNav={managerNav} />
      </div>

      <div className={toast ? "toast on" : "toast"} role="status" aria-live="polite">
        {toast}
      </div>
    </>
  );
}

/** 흰 카드 한 장입니다. 내부 배치는 각 화면의 CSS가 정의합니다. */
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

/** 상단 오른쪽 프로필 버튼 + 프로필 카드입니다. 여러 화면에서 함께 씁니다.
 *  "프로필 설정"은 이 프로필 카드에서 `/profile`로 들어가는 유일한 입구입니다. */
export function ProfileMenu() {
  const { open, setOpen, toggle, box } = useDismissible();
  const navigate = useNavigate();
  const { me } = useMe();
  const teams = useMyTeams();
  const name = me?.name ?? "";
  const sub = roleLabel(me);

  // 팀마다 그 팀의 명단을 받습니다. 명단에서 내 번호와 같은 사람을 찾으면 그 사람이
  // 그 팀에서 맡은 포지션입니다. 이름이 아니라 번호로 구분합니다(동명이인 규칙).
  // queryKey(TanStack Query가 관리하는 조회 식별자)는 hooks 의 queryKey 와 같아서 이미 받아 둔 명단이 있으면 다시 요청하지 않습니다.
  const rosters = useQueries({
    queries: teams.map((team) => ({
      queryKey: ["members", team.id],
      queryFn: () => getJSON<{ members: Member[] }>(`/teams/${team.id}/members`),
    })),
  });

  // 서버 호출이 실패해도 로그인 화면으로 이동합니다. 표시용 cookie(브라우저가 저장해 요청마다 함께 보내는 값)가 남아 있어도
  // 다음 요청은 401 로 거절되므로 현재 화면을 유지할 이유가 없습니다.
  async function handleLogOut(): Promise<void> {
    setOpen(false);
    try {
      await logOut();
    } catch {
      // 오류를 무시합니다. 아래에서 로그인 화면으로 이동합니다.
    }
    void navigate("/login");
  }

  return (
    // display:contents 이므로 자리를 차지하지 않습니다. 상단바의 배치는 그대로 두고,
    // 바깥 클릭을 감지하는 요소만 만듭니다.
    <div className="profwrap" ref={box}>
      <button className="profbtn" aria-expanded={open} onClick={toggle}>
        <Avatar id={me?.id ?? null} name={name} photo={me?.avatar ?? null} />
        <span className="nm">{name}</span>
        <span className="ar" aria-hidden="true">▾</span>
      </button>
      <div className={open ? "pop on" : "pop"} role="dialog" aria-label="내 프로필">
        <div className="who">
          <Avatar id={me?.id ?? null} name={name} photo={me?.avatar ?? null} />
          <div><b>{name}</b><small>{sub}</small></div>
        </div>
        <hr />
        <div className="cap">소속 팀 {teams.length}개</div>
        {teams.map((team, index) => {
          const mine = rosters[index]?.data?.members.find((member) => member.id === me?.id);
          return (
            <div className="tm" key={team.id}>
              <i style={{ background: `var(--${team.colorKey})` }} />{team.name}
              {/* 명단이 아직 오지 않았으면 아무것도 표시하지 않습니다. 없는 값을 생성하지 않습니다. */}
              <small>{cohortLabel(mine?.cohort ?? null)}</small>
            </div>
          );
        })}
        <hr />
        <button className="act" onClick={() => { setOpen(false); void navigate("/profile"); }}>
          프로필 설정<span>›</span>
        </button>
        <button className="act quit" onClick={() => void handleLogOut()}>로그아웃</button>
      </div>
    </div>
  );
}

/** 오른쪽 목록 한 칸입니다. onOpen 이 있으면 제목이 클릭할 수 있는 버튼이 됩니다. */
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
