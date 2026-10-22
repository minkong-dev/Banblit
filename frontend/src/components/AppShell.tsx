import { useQueryClient } from "@tanstack/react-query";
import { useLayoutEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import { BrandLockup } from "./Brand";
import { Button, CloseButton, IconButton, MenuItem } from "./controls";
import { NotificationMenu } from "./NotificationMenu";
import { MoonIcon, SunIcon, WideMenuIcon } from "./icons";
import { usePage } from "./hooks";
import { Popover } from "./Popover";
import { ME_KEY, TEAMS_KEY, useMe, useMyTeamCohorts } from "./queries";
import { useToast } from "./toast";
import { LOADING_TEXT } from "../lib/loading";
import type { LoadState } from "../lib/loading";
import { Avatar } from "./Avatar";
import { can, roleLabel, teamNavLabel } from "../lib/account";
import { ADMIN_MENU } from "../lib/adminMenu";
import { cohortLabel } from "../lib/roster";
import { logOut } from "../lib/pipeline";
import type { Permission } from "../lib/contract";
import { applyTheme, readSavedTheme, type Theme } from "../lib/theme";
import "../styles/shell.css";

// 사이드바 메뉴입니다. 권한에 따라 표시되는 항목이 다릅니다.
const NAV = [
  { key: "schedule", label: "대시보드", to: "/scheduler" },
  { key: "notice", label: "공지사항", to: "/notices" },
  { key: "find-team", label: "팀 찾기", to: "/teams" },
  { key: "board", label: "팀 게시판", to: "/board" },
  // 자기 계정에 대한 설정은 프로필 화면에 있고, 관리 항목은 아래 관리자 메뉴에 구역별로 있습니다.
] as const; // as const 는 값을 리터럴 타입(string 이 아니라 "board" 같은 값 자체)으로 고정합니다.

// 관리 권한을 요구하는 항목입니다. 배정 결과 뒤로는 lib/adminMenu.ts 의 목록이 그대로 이어집니다.
const MANAGER_NAV = [
  { key: "assign", label: "배정 결과 확인", to: "/admin", needs: ["assign_read"] },
  ...ADMIN_MENU,
// satisfies 는 리터럴 타입을 유지한 채, 구조가 오른쪽에 적은 타입에 맞는지만 검사합니다.
] as const satisfies readonly { key: string; label: string; to: string; needs: readonly Permission[] }[];

// 주소의 첫 구간별로 화면 CSS 가 격리되는 이름(body[data-page])입니다. 공지사항과 팀 게시판은 board.css 를 함께 씁니다.
// 관리자 메뉴의 구역은 주소가 각각 다르지만 전부 settings.css 를 씁니다. 목록은 lib/adminMenu.ts 에서 가져와,
// 구역을 추가할 때 이 표를 빠뜨리지 않게 합니다.
const PAGE_BY_PATH: Record<string, string> = {
  ...Object.fromEntries(ADMIN_MENU.map((item) => [item.to.slice(1), "settings"])),
  scheduler: "scheduler",
  admin: "admin",
  settings: "settings",
  notices: "board",
  board: "board",
  teams: "teams",
  profile: "profile",
};

type NavItem = { key: string; label: string; to: string };

// 휴대폰 메뉴 drawer 의 id 입니다. 상단바의 햄버거 버튼이 popoverTarget 으로 이 drawer 를 엽니다.
const MENU_ID = "shellmenu";

// 본문 상자의 id 입니다. 계정 조회 실패 안내가 사라진 뒤 초점을 이 상자로 옮깁니다.
const PAGE_ID = "shellpage";

// 프로필 popover 의 id 입니다. 프로필 버튼이 popoverTarget 으로 이 popover 를 엽니다.
const PROFILE_POP_ID = "profileMenuPop";

// NavLink 는 주소가 to 와 같거나 그 아래(/notices/new 등)이면 aria-current="page" 를 붙입니다.
// 사이드바에 없는 화면(프로필 설정)에서는 아무 항목도 켜지지 않습니다.
function NavList({ items }: { items: readonly NavItem[] }) {
  return (
    <nav>
      {items.map((item) => <NavLink key={item.key} to={item.to}>{item.label}</NavLink>)}
    </nav>
  );
}

/** 사이드바와 휴대폰 메뉴 drawer 가 함께 쓰는 메뉴 목록입니다. 관리자 메뉴는 권한이 있을 때만 붙습니다. */
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

/** body 에 data-shell 속성을 붙입니다. AppShell 이 화면에 있는 동안만 유지됩니다. */
function useShellBodyMark(): void {
  // shell.css 가 이 속성으로 공통 layout(상단바·사이드바·탭·카드)의 스타일을 적용합니다. 계정·랜딩 화면에는 없습니다.
  // AppShell 이 유지되므로 로그인 뒤 화면 사이를 이동하는 동안에는 삭제되지 않습니다.
  // useEffect 는 화면을 그린 뒤 실행되어 shell.css 가 적용되지 않은 화면이 한 번 그려집니다. useLayoutEffect 는 그리기 전에 실행되어 이를 막습니다.
  useLayoutEffect(() => {
    document.body.dataset.shell = "";
    return () => { delete document.body.dataset.shell; };
  }, []);
}

/** 계정 조회 실패 안내 줄의 사유(meWhy)와 다시 불러오기(retryMe)입니다. retrying 은 사용자가 누른 재조회가 진행 중인지입니다. */
function useMeRetry(meState: LoadState): { meWhy: string; retrying: boolean; retryMe: () => Promise<void> } {
  const client = useQueryClient();
  // 사용자가 누른 재조회가 진행 중인지입니다. 20초 간격 polling(main.tsx)의 재조회와 구분합니다 — polling까지
  // 표시하면 안내 문구가 20초마다 바뀌고 role="alert" 이 그때마다 다시 읽힙니다.
  const [retrying, setRetrying] = useState(false);

  // 마지막으로 받은 실패 사유를 보관합니다. 받아 둔 값이 없는 조회를 다시 조회하면 TanStack Query 가
  // error 를 null 로 되돌리므로(query-core 의 fetchState), meState 를 그대로 표시하면 20초 간격
  // polling(main.tsx)마다 사유가 사라졌다 다시 나타나고 role="alert" 이 그때마다 다시 읽힙니다.
  // 렌더 중에 state 를 변경하는 것은 값이 바뀐 즉시 같은 렌더에 반영하는 React 의 방식입니다.
  const failedWhy = meState.kind === "failed" ? meState.why : "";
  const [meWhy, setMeWhy] = useState("");
  if (failedWhy !== "" && failedWhy !== meWhy) setMeWhy(failedWhy);

  /** 계정과 팀 목록을 함께 다시 조회합니다. 두 조회를 invalidateQueries 로 함께 무효화합니다. */
  async function retryMe(): Promise<void> {
    if (retrying) return;
    setRetrying(true);
    const pressed = document.activeElement;
    await Promise.all([
      client.invalidateQueries({ queryKey: ME_KEY }),
      client.invalidateQueries({ queryKey: TEAMS_KEY, exact: true }),
    ]);
    setRetrying(false);
    // 조회가 성공하면 안내 줄이 DOM 에서 삭제되어 초점이 body 로 이동합니다. 본문으로 옮겨, 키보드 사용자가
    // 화면 맨 위부터 다시 탐색하지 않게 합니다. 기다리는 동안 사용자가 초점을 다른 요소로 옮겼으면
    // 그 초점을 빼앗지 않습니다. 다시 실패했으면 안내 줄이 남아 초점이 버튼에 그대로 있습니다.
    const kept = document.activeElement === pressed || document.activeElement === document.body;
    if (kept && client.getQueryData(ME_KEY) !== undefined) document.getElementById(PAGE_ID)?.focus();
  }

  return { meWhy, retrying, retryMe };
}

/** 로그인 뒤 화면의 layout route 입니다. 화면을 이동해도 유지되고 Outlet 안의 화면만 교체됩니다. */
export function AppShell() {
  const { pathname } = useLocation();
  const toast = useToast();
  usePage(PAGE_BY_PATH[pathname.split("/")[1]] ?? "");
  useShellBodyMark();
  const { me, meState, meUnresolved } = useMe();
  const { meWhy, retrying, retryMe } = useMeRetry(meState);

  // 가진 권한으로 필터링합니다. 계정을 아직 받지 못했으면 아무것도 표시되지 않습니다.
  const managerNav = MANAGER_NAV.filter((item) => item.needs.some((need) => can(me, need)));
  // 팀 메뉴 이름만 권한에 따라 "팀 관리"·"내 팀"으로 변경됩니다. 주소와 key 는 같습니다.
  const nav = NAV.map((item) =>
    item.key === "find-team" ? { ...item, label: teamNavLabel(me) } : item,
  );

  return (
    <>
      <header className="top">
        <div className="in">
          {/* 휴대폰(767px 이하)에서만 보입니다. 넓은 창에서는 사이드바가 늘 보이므로 CSS 가 숨깁니다. */}
          <IconButton className="menubtn" label="메뉴 열기" icon={<WideMenuIcon />} popoverTarget={MENU_ID} />
          <Link className="logo" to="/scheduler" aria-label="banblit 홈"><BrandLockup /></Link>
          <ThemeButton />
          <NotificationMenu />
          <ProfileMenu />
        </div>
      </header>

      {/* /me 조회가 실패하고 받아 둔 값도 없으면 me 가 null 이 되어 권한 판정 9곳이 전부 "권한 없음" 과 같아집니다.
          사유를 이 한 곳에서 알립니다 — AppShell 은 로그인 후 7개 화면을 모두 감싸므로 호출부마다 안내를 넣지
          않아도 됩니다. 판정이 meState 가 아닌 이유는 lib/loading 의 stillUnresolved 에 있습니다.
          영향을 사유보다 앞에 두는 이유는, 서버가 detail 을 주지 않으면 사유가 "500 Internal Server Error"
          처럼 마침표 없이 끝나(lib/api.ts 의 기본 문구) 뒤 문장과 한 문장으로 붙기 때문입니다. */}
      {!meUnresolved ? null : (
        <div className="mecut" role="alert" aria-label="계정 조회 실패">
          <p>
            <b>계정 정보를 불러오지 못했어요</b>{" "}
            권한이 필요한 메뉴는 표시되지 않아요.{meWhy === "" ? "" : ` 사유: ${meWhy}`}
          </p>
          {/* disabled 가 아니라 aria-disabled 입니다. 초점을 가진 버튼이 disabled 가 되면 브라우저가 초점을
              body 로 옮겨, 재조회가 다시 실패했을 때 키보드 사용자가 버튼으로 되돌아올 수 없습니다. */}
          <Button kind="danger" aria-disabled={retrying} onClick={() => void retryMe()}>
            {retrying ? LOADING_TEXT : "다시 불러오기"}
          </Button>
        </div>
      )}

      <div className="shell">
        <aside className="side" aria-label="메뉴">
          <div className="inner"><MenuItems nav={nav} managerNav={managerNav} /></div>
        </aside>

        {/* tabIndex -1 은 키보드 Tab 순서에 넣지 않고 코드로만 초점을 옮길 수 있게 합니다(retryMe). */}
        <div className="page" id={PAGE_ID} tabIndex={-1}><Outlet /></div>
      </div>

      {/* 휴대폰 메뉴 drawer 입니다(Material Design modal drawer). .drawer 가 화면 전체를 덮으므로 .sheet 바깥을 누른 click 은
          .drawer 가 받아 drawer 를 닫고, drawer 아래 버튼에는 전달되지 않습니다. 링크를 누를 때도 닫습니다. Esc 는 브라우저가 닫습니다. */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- 링크와 drawer 바깥을 눌렀을 때 drawer 를 닫습니다. Escape 는 popover="auto" 가 처리합니다. */}
      <div
        id={MENU_ID}
        popover="auto"
        className="drawer"
        role="dialog"
        aria-label="메뉴"
        onClick={(event) => {
          if (event.target === event.currentTarget || (event.target as HTMLElement).closest("a")) event.currentTarget.hidePopover();
        }}
      >
        <div className="sheet">
          <CloseButton className="x" label="메뉴 닫기" popoverTarget={MENU_ID} popoverTargetAction="hide" />
          <MenuItems nav={nav} managerNav={managerNav} />
        </div>
      </div>

      <div className={toast ? "toast on" : "toast"} role="status" aria-live="polite">
        {toast}
      </div>
    </>
  );
}

/** 상단바의 라이트·다크 전환 버튼입니다. 누를 때마다 반대 테마로 전환하고, 선택한 값은 브라우저에 저장합니다.
 *  아이콘은 누르면 전환될 테마를 표시합니다. */
function ThemeButton() {
  // 초기값을 한 번만 읽습니다. 이후에는 사용자가 선택한 값을 씁니다.
  const [theme, setTheme] = useState<Theme>(() => readSavedTheme());
  const next: Theme = theme === "dark" ? "light" : "dark";
  return (
    <IconButton
      className="theme"
      label={next === "dark" ? "다크 모드로 전환" : "라이트 모드로 전환"}
      icon={next === "dark" ? <MoonIcon /> : <SunIcon />}
      onClick={() => setTheme(applyTheme(next))}
    />
  );
}

/** 상단 오른쪽 프로필 버튼 + 프로필 카드입니다. 여러 화면에서 함께 씁니다.
 *  "프로필 설정"은 이 프로필 카드에서 `/profile`로 들어가는 유일한 입구입니다. */
/** 프로필 popover 를 닫고 이동하는 함수 2개입니다. closeAnd(path) 는 popover 를 닫고 path 로 이동합니다.
 *  logOutAndLeave 는 로그아웃 요청 뒤 로그인 화면으로 이동합니다. 서버 호출이 실패해도 이동합니다. 표시용 cookie(브라우저가 저장해
 *  요청마다 함께 보내는 값)가 남아 있어도 다음 요청은 401 로 거절되므로 현재 화면을 유지할 이유가 없습니다. */
function useLogOut(): { closeAnd: (path: string) => void; logOutAndLeave: () => Promise<void> } {
  const navigate = useNavigate();
  const closeAnd = (path: string): void => {
    document.getElementById(PROFILE_POP_ID)?.hidePopover();
    void navigate(path);
  };
  const logOutAndLeave = async (): Promise<void> => {
    document.getElementById(PROFILE_POP_ID)?.hidePopover();
    try {
      await logOut();
    } catch {
      // 오류를 무시합니다. 아래에서 로그인 화면으로 이동합니다.
    }
    void navigate("/login");
  };
  return { closeAnd, logOutAndLeave };
}

function ProfileMenu() {
  const [open, setOpen] = useState(false);
  const { closeAnd, logOutAndLeave } = useLogOut();
  const { me } = useMe();
  const teams = useMyTeamCohorts();
  const name = me?.name ?? "";
  const sub = roleLabel(me);

  return (
    // display:contents 이므로 자리를 차지하지 않습니다. 상단바의 배치는 그대로 둡니다.
    <div className="profwrap">
      <button className="profbtn" aria-expanded={open} popoverTarget={PROFILE_POP_ID}>
        <Avatar id={me?.id ?? null} name={name} photo={me?.avatar ?? null} />
        <span className="nm">{name}</span>
        <span className="ar" aria-hidden="true">▾</span>
      </button>
      <Popover id={PROFILE_POP_ID} label="내 프로필" className="pop" onOpenChange={setOpen}>
        <div className="who">
          <Avatar id={me?.id ?? null} name={name} photo={me?.avatar ?? null} />
          <div><b>{name}</b><small>{sub}</small></div>
        </div>
        <hr />
        <div className="cap">소속 팀 {teams.length}개</div>
        {teams.map((team) => (
          <div className="tm" key={team.id}>
            <i style={{ background: `var(--${team.colorKey})` }} />{team.name}
            {/* 명단이 아직 오지 않았으면 아무것도 표시하지 않습니다. 없는 값을 생성하지 않습니다. */}
            <small>{cohortLabel(team.cohort)}</small>
          </div>
        ))}
        <hr />
        <MenuItem onClick={() => closeAnd("/profile")}>
          프로필 설정<span>›</span>
        </MenuItem>
        <MenuItem className="quit" onClick={() => void logOutAndLeave()}>로그아웃</MenuItem>
      </Popover>
    </div>
  );
}
